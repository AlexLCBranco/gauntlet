import { expect, test, type Page } from "./test";

/**
 * Clearer saving (owner, Edges round item 2; src/backup/save.ts,
 * SaveStatus.tsx). One status on the whiteboard; the whole site saved to
 * the picked folder as one current file a few seconds after a change, with
 * dated copies; Ctrl+S; one Restore list; a restore can be undone.
 *
 * The folder picker itself can't be clicked by a test: the "picked folder"
 * is a folder in the browser's private file system (OPFS), put where the
 * picker's would go (as folder-backup.e2e.ts does).
 */

const FOLDER_DB = "gauntlet-backup-folder";
const DIR = "test-saves";

async function useTestFolder(page: Page) {
  await page.evaluate(
    async ({ db: name, dir }) => {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle(dir, { create: true });
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(name, 1);
        open.onupgradeneeded = () => open.result.createObjectStore("handles");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("handles", "readwrite");
        tx.objectStore("handles").put(folder, "folder");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      window.dispatchEvent(new Event("gauntlet:backup-folder-changed"));
    },
    { db: FOLDER_DB, dir: DIR },
  );
}

async function folderFiles(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async (dir) => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle(dir, { create: true });
    const out: Record<string, string> = {};
    for await (const entry of (folder as any).values()) if (entry.kind === "file") out[entry.name] = await (await entry.getFile()).text();
    return out;
  }, DIR);
}

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** A text on the page saying `t` (set up: the text tool is tested elsewhere). */
const addText = (page: Page, t: string) =>
  page.evaluate((t) => {
    (window as any).editor.createShape({ type: "text", x: 200, y: 200 + Math.random() * 300, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] } } });
    (window as any).editor.selectNone();
  }, t);

const texts = (page: Page) =>
  page.evaluate(() =>
    ((window as any).editor.getCurrentPageShapes() as any[])
      .filter((s) => s.type === "text")
      .map((s) => s.props.richText.content[0].content[0].text as string)
      .sort(),
  );

/** Every localStorage key but the save's own notes. */
const storage = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!/^gauntlet:(auto-backup|folder-backup)$/.test(k)) out[k] = localStorage.getItem(k)!;
    }
    return out;
  });

const status = (page: Page) => page.getByTestId("save-status");

