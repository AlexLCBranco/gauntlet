import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { seedBoard, seedMap } from "./helpers";

/**
 * Backups of the owner's data on the site (src/backup/). Fresh, empty
 * browser profile per test: the boards and maps are made by the real
 * Boardkit and Linkkit, the "lost data" is wiped in that profile only.
 */

const IMAGE = [137, 80, 78, 71, 1, 2, 3, 4, 5, 250];

/** Every app key in localStorage (what a backup must bring back). */
const appData = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (/^(boardkit|linkkit|gauntlet):/.test(k) && !k.startsWith("gauntlet:backup")) out[k] = localStorage.getItem(k)!;
    }
    return out;
  });

/** Boardkit's IndexedDB store (`boardkit` / `kv`), as Boardkit opens it. */
const withBoardkitDb = <T,>(page: Page, work: string, arg?: unknown) =>
  page.evaluate(
    ({ work, arg }) =>
      new Promise<T>((resolve, reject) => {
        const r = indexedDB.open("boardkit", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const store = r.result.transaction("kv", "readwrite").objectStore("kv");
          // eslint-disable-next-line no-new-func
          new Function("store", "arg", "resolve", work)(store, arg, resolve);
        };
      }),
    { work, arg },
  );

const putImage = (page: Page) =>
  withBoardkitDb(page, `store.put(new Blob([new Uint8Array(arg)], { type: "image/png" }), "image:zz-test"); store.transaction.oncomplete = () => resolve(true);`, IMAGE);
const readImage = (page: Page) =>
  withBoardkitDb<number[] | null>(page, `const q = store.get("image:zz-test"); q.onsuccess = async () => resolve(q.result ? [...new Uint8Array(await q.result.arrayBuffer())] : null);`);

/** The data is lost: every app key and Boardkit's stored image gone. */
async function wipe(page: Page) {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (/^(boardkit|linkkit|gauntlet):/.test(k) && !k.startsWith("gauntlet:backup")) localStorage.removeItem(k);
  });
  await withBoardkitDb(page, `store.clear(); store.transaction.oncomplete = () => resolve(true);`);
  expect(Object.keys(await appData(page))).toEqual([]);
}

/** The backups saved so far, read straight from their database. */
const savedBackups = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ reason: string; keys: string[]; images: number }[]>((resolve) => {
        const r = indexedDB.open("gauntlet-backups", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("snapshots", { keyPath: "id" });
        r.onsuccess = () => {
          const q = r.result.transaction("snapshots").objectStore("snapshots").getAll();
          q.onsuccess = () => resolve(q.result.map((s: any) => ({ reason: s.reason, keys: Object.keys(s.local), images: s.idb.boardkit.length })));
        };
      }),
  );

