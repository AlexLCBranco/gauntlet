import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "./test";

import { whiteboardSaved } from "./helpers";

/**
 * Saving that scales (speed session, Part 1; src/backup/). The folder's
 * saves are split: a small file with everything but pictures, and each
 * picture a file of its own in the folder's "gauntlet-images", written
 * once. A failed save never reads "Saved". A save is restored with its
 * pictures in one action, or refused whole when one is missing. Old
 * one-file backups still restore, and one is written before a folder's
 * first split save.
 *
 * The "picked folder" is a folder in the browser's private file system
 * (OPFS), as in save.e2e.ts: the picker can't be clicked by a test.
 */

const FOLDER_DB = "gauntlet-backup-folder";
const DIR = "split-saves";
const IMAGES = "gauntlet-images";

/** Puts the test folder where the picked folder goes (made if missing),
    with these files first. `images`: files in its pictures folder. */
async function useTestFolder(page: Page, files: Record<string, string> = {}, images: Record<string, string> = {}) {
  await page.evaluate(
    async ({ db: name, dir, files, images, imagesDir }) => {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle(dir, { create: true });
      const put = async (d: FileSystemDirectoryHandle, n: string, text: string) => {
        const w = await (await d.getFileHandle(n, { create: true })).createWritable();
        await w.write(text);
        await w.close();
      };
      for (const [n, text] of Object.entries(files)) await put(folder, n, text);
      if (Object.keys(images).length > 0) {
        const pics = await folder.getDirectoryHandle(imagesDir, { create: true });
        for (const [n, text] of Object.entries(images)) await put(pics, n, text);
      }
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
    { db: FOLDER_DB, dir: DIR, files, images, imagesDir: IMAGES },
  );
}

interface FolderFile {
  size: number;
  modified: number;
  /** Its text, for .json and .txt files. */
  text?: string;
}
/** The test folder: its files, and its pictures folder's. */
const folder = (page: Page) =>
  page.evaluate(
    async ({ dir, imagesDir }) => {
      const root = await navigator.storage.getDirectory();
      const top = await root.getDirectoryHandle(dir, { create: true });
      const read = async (d: FileSystemDirectoryHandle) => {
        const out: Record<string, FolderFile> = {};
        for await (const entry of (d as any).values()) {
          if (entry.kind !== "file") continue;
          const f: File = await entry.getFile();
          out[entry.name] = { size: f.size, modified: f.lastModified, ...(/\.(json|txt)$/.test(entry.name) ? { text: await f.text() } : {}) };
        }
        return out;
      };
      let images: Record<string, FolderFile> | null = null;
      try {
        images = await read(await top.getDirectoryHandle(imagesDir));
      } catch {
        images = null;
      }
      return { files: await read(top), images };
    },
    { dir: DIR, imagesDir: IMAGES },
  );

const removePicture = (page: Page, name: string) =>
  page.evaluate(
    async ({ dir, imagesDir, name }) => {
      const root = await navigator.storage.getDirectory();
      await (await (await root.getDirectoryHandle(dir)).getDirectoryHandle(imagesDir)).removeEntry(name);
    },
    { dir: DIR, imagesDir: IMAGES, name },
  );

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const addText = (page: Page, t: string) =>
  page.evaluate((t) => {
    const e = (window as any).editor;
    e.createShape({ type: "text", x: 200, y: 200 + Math.random() * 300, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] } } });
    e.selectNone();
  }, t);

/** Pastes `n` different pictures (as dropped files) on the current page. */
async function addPictures(page: Page, n: number, tag: string) {
  await page.evaluate(
    async ({ n, tag }) => {
      const editor = (window as any).editor;
      const files: File[] = [];
      for (let i = 0; i < n; i++) {
        const c = document.createElement("canvas");
        c.width = 320;
        c.height = 180;
        const g = c.getContext("2d")!;
        g.fillStyle = `hsl(${(i * 67 + tag.length * 40) % 360} 50% 35%)`;
        g.fillRect(0, 0, 320, 180);
        g.fillStyle = "#fff";
        g.font = "22px sans-serif";
        g.fillText(`${tag} ${i} ${Math.random().toString(36).slice(2)}`, 16, 96);
        const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), "image/png"));
        files.push(new File([blob], `${tag}-${i}.png`, { type: "image/png" }));
      }
      await editor.putExternalContent({ type: "files", files, point: { x: 500, y: 400 } });
      editor.selectNone();
    },
    { n, tag },
  );
  await expect.poll(() => page.evaluate(() => ((window as any).editor.getAssets() as any[]).every((a) => a.props.src?.startsWith("asset:")))).toBe(true);
}