test.describe("one save", () => {
  test.setTimeout(120_000);

  test("status: Saved, Saving… after an edit, Saved again with the change in the folder's one file; hover says when and where", async ({ page }) => {
    await open(page);
    await useTestFolder(page);
    await expect(status(page)).toHaveText("Saved", { timeout: 15_000 });
    await addText(page, "first-edit-7731");
    await expect(status(page)).toHaveText("Saving…");
    await expect(status(page)).toHaveText("Saved", { timeout: 15_000 });
    const files = await folderFiles(page);
    expect(files["gauntlet-save.json"]).toContain("first-edit-7731");
    await expect(status(page)).toHaveAttribute("title", new RegExp(`Last saved to your folder “${DIR}” at Today \\d\\d:\\d\\d`));
    // A change in another app's storage (a board, a note) saves too.
    await page.evaluate(() => localStorage.setItem("ck:notes:v1", JSON.stringify({ "0022500001": { pre: "note-save-42", live: "", post: "", shown: "pre" } })));
    await expect(status(page)).toHaveText("Saving…");
    await expect(status(page)).toHaveText("Saved", { timeout: 15_000 });
    expect((await folderFiles(page))["gauntlet-save.json"]).toContain("note-save-42");
  });

  test("a failed write shows a red Not saved; the next good save clears it", async ({ page }) => {
    await open(page);
    await useTestFolder(page);
    await expect(status(page)).toHaveText("Saved", { timeout: 15_000 });
    await page.evaluate(() => {
      const w = window as any;
      w.__own = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = async () => {
        throw new DOMException("disk full (test)", "QuotaExceededError");
      };
    });
    await addText(page, "will-fail");
    await expect(status(page)).toHaveText("Not saved", { timeout: 15_000 });
    await expect(status(page)).toHaveAttribute("data-phase", "failed");
    expect(await status(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(198, 40, 40)");
    await expect(status(page)).toHaveAttribute("title", /NOT SAVED/);
    await page.evaluate(() => {
      FileSystemFileHandle.prototype.createWritable = (window as any).__own;
    });
    await addText(page, "works-again");
    await expect(status(page)).toHaveText("Saved", { timeout: 15_000 });
  });

  test("Ctrl+S saves at once and says Saved to folder; it leaves a dated copy", async ({ page }) => {
    await open(page);
    await useTestFolder(page);
    await expect(status(page)).toHaveText("Saved", { timeout: 15_000 });
    const before = Object.keys(await folderFiles(page)).filter((n) => n.startsWith("gauntlet-auto-")).length;
    await addText(page, "ctrl-s-5512");
    await page.mouse.move(600, 500);
    await page.keyboard.press("Control+s");
    await expect(status(page)).toHaveText("Saved to folder", { timeout: 10_000 });
    const files = await folderFiles(page);
    expect(files["gauntlet-save.json"]).toContain("ctrl-s-5512");
    const dated = Object.keys(files).filter((n) => n.startsWith("gauntlet-auto-"));
    // At least the Ctrl+S copy (the automatic backup made 3 s after opening
    // may land here too: it did on the live site).
    expect(dated.length).toBeGreaterThanOrEqual(before + 1);
    expect(files[dated.sort().at(-1)!]).toContain("ctrl-s-5512");
    await expect(status(page)).toHaveText("Saved", { timeout: 6_000 });
  });

  test("Restore: every copy by date in plain words; one click restores exactly (Slate notes included); the restore can be undone", async ({ page }) => {
    await open(page);
    await useTestFolder(page);
    // State A: a text, a Slate note, a tray-like key.
    await addText(page, "state-A");
    await page.evaluate(() => {
      localStorage.setItem("ck:notes:v1", JSON.stringify({ "0022500001": { pre: "note A", live: "", post: "", shown: "pre" } }));
      localStorage.setItem("gauntlet:test-extra", "A");
    });
    await page.keyboard.press("Control+s");
    await expect(status(page)).toHaveText("Saved to folder", { timeout: 10_000 });
    const a = await storage(page);
    // State B.
    await page.evaluate(() => {
      const e = (window as any).editor;
      e.deleteShapes(e.getCurrentPageShapes().map((s: any) => s.id));
      localStorage.setItem("ck:notes:v1", JSON.stringify({ "0022500001": { pre: "note B", live: "", post: "", shown: "live" } }));
      localStorage.removeItem("gauntlet:test-extra");
    });
    await addText(page, "state-B");
    await expect(status(page)).toHaveText("Saved", { timeout: 15_000 });
    const b = await storage(page);
    expect(b).not.toEqual(a);

    await status(page).click();
    const list = page.getByTestId("restore-list");
    await expect(list).toBeVisible();
    const copies = list.getByTestId("restore-copy");
    await expect(copies.first()).toContainText(/^Today \d\d:\d\d/);
    await expect(list.locator('[data-source="folder"]').first()).toContainText(/page/);
    // The dated copy Ctrl+S made (state A): the oldest folder copy.
    const datedA = list.locator('[data-source="folder"]:not([data-key="gauntlet-save.json"])').last();
    await expect(datedA).toContainText(/\d+ pages? · \d+ boards? · \d+ maps?/, { timeout: 10_000 });
    await Promise.all([page.waitForURL("**/backup/**", { timeout: 30_000 }), datedA.click()]);
    await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
    await page.waitForFunction(() => "editor" in window);
    await expect.poll(() => texts(page)).toEqual(["state-A"]);
    expect(await storage(page)).toEqual(a);

    // Undo the restore: the copy kept just before it.
    await status(page).click();
    const undo = page.getByTestId("restore-list").locator('[data-source="browser"]', { hasText: "before a restore" }).first();
    await expect(undo).toBeVisible();
    await Promise.all([page.waitForURL("**/backup/**", { timeout: 30_000 }), undo.click()]);
    await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
    await page.waitForFunction(() => "editor" in window);
    await expect.poll(() => texts(page)).toEqual(["state-B"]);
    const back = await storage(page);
    expect(back["ck:notes:v1"]).toBe(b["ck:notes:v1"]);
    expect(back["gauntlet:test-extra"]).toBeUndefined();
  });
});
