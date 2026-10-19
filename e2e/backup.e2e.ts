import { readFile } from "node:fs/promises";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { seedBoard, seedMap } from "./helpers";

/**
 * The backup page (/backup/): a backup made in one browser and restored
 * into an empty one (a cleared browser, a new computer) brings back the
 * same Boardkit boards and pictures, Linkkit maps and whiteboard, and the
 * apps open them; a restore over changed data puts it back as it was and
 * downloads what was there first. Each test runs in fresh, empty browser
 * profiles: the owner's own data is never in reach.
 */

const PICTURE = Array.from({ length: 5000 }, (_, i) => (i * 31) % 256);

/** Throwaway data in every app: a Boardkit board, a picture in Boardkit's
    image store, a Linkkit map, a whiteboard shape, and a backup folder
    handle (which can't go in a file) in Linkkit's store. */
async function seed(context: BrowserContext, mapName: string): Promise<{ boardId: string; shapeId: string }> {
  const boardId = await seedBoard(context);
  await seedMap(context, mapName);

  const page = await context.newPage();
  await page.goto("/backup/");
  await page.evaluate(async (bytes) => {
    const put = (dbName: string, key: string, value: unknown) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(dbName, 1);
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(value, key);
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      });
    await put("boardkit", "boardImage:e2e-picture", new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    await put("linkkit", "backupFolder", await navigator.storage.getDirectory());
  }, PICTURE);

  await page.goto("/whiteboard/");
  await page.waitForFunction(() => "editor" in window);
  const shapeId = await page.evaluate(() => {
    const editor = (window as any).editor;
    editor.createShape({ type: "geo", x: 300, y: 300, props: { w: 200, h: 120 } });
    return editor.getCurrentPageShapes()[0].id as string;
  });
  // tldraw saves to IndexedDB a moment later.
  await expect.poll(() => page.evaluate(() => storedRecordIds()), { timeout: 10_000 }).toContain(shapeId);
  await page.close();
  return { boardId, shapeId };
}

/** The backup page's own snapshot (what "Save a backup" downloads),
    without its time stamp. */
async function snapshot(page: Page): Promise<Record<string, unknown>> {
  const file = await saveBackup(page);
  const { createdAt: _, ...rest } = file;
  return rest;
}

async function saveBackup(page: Page): Promise<Record<string, unknown> & { createdAt: string }> {
  await page.goto("/backup/");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save a backup" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^gauntlet-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  await expect(page.getByRole("status")).toContainText("Saved");
  return JSON.parse(await readFile((await download.path())!, "utf-8"));
}

async function restore(page: Page, file: Record<string, unknown>): Promise<Record<string, unknown>> {
  await page.goto("/backup/");
  await page.getByLabel("Backup file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  const dialog = page.getByRole("dialog", { name: "Replace what's here with this backup?" });
  await expect(dialog).toBeVisible();
  const [safety] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Replace with this backup" }).click()]);
  expect(safety.suggestedFilename()).toMatch(/^gauntlet-before-restore-/);
  await expect(page.getByRole("status")).toContainText("Restored");
  return JSON.parse(await readFile((await safety.path())!, "utf-8"));
}

/** A snapshot with every "couldn't go in the file" list emptied. */
function withoutSkipped(file: Record<string, unknown>): Record<string, unknown> {
  const dbs = file.indexedDB as { stores: { skipped: unknown[] }[] }[];
  return { ...file, indexedDB: dbs.map((db) => ({ ...db, stores: db.stores.map((s) => ({ ...s, skipped: [] })) })) };
}

const pictureBytes = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number[] | null>((resolve) => {
        const open = indexedDB.open("boardkit");
        open.onsuccess = () => {
          const req = open.result.transaction("kv").objectStore("kv").get("boardImage:e2e-picture");
          req.onsuccess = async () => resolve(req.result ? Array.from(new Uint8Array(await (req.result as Blob).arrayBuffer())) : null);
        };
      }),
  );

const folderKept = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open("linkkit");
        open.onsuccess = () => {
          const req = open.result.transaction("kv").objectStore("kv").get("backupFolder");
          req.onsuccess = () => resolve(req.result?.constructor?.name ?? "none");
        };
      }),
  );

