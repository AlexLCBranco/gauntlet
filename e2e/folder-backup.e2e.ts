import { expect, test, type Page } from "./test";

/**
 * Automatic backups to a folder outside the browser (`src/backup/folder.ts`).
 *
 * A real folder needs the browser's folder picker, which a test can't click.
 * So the "picked folder" is a folder in the browser's private file system
 * (OPFS): the same kind of handle, written to the same way, put where the
 * picker's would go. Only picking the folder itself is left to a person.
 */

const FOLDER_DB = "gauntlet-backup-folder";
const DIR = "test-backups";

/** Puts a test folder where the picked folder goes, with these files in it. */
async function useTestFolder(page: Page, files: string[] = []) {
  await page.evaluate(
    async ({ db: name, dir, files }) => {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle(dir, { create: true });
      for (const f of files) {
        const w = await (await folder.getFileHandle(f, { create: true })).createWritable();
        await w.write("{}");
        await w.close();
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
    },
    { db: FOLDER_DB, dir: DIR, files },
  );
}

/** The test folder's files, and the text of each backup file. */
async function folderFiles(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async (dir) => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle(dir, { create: true });
    const out: Record<string, string> = {};
    for await (const entry of (folder as any).values()) {
      if (entry.kind === "file") out[entry.name] = await (await entry.getFile()).text();
    }
    return out;
  }, DIR);
}

const autoNames = (files: Record<string, string>) => Object.keys(files).filter((n) => n.startsWith("gauntlet-auto-")).sort();

/** A name the folder code would give a backup made `minutesAgo` ago. */
async function nameAgo(page: Page, minutesAgo: number) {
  return page.evaluate((m) => {
    const d = new Date(Date.now() - m * 60_000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `gauntlet-auto-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
  }, minutesAgo);
}

async function backUpNow(page: Page) {
  await page.getByRole("button", { name: "Back up in this browser now" }).click();
  await expect(page.getByRole("status")).toContainText(/Backed up in this browser|Nothing changed/);
}

test.describe("backup folder", () => {
  test("no folder picked: the backup page and the whiteboard say so", async ({ page }) => {
    await page.goto("/backup/");
    const section = page.getByTestId("backup-folder");
    await expect(section).toContainText("never leave this browser");
    await expect(section.getByRole("button", { name: "Choose a backup folder…" })).toBeVisible();
    // The backup page shows it in its section, not as a banner.
    await expect(page.locator("[data-folder-warning]")).toHaveCount(0);

    await page.goto("/");
    const banner = page.locator('[data-folder-warning="none"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner.getByRole("link", { name: "Choose a folder" })).toHaveAttribute("href", "/backup/");
    // Dismissed: not shown again this visit.
    await banner.getByRole("button", { name: "Dismiss" }).click();
    await page.reload();
    await page.waitForTimeout(4_500);
    await expect(page.locator("[data-folder-warning]")).toHaveCount(0);
  });

  test("each automatic backup is written to the folder, only when something changed", async ({ page }) => {
    await page.goto("/backup/");
    await page.evaluate(() => localStorage.setItem("folder-test:marker", "one"));
    await useTestFolder(page);
    await page.reload();
    await backUpNow(page);

    let files = await folderFiles(page);
    expect(autoNames(files)).toHaveLength(1);
    const first = JSON.parse(files[autoNames(files)[0]]);
    expect(first.format).toBe("gauntlet-backup");
    expect(first.localStorage["folder-test:marker"]).toBe("one");
    // The folder itself and its note are never part of a backup.
    expect(first.localStorage["gauntlet:folder-backup"]).toBeUndefined();
    expect(first.indexedDB.map((d: { name: string }) => d.name)).not.toContain(FOLDER_DB);
    await expect(page.getByTestId("folder-state")).toContainText(`Saving to “${DIR}”`);

    // Nothing changed: no second file.
    await backUpNow(page);
    files = await folderFiles(page);
    expect(autoNames(files)).toHaveLength(1);

    // Changed: a second file, with the change. (A second apart, so its name differs.)
    await page.waitForTimeout(1_100);
    await page.evaluate(() => localStorage.setItem("folder-test:marker", "two"));
    await backUpNow(page);
    files = await folderFiles(page);
    expect(autoNames(files)).toHaveLength(2);
    expect(JSON.parse(files[autoNames(files)[1]]).localStorage["folder-test:marker"]).toBe("two");
  });

  test("old backups in the folder are tidied by the same rule; other files are never touched", async ({ page }) => {
    await page.goto("/backup/");
    const old: string[] = [];
    for (let m = 1; m <= 40; m++) old.push(await nameAgo(page, m));
    await useTestFolder(page, [...old, "notes.txt", "gauntlet-backup-2020-01-01-0000.json"]);
    await page.reload();
    await backUpNow(page);

    const files = await folderFiles(page);
    // The new one plus the newest 29 of the old: 30 from today.
    expect(autoNames(files)).toHaveLength(30);
    expect(files["notes.txt"]).toBeDefined();
    expect(files["gauntlet-backup-2020-01-01-0000.json"]).toBeDefined();
  });

  test("a browser too full to keep its own copy still writes the folder's", async ({ page }) => {
    // The browser reports its storage almost full: the in-browser backup is skipped.
    await page.addInitScript(() => {
      navigator.storage.estimate = async () => ({ usage: 95, quota: 100 });
    });
    await page.goto("/backup/");
    await useTestFolder(page);
    await page.reload();
    await page.getByRole("button", { name: "Back up in this browser now" }).click();
    await expect(page.getByRole("status")).toContainText("Automatic backup skipped");
    expect(autoNames(await folderFiles(page))).toHaveLength(1);
  });

  test("permission asked again after a restart: a Reconnect button, then backups go on", async ({ page }) => {
    // How the browser behaves after a restart: the folder is kept, but
    // writing needs the owner's OK again (a click). Stubbed: a test can't
    // restart the browser or answer its prompt.
    await page.addInitScript(() => {
      let allowed = false;
      const proto = FileSystemHandle.prototype as any;
      proto.queryPermission = async () => (allowed ? "granted" : "prompt");
      proto.requestPermission = async () => ((allowed = true), "granted");
    });
    await page.goto("/");
    await useTestFolder(page);
    await page.reload();

    const banner = page.locator('[data-folder-warning="needs-permission"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    expect(autoNames(await folderFiles(page))).toHaveLength(0);
    await banner.getByRole("button", { name: "Reconnect folder" }).click();
    await expect(banner).toHaveCount(0);

    // The backup page shows it reconnected, and the next backup is written.
    await page.goto("/backup/");
    await page.evaluate(() => {
      (FileSystemHandle.prototype as any).queryPermission = async () => "granted";
    });
    await backUpNow(page);
    expect(autoNames(await folderFiles(page))).toHaveLength(1);
    await expect(page.getByTestId("folder-state")).toContainText(`Saving to “${DIR}”`);
  });

  test("a restore keeps the picked folder", async ({ page }) => {
    await page.goto("/backup/");
    await useTestFolder(page);
    await page.reload();
    await backUpNow(page);
    const file = Object.entries(await folderFiles(page)).find(([n]) => n.startsWith("gauntlet-auto-"))![1];

    await page.locator('input[type="file"]').setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(file) });
    await page.getByRole("button", { name: "Replace with this backup" }).click();
    await expect(page.getByRole("status")).toContainText("Restored");
    await page.reload();
    await expect(page.getByTestId("folder-state")).toContainText(`Saving to “${DIR}”`);
  });
});