const status = (page: Page) => page.getByTestId("save-status");
const saved = (page: Page) => expect(status(page)).toHaveText("Saved", { timeout: 20_000 });

async function ctrlS(page: Page) {
  await whiteboardSaved(page);
  await page.mouse.move(700, 500);
  await page.keyboard.press("Control+s");
  await expect(status(page)).toHaveText("Saved to folder", { timeout: 20_000 });
}

/**
 * Everything the site keeps in this browser, comparable: every localStorage
 * key and every database record (but the backups' own, and tldraw's
 * per-tab session), each picture as its type, size and SHA-256.
 */
const everything = (page: Page) =>
  page.evaluate(async () => {
    const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
    const plain = async (v: unknown): Promise<unknown> => {
      if (v instanceof Blob) return { picture: hex(await crypto.subtle.digest("SHA-256", await v.arrayBuffer())), type: v.type, size: v.size };
      if (v instanceof Date) return { date: v.toISOString() };
      if (Array.isArray(v)) return Promise.all(v.map(plain));
      if (v && typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(v).sort()) out[k] = await plain((v as Record<string, unknown>)[k]);
        return out;
      }
      return v;
    };
    const local: Record<string, string> = {};
    for (const k of Object.keys(localStorage).sort()) if (!/^gauntlet:(auto-backup|folder-backup)$/.test(k)) local[k] = localStorage.getItem(k)!;
    const dbs: Record<string, unknown> = {};
    let pictures = 0;
    for (const { name } of await indexedDB.databases()) {
      if (!name || name === "gauntlet-auto-backups" || name === "gauntlet-backup-folder") continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        if (name.startsWith("TLDRAW_DOCUMENT") && store === "session_state") continue;
        const os = db.transaction(store).objectStore(store);
        const [keys, values] = await Promise.all([
          new Promise<IDBValidKey[]>((res) => (os.getAllKeys().onsuccess = (e) => res((e.target as IDBRequest).result))),
          new Promise<unknown[]>((res) => (os.getAll().onsuccess = (e) => res((e.target as IDBRequest).result))),
        ]);
        for (let i = 0; i < keys.length; i++) {
          if (values[i] instanceof Blob) pictures++;
          dbs[`${name}/${store}/${JSON.stringify(keys[i])}`] = await plain(values[i]);
        }
      }
      db.close();
    }
    return { local, dbs, pictures };
  });

/** As a cleared browser or a new computer: every database and all of
    localStorage gone (the folder on disk, here OPFS, stays). */
async function wipeBrowser(page: Page) {
  await page.goto("/backup/");
  await page.evaluate(async () => {
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue;
      await new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase(name);
        r.onsuccess = r.onerror = r.onblocked = () => resolve();
      });
    }
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
}

/** A whiteboard of 3 pages with pictures and texts, a Boardkit picture, a
    setting; saved to the folder with Ctrl+S. */
async function seedAndSave(page: Page) {
  await open(page);
  await useTestFolder(page);
  await addPictures(page, 2, "one");
  await addText(page, "page-one-text");
  for (const name of ["Two", "Three"]) {
    await page.evaluate((name) => {
      const e = (window as any).editor;
      e.createPage({ name });
      e.setCurrentPage(e.getPages().at(-1).id);
    }, name);
    await addPictures(page, name === "Two" ? 3 : 1, name);
    await addText(page, `text-on-${name}`);
  }
  await page.evaluate(async () => {
    localStorage.setItem("gauntlet:split-test", "kept");
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("boardkit", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onsuccess = () => {
        const tx = open.result.transaction("kv", "readwrite");
        tx.objectStore("kv").put(new Blob([new Uint8Array(9000).map((_, i) => (i * 13) % 256)], { type: "image/jpeg" }), "boardImage:split-test");
        tx.oncomplete = () => (open.result.close(), resolve());
        tx.onerror = () => reject(tx.error);
      };
    });
    (window as any).editor.setCurrentPage((window as any).editor.getPages()[0].id);
  });
  await ctrlS(page);
  await saved(page);
}