async function restoreFromList(page: Page, has: string) {
  await page.goto("/backups/");
  const row = page.getByRole("list", { name: "Backups" }).getByRole("listitem").filter({ hasText: has }).first();
  await row.getByRole("button", { name: "Restore this" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Restore this backup?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Restored");
}

test("opening the home page backs up every board, map and image by itself; after the data is lost, 'Restore this' brings all of it back", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await seedMap(context, "ZZ backup map");
  await page.goto("/whiteboard/");
  await putImage(page);
  const before = await appData(page);
  expect(Object.keys(before)).toContain(`boardkit:board:${boardId}`);
  expect(Object.keys(before)).toContain("linkkit:registry");

  // The home page backs up by itself a moment after it opens.
  await page.goto("/");
  await expect
    .poll(async () => (await savedBackups(page)).some((b) => b.reason === "auto" && b.keys.includes(`boardkit:board:${boardId}`) && b.images === 1), { timeout: 15_000 })
    .toBe(true);
  const withHome = await appData(page); // the home page saved its own layout too

  await wipe(page);
  await restoreFromList(page, "ZZ backup map");
  expect(await appData(page)).toEqual(withHome);
  expect(await readImage(page)).toEqual(IMAGE);

  // The data as it was just before (empty) was backed up first.
  await page.reload();
  await expect(page.getByRole("list", { name: "Backups" }).getByRole("listitem").filter({ hasText: "Before a restore" })).toHaveCount(1);

  // Boardkit and Linkkit open with the restored board and map.
  const rec = JSON.parse(before[`boardkit:board:${boardId}`]);
  const firstCard = rec.board.cards[rec.board.cardOrder[rec.board.listOrder[0]][0]].title as string;
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  await expect(bk.getByText(firstCard).first()).toBeVisible({ timeout: 15_000 });
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await expect(lk.getByText("ZZ backup map").first()).toBeVisible({ timeout: 15_000 });
});

test("a backup downloads as a file, and 'Restore from a file' brings it back on a wiped browser", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await seedMap(context, "ZZ file map");
  await page.goto("/backups/");
  await putImage(page);
  const before = await appData(page);

  await page.getByRole("button", { name: "Back up now" }).click();
  await expect(page.getByRole("status")).toContainText("Backed up");
  const row = page.getByRole("list", { name: "Backups" }).getByRole("listitem").filter({ hasText: "Made by hand" }).first();
  await expect(row).toContainText("ZZ file map");
  const [download] = await Promise.all([page.waitForEvent("download"), row.getByRole("button", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^gauntlet-backup-\d{4}-\d\d-\d\d-\d{4}\.json$/);
  const file = await download.path();
  expect(JSON.parse(readFileSync(file, "utf-8")).local[`boardkit:board:${boardId}`]).toBe(before[`boardkit:board:${boardId}`]);

  await wipe(page);
  await page.getByTestId("restore-file").setInputFiles(file);
  const confirm = page.getByRole("alertdialog", { name: "Restore this backup?" });
  await expect(confirm).toContainText("ZZ file map");
  await confirm.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Restored");
  expect(await appData(page)).toEqual(before);
  expect(await readImage(page)).toEqual(IMAGE);
});

test("restoring a board Boardkit has since changed gives it a newer rev, so Boardkit keeps the restored one", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await page.goto("/backups/");
  await page.getByRole("button", { name: "Back up now" }).click();
  await expect(page.getByRole("status")).toContainText("Backed up");
  const key = `boardkit:board:${boardId}`;
  const old = JSON.parse((await appData(page))[key]);
  // Boardkit saves a change later (a card renamed, rev up).
  await page.evaluate((key) => {
    const r = JSON.parse(localStorage.getItem(key)!);
    const first = Object.keys(r.board.cards)[0];
    r.board.cards[first].title = "ZZ changed later";
    r.rev += 5;
    localStorage.setItem(key, JSON.stringify(r));
  }, key);
  await restoreFromList(page, "Made by hand");
  const now = JSON.parse((await appData(page))[key]);
  expect(now.rev).toBe(old.rev + 6);
  expect(now.board).toEqual(old.board);
});

test("backing up never creates Boardkit's or Linkkit's database (they would fail to open it)", async ({ page }) => {
  await page.goto("/backups/");
  await page.getByRole("button", { name: "Back up now" }).click();
  await expect(page.getByRole("status")).toContainText("Backed up");
  const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(names).toContain("gauntlet-backups");
  expect(names).not.toContain("boardkit");
  expect(names).not.toContain("linkkit");
});

test("the Backups page is one click from the home page and from the whiteboard's main menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Backups" }).click();
  await expect(page).toHaveURL(/\/backups\/$/);
  await expect(page.getByRole("heading", { name: "Backups" })).toBeVisible();

  await page.goto("/whiteboard/");
  await page.waitForFunction(() => "editor" in window);
  await page.getByTestId("main-menu.button").click();
  await page.getByRole("menuitem", { name: "Backups" }).click();
  await expect(page).toHaveURL(/\/backups\/$/);
});