test.beforeEach(async ({ page }) => {
  // A helper the whiteboard part of `seed` can call in the page.
  await page.context().addInitScript(() => {
    (window as any).storedRecordIds = () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open("TLDRAW_DOCUMENT_v2gauntlet-whiteboard");
        open.onsuccess = () => {
          try {
            const req = open.result.transaction("records").objectStore("records").getAllKeys();
            req.onsuccess = () => resolve(req.result.map(String).filter((k) => k.startsWith("shape:")));
          } catch {
            resolve([]);
          }
        };
      });
  });
});
declare function storedRecordIds(): Promise<string[]>;

test("a backup restored into an empty browser brings back boards, pictures, maps and the whiteboard", async ({ page, browser }) => {
  const { boardId, shapeId } = await seed(page.context(), "Backup e2e map");
  const original = await saveBackup(page);
  await expect(page.getByTestId("here")).toContainText("1 background picture");
  await expect(page.getByTestId("here")).toContainText("1 whiteboard page");

  // A second, empty browser: a cleared one, or another computer.
  const empty = await browser.newContext();
  const fresh = await empty.newPage();
  const before = await restore(fresh, original);
  expect(Object.keys(before.localStorage as object)).toHaveLength(0);

  // Byte for byte what was saved (the folder handle could not go in it,
  // so the new browser has none).
  const { createdAt: _, ...want } = original;
  expect(withoutSkipped(await snapshot(fresh))).toEqual(withoutSkipped(want));
  expect(await pictureBytes(fresh)).toEqual(PICTURE);
  expect(await folderKept(fresh)).toBe("none");

  // And the apps open it.
  await fresh.goto("/boardkit/");
  await expect(fresh.getByRole("button", { name: "Switch board" })).toBeVisible();
  expect(await fresh.evaluate(() => JSON.parse(localStorage.getItem("boardkit:registry")!).activeBoardId)).toBe(boardId);
  await fresh.goto("/linkkit/");
  await fresh.getByRole("button", { name: /^Switch map/ }).click();
  await expect(fresh.getByRole("menuitem", { name: /Backup e2e map/ })).toBeVisible();
  await fresh.goto("/whiteboard/");
  await fresh.waitForFunction(() => "editor" in window);
  await expect.poll(() => fresh.evaluate(() => (window as any).editor.getCurrentPageShapes().map((s: { id: string }) => s.id))).toEqual([shapeId]);
  await empty.close();
});

test("restoring over changed data puts it back as it was, keeps the picked folder, and downloads what was there", async ({ page }) => {
  await seed(page.context(), "Restore e2e map");
  const original = await saveBackup(page);

  // Changes after the backup: a map added, a board record changed, the picture gone.
  await seedMap(page.context(), "Made after the backup");
  await page.goto("/backup/");
  await page.evaluate(async () => {
    localStorage.setItem("boardkit:board:after-backup", "{}");
    await new Promise<void>((resolve) => {
      const open = indexedDB.open("boardkit");
      open.onsuccess = () => {
        const tx = open.result.transaction("kv", "readwrite");
        tx.objectStore("kv").delete("boardImage:e2e-picture");
        tx.oncomplete = () => (open.result.close(), resolve());
      };
    });
  });

  const before = await restore(page, original);
  // The safety copy has the changes...
  expect((before.localStorage as Record<string, string>)["boardkit:board:after-backup"]).toBe("{}");
  expect((before.localStorage as Record<string, string>)["linkkit:registry"]).toContain("Made after the backup");
  // ...and the browser is back to the backup.
  const { createdAt: _, ...want } = original;
  expect(await snapshot(page)).toEqual(want);
  expect(await pictureBytes(page)).toEqual(PICTURE);
  expect(await folderKept(page)).toBe("FileSystemDirectoryHandle");

  // Restoring the safety copy undoes the restore.
  await restore(page, before);
  expect(await page.evaluate(() => localStorage.getItem("boardkit:board:after-backup"))).toBe("{}");
  expect(await pictureBytes(page)).toBeNull();
});

test("a file that isn't a gauntlet backup is refused and changes nothing", async ({ page }) => {
  await page.goto("/backup/");
  await page.evaluate(() => localStorage.setItem("gauntlet:e2e", "kept"));
  await page.getByLabel("Backup file").setInputFiles({
    name: "boardkit-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, boards: [] })),
  });
  await expect(page.getByRole("status")).toContainText("is not a gauntlet backup file");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("gauntlet:e2e"))).toBe("kept");
});