const restoreCurrent = async (page: Page) => {
  const list = page.getByRole("list", { name: "Saves in the folder" });
  const current = list.getByRole("listitem").filter({ hasText: "current" });
  await expect(current).toContainText("3 whiteboard pages", { timeout: 20_000 });
  await current.getByRole("button", { name: "Restore this" }).click();
  const dialog = page.getByRole("dialog", { name: "Replace what's here with this backup?" });
  await expect(dialog).toBeVisible();
  return dialog;
};

test.describe("split save", () => {
  test.setTimeout(180_000);

  test("a save that can't be made reads Not saved (red), never Saved; the next good one clears it", async ({ page }) => {
    await open(page);
    await useTestFolder(page);
    await addText(page, "before");
    await saved(page);
    // Reading the site's data fails.
    await page.evaluate(() => {
      const w = window as any;
      w.__key = Storage.prototype.key;
      Storage.prototype.key = () => {
        throw new Error("storage unreadable (test)");
      };
    });
    await addText(page, "will-not-save");
    await expect(status(page)).toHaveText("Not saved", { timeout: 20_000 });
    await expect(status(page)).toHaveAttribute("data-phase", "failed");
    await expect(status(page)).toHaveAttribute("title", /NOT SAVED: The save could not be made: storage unreadable \(test\)/);
    expect(await status(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(198, 40, 40)");
    // It stays red while nothing has been saved, also through Ctrl+S failing again.
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(1500);
    await expect(status(page)).toHaveText("Not saved");
    expect((await folder(page)).files["gauntlet-save.json"]!.text).not.toContain("will-not-save");
    await page.evaluate(() => {
      Storage.prototype.key = (window as any).__key;
    });
    await addText(page, "works-again");
    await saved(page);
    expect((await folder(page)).files["gauntlet-save.json"]!.text).toContain("will-not-save");
  });

  test("the folder's save is a small file plus each picture as its own file, written once; a small edit writes no picture again", async ({ page }) => {
    await open(page);
    await useTestFolder(page);
    await addPictures(page, 3, "pic");
    await addText(page, "split-edit-1");
    await saved(page);
    const first = await folder(page);
    const save = JSON.parse(first.files["gauntlet-save.json"]!.text!);
    expect(save.format).toBe("gauntlet-backup");
    expect(save.version).toBe(2);
    expect(first.files["gauntlet-save.json"]!.text).not.toContain('"kind":"blob"');
    expect(first.files["gauntlet-save.json"]!.text).toContain("split-edit-1");
    // Three pictures: three files, named in the save, each as big as its picture.
    const sizes = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res) => (indexedDB.open("TLDRAW_DOCUMENT_v2gauntlet-whiteboard").onsuccess = (e) => res((e.target as IDBOpenDBRequest).result)));
      const blobs = await new Promise<Blob[]>((res) => (db.transaction("assets").objectStore("assets").getAll().onsuccess = (e) => res((e.target as IDBRequest).result)));
      db.close();
      return blobs.map((b) => b.size).sort((a, b) => a - b);
    });
    expect(Object.keys(first.images!).sort()).toEqual([...save.images].sort());
    expect(save.images).toHaveLength(3);
    expect(Object.values(first.images!).map((f) => f.size).sort((a, b) => a - b)).toEqual(sizes);
    // A new folder holds no old saves: no old-format backup is written.
    expect(Object.keys(first.files).filter((n) => n.startsWith("gauntlet-full-backup"))).toEqual([]);

    // A small edit: the save is rewritten, no picture is.
    await page.evaluate(() => performance.clearMeasures("gauntlet:folder-write"));
    await addText(page, "split-edit-2");
    await expect(status(page)).toHaveText("Saving…");
    await saved(page);
    const second = await folder(page);
    expect(second.files["gauntlet-save.json"]!.text).toContain("split-edit-2");
    expect(second.images).toEqual(first.images);
    const writes = await page.evaluate(() => performance.getEntriesByName("gauntlet:folder-write").map((m) => (m as PerformanceMeasure).detail));
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w.picturesWritten).toBe(0);
    // And reading the site for it touched a few KB of each picture, not the pictures.
    const snaps = await page.evaluate(() => performance.getEntriesByName("gauntlet:snapshot").map((m) => (m as PerformanceMeasure).detail));
    expect(snaps.at(-1).pictures).toBe(3);
    expect(snaps.at(-1).sampledBytes).toBeLessThanOrEqual(3 * 3 * 4096);

    // Ctrl+S: the dated copy is split too, and shares the same picture files.
    await ctrlS(page);
    const third = await folder(page);
    const dated = Object.keys(third.files).filter((n) => n.startsWith("gauntlet-auto-")).sort().at(-1)!;
    expect(JSON.parse(third.files[dated]!.text!).images.sort()).toEqual([...save.images].sort());
    expect(third.images).toEqual(first.images);
  });

  test("save, wipe the browser, restore from the folder on the backup page: every page, picture and setting is back", async ({ page }) => {
    await seedAndSave(page);
    const before = await everything(page);
    expect(before.pictures).toBe(7); // 6 on the whiteboard, 1 of Boardkit's
    expect(Object.keys((await folder(page)).images!)).toHaveLength(7);

    await wipeBrowser(page);
    expect((await everything(page)).local).toEqual({});
    // The owner chooses the same folder again (the picker itself: by hand).
    await useTestFolder(page);
    await page.reload();
    const dialog = await restoreCurrent(page);
    const [safety] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Replace with this backup" }).click()]);
    expect(safety.suggestedFilename()).toMatch(/^gauntlet-before-restore-/);
    await expect(page.getByRole("status")).toContainText("Restored", { timeout: 30_000 });
    await expect(page.getByRole("status")).toContainText("3 whiteboard pages");

    const after = await everything(page);
    expect(after.dbs).toEqual(before.dbs);
    expect(after.local).toEqual(before.local);
    expect(after.pictures).toBe(7);

    // And the whiteboard shows them: each page's texts, each picture drawn.
    await open(page);
    const want: Record<string, { pictures: number; text: string }> = { "Page 1": { pictures: 2, text: "page-one-text" }, Two: { pictures: 3, text: "text-on-Two" }, Three: { pictures: 1, text: "text-on-Three" } };
    const pages = await page.evaluate(() => ((window as any).editor.getPages() as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name })));
    expect(pages.map((p) => p.name)).toEqual(Object.keys(want));
    for (const p of pages) {
      await page.evaluate((id) => void (window as any).editor.setCurrentPage(id), p.id);
      const shapes = await page.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).map((s) => (s.type === "text" ? s.props.richText.content[0].content[0].text : s.type)));
      expect(shapes.filter((s) => s === "image")).toHaveLength(want[p.name]!.pictures);
      expect(shapes).toContain(want[p.name]!.text);
      await expect
        .poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".tl-canvas img")].filter((i) => i.complete && i.naturalWidth === 320).length), { timeout: 15_000 })
        .toBe(want[p.name]!.pictures);
    }
  });

  test("a picture file missing from the folder: the restore is refused, says which, and changes nothing", async ({ page }) => {
    await seedAndSave(page);
    const gone = Object.keys((await folder(page)).images!).sort()[0]!;
    await wipeBrowser(page);
    await useTestFolder(page);
    await removePicture(page, gone);
    await page.reload();
    await page.evaluate(() => localStorage.setItem("gauntlet:here-now", "untouched"));
    const dialog = await restoreCurrent(page);
    let downloads = 0;
    page.on("download", () => downloads++);
    await dialog.getByRole("button", { name: "Replace with this backup" }).click();
    const said = page.getByRole("status");
    await expect(said).toContainText("1 of this copy's 7 pictures could not be found, so nothing was restored.", { timeout: 30_000 });
    await expect(said).toContainText(`“${DIR}/${IMAGES}”`);
    await expect(said).toContainText(gone);
    // Nothing of the copy arrived, nothing here was replaced, nothing downloaded.
    const now = await everything(page);
    expect(now.local["gauntlet:here-now"]).toBe("untouched");
    expect(now.local["gauntlet:split-test"]).toBeUndefined();
    expect(now.pictures).toBe(0);
    expect(downloads).toBe(0);
  });

  test("a one-file backup made before this change still restores: pages, texts, its picture, a setting", async ({ page }) => {
    const old = await readFile(path.resolve("e2e/fixtures/backup-v1-before-split.json"));
    expect(JSON.parse(old.toString()).version).toBe(1);
    await page.goto("/backup/");
    await page.getByLabel("Backup file").setInputFiles({ name: "gauntlet-backup-2026-11-12-0620.json", mimeType: "application/json", buffer: old });
    const dialog = page.getByRole("dialog", { name: "Replace what's here with this backup?" });
    await expect(dialog).toContainText("2 whiteboard pages");
    await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Replace with this backup" }).click()]);
    await expect(page.getByRole("status")).toContainText("Restored");
    expect(await page.evaluate(() => localStorage.getItem("gauntlet:fixture-marker"))).toBe("made-before-the-split-save");

    await open(page);
    const pages = await page.evaluate(() => ((window as any).editor.getPages() as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name })));
    expect(pages).toHaveLength(2);
    expect(pages[1]!.name).toBe("Second");
    const texts = async () => page.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).filter((s) => s.type === "text").map((s) => s.props.richText.content[0].content[0].text));
    await page.evaluate((id) => void (window as any).editor.setCurrentPage(id), pages[0]!.id);
    expect(await texts()).toEqual(["old-format page one"]);
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".tl-canvas img")].filter((i) => i.complete && i.naturalWidth === 240).length), { timeout: 15_000 }).toBe(1);
    await page.evaluate((id) => void (window as any).editor.setCurrentPage(id), pages[1]!.id);
    expect(await texts()).toEqual(["old-format page two"]);
  });

  test("a folder that already holds old one-file saves gets one complete old-format backup before its first split save, once", async ({ page }) => {
    await open(page);
    await addPictures(page, 1, "kept");
    await addText(page, "in-the-old-format-backup");
    await whiteboardSaved(page);
    // The owner's folder as it is today: a save in the old format.
    const oldSave = JSON.stringify({ format: "gauntlet-backup", version: 1, createdAt: "2026-11-01T10:00:00.000Z", site: "x", localStorage: { old: "save" }, indexedDB: [] });
    await useTestFolder(page, { "gauntlet-save.json": oldSave });
    await addText(page, "first-split-save");
    await saved(page);
    const after = await folder(page);
    const full = Object.keys(after.files).filter((n) => /^gauntlet-full-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(n));
    expect(full).toHaveLength(1);
    const backup = JSON.parse(after.files[full[0]!]!.text!);
    expect(backup.version).toBe(1);
    expect(after.files[full[0]!]!.text).toContain('"kind":"blob"');
    expect(after.files[full[0]!]!.text).toContain("in-the-old-format-backup");
    expect(backup.images).toBeUndefined();
    // Then the split save.
    expect(JSON.parse(after.files["gauntlet-save.json"]!.text!).version).toBe(2);
    expect(Object.keys(after.images!)).toHaveLength(1);
    // Later saves write no second one.
    await addText(page, "second-split-save");
    await saved(page);
    await ctrlS(page);
    expect(Object.keys((await folder(page)).files).filter((n) => n.startsWith("gauntlet-full-backup"))).toEqual(full);
  });

  test("picture files no save uses any more are removed when old copies go; ones in use, and any other file, stay", async ({ page }) => {
    await page.goto("/backup/");
    // A picture in use now (Boardkit's store).
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("boardkit", 1);
          open.onupgradeneeded = () => open.result.createObjectStore("kv");
          open.onsuccess = () => {
            const tx = open.result.transaction("kv", "readwrite");
            tx.objectStore("kv").put(new Blob([new Uint8Array(5000).map((_, i) => (i * 3) % 256)], { type: "image/png" }), "boardImage:in-use");
            tx.oncomplete = () => (open.result.close(), resolve());
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    // The folder: 40 old dated copies (10 will go), a save kept by hand that
    // uses picture b…, and in the pictures folder: b… (used by that save),
    // a… (used by nothing), and two files that aren't this code's.
    const stamp = (m: number) =>
      page.evaluate((m) => {
        const d = new Date(Date.now() - m * 60_000);
        const p = (n: number) => String(n).padStart(2, "0");
        return `gauntlet-auto-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
      }, m);
    const a = `${"a".repeat(40)}.png`;
    const b = `${"b".repeat(40)}.png`;
    const c = `${"c".repeat(40)}.png`;
    const split = (images: string[]) => JSON.stringify({ format: "gauntlet-backup", version: 2, createdAt: "2026-11-01T10:00:00.000Z", site: "x", localStorage: {}, indexedDB: [], images });
    const files: Record<string, string> = { "my-own-copy.json": split([b]), "notes.txt": "mine" };
    for (let m = 1; m <= 40; m++) files[await stamp(m)] = m === 5 ? split([c]) : m === 38 ? split([a]) : split([]);
    await useTestFolder(page, files, { [a]: "unused", [b]: "used by my own copy", [c]: "used by a dated copy that stays", "holiday.png": "not ours", "readme.txt": "not ours" });
    await page.reload();
    await page.getByRole("button", { name: "Back up in this browser now" }).click();
    await expect(page.getByRole("status")).toContainText("Backed up in this browser");

    const after = await folder(page);
    expect(Object.keys(after.files).filter((n) => n.startsWith("gauntlet-auto-"))).toHaveLength(30);
    const pictures = Object.keys(after.images!).sort();
    // a… was used only by a copy that went (38 minutes old, past the newest 30): removed.
    expect(pictures).not.toContain(a);
    expect(pictures).toContain(b);
    expect(pictures).toContain(c);
    expect(pictures).toContain("holiday.png");
    expect(pictures).toContain("readme.txt");
    // And the picture in use now is there, under the name the new copy gives it.
    const newest = Object.keys(after.files).filter((n) => n.startsWith("gauntlet-auto-")).sort().at(-1)!;
    const used = JSON.parse(after.files[newest]!.text!).images as string[];
    expect(used).toHaveLength(1);
    expect(after.images![used[0]!]!.size).toBe(5000);
    expect(pictures).toHaveLength(5);
    expect(after.files["notes.txt"]!.text).toBe("mine");
  });

  test("an in-browser automatic backup holds no pictures; it restores with the ones this browser still has, downloads as one complete file, and is refused when one is gone", async ({ page }) => {
    await page.goto("/backup/");
    const put = (key: string | null) =>
      page.evaluate(
        (key) =>
          new Promise<void>((resolve, reject) => {
            const open = indexedDB.open("boardkit", 1);
            open.onupgradeneeded = () => open.result.createObjectStore("kv");
            open.onsuccess = () => {
              const tx = open.result.transaction("kv", "readwrite");
              if (key) tx.objectStore("kv").put(new Blob([new Uint8Array(40_000).map((_, i) => (i * 11) % 256)], { type: "image/png" }), key);
              else tx.objectStore("kv").clear();
              tx.oncomplete = () => (open.result.close(), resolve());
              tx.onerror = () => reject(tx.error);
            };
          }),
        key,
      );
    await put("boardImage:browser-only");
    await page.evaluate(() => localStorage.setItem("gauntlet:auto-test", "first"));
    await page.getByRole("button", { name: "Back up in this browser now" }).click();
    await expect(page.getByRole("status")).toContainText("Backed up in this browser");
    const kept = await page.evaluate(
      () =>
        new Promise<{ json: string; size: number }[]>((resolve) => {
          const r = indexedDB.open("gauntlet-auto-backups");
          r.onsuccess = () => (r.result.transaction("backups").objectStore("backups").getAll().onsuccess = (e) => resolve((e.target as IDBRequest).result));
        }),
    );
    expect(kept).toHaveLength(1);
    expect(JSON.parse(kept[0]!.json).version).toBe(2);
    expect(kept[0]!.json).not.toContain('"kind":"blob"');
    expect(kept[0]!.size).toBeLessThan(10_000);

    const row = page.getByRole("list", { name: "Automatic backups" }).getByRole("listitem").first();
    // Download: one complete file, the picture inside.
    const [file] = await Promise.all([page.waitForEvent("download"), row.getByRole("button", { name: "Download" }).click()]);
    const text = await readFile((await file.path())!, "utf-8");
    expect(JSON.parse(text).version).toBe(1);
    expect(text).toContain('"kind":"blob"');
    expect(text.length).toBeGreaterThan(40_000);

    // Changed since; restoring puts it back, picture and all.
    await page.evaluate(() => localStorage.setItem("gauntlet:auto-test", "second"));
    await row.getByRole("button", { name: "Restore this" }).click();
    await Promise.all([page.waitForEvent("download"), page.getByRole("dialog").getByRole("button", { name: "Replace with this backup" }).click()]);
    await expect(page.getByRole("status")).toContainText("Restored");
    expect(await page.evaluate(() => localStorage.getItem("gauntlet:auto-test"))).toBe("first");
    expect((await everything(page)).pictures).toBe(1);

    // The picture gone from this browser, and no folder: refused, and it says where pictures are kept.
    await put(null);
    await page.evaluate(() => localStorage.setItem("gauntlet:auto-test", "third"));
    await page.getByRole("list", { name: "Automatic backups" }).getByRole("listitem").filter({ hasNotText: "before a restore" }).first().getByRole("button", { name: "Restore this" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Replace with this backup" }).click();
    await expect(page.getByRole("status")).toContainText("1 of this copy's 1 picture could not be found, so nothing was restored.");
    await expect(page.getByRole("status")).toContainText(`“${IMAGES}” inside your backup folder`);
    expect(await page.evaluate(() => localStorage.getItem("gauntlet:auto-test"))).toBe("third");
  });
});
