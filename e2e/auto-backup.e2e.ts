import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { seedBoard } from "./helpers";

/**
 * Automatic backups (src/backup/auto.ts): kept in this browser by
 * themselves, restorable from the backup page; and when the browser's
 * storage is (nearly) full, they step aside: no backup, a clear warning,
 * and Boardkit still saves. Fresh, empty browser profile per test; the
 * "full storage" is the browser's own quota override for that profile.
 */

const AUTO_DB = "gauntlet-auto-backups";

/** The automatic backups kept, read straight from their database. */
const kept = (page: Page) =>
  page.evaluate(
    (name) =>
      new Promise<{ reason: string; json: string }[]>((resolve) => {
        const r = indexedDB.open(name, 1);
        r.onupgradeneeded = () => r.result.createObjectStore("backups", { keyPath: "id" });
        r.onsuccess = () => {
          const q = r.result.transaction("backups").objectStore("backups").getAll();
          q.onsuccess = () => {
            r.result.close();
            resolve(q.result);
          };
        };
      }),
    AUTO_DB,
  );

const boardRecord = (page: Page, id: string) => page.evaluate((id) => localStorage.getItem(`boardkit:board:${id}`), id);

/** A picture of `bytes` bytes in Boardkit's picture store. Resolves false if the browser refused it. */
const putPicture = (page: Page, key: string, bytes: number) =>
  page.evaluate(
    ({ key, bytes }) =>
      new Promise<boolean>((resolve) => {
        const r = indexedDB.open("boardkit", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => {
          const tx = r.result.transaction("kv", "readwrite");
          const data = new Uint8Array(bytes);
          for (let i = 0; i < bytes; i++) data[i] = (i * 7919) % 251; // not compressible
          tx.objectStore("kv").put(new Blob([data], { type: "image/png" }), key);
          tx.oncomplete = () => (r.result.close(), resolve(true));
          tx.onabort = () => (r.result.close(), resolve(false));
        };
        r.onerror = () => resolve(false);
      }),
    { key, bytes },
  );

/** Renames the board's first card in Boardkit itself, and waits until Boardkit saved it. */
async function renameInBoardkit(context: BrowserContext, id: string, title: string) {
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  const card = bk.locator("[data-board-canvas] article[data-card-id]").first();
  await card.getByRole("button", { name: "Card title", exact: true }).click();
  await bk.keyboard.press("Control+a");
  await bk.keyboard.type(title);
  await bk.keyboard.press("Enter");
  await expect.poll(async () => (await boardRecord(bk, id)) ?? "", { timeout: 8_000 }).toContain(title);
  await bk.close();
}

/**
 * Gives the site a storage quota of `bytes` in this browser profile, as a
 * nearly full disk would: the browser refuses writes past it (Chromium's
 * quota override), and says so when asked (`navigator.storage.estimate`,
 * which the override leaves at the real disk's quota).
 */
async function setQuota(page: Page, bytes: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Storage.overrideQuotaForOrigin", { origin: new URL(page.url()).origin, quotaSize: bytes });
  await page.context().addInitScript((quota) => {
    const real = navigator.storage.estimate.bind(navigator.storage);
    navigator.storage.estimate = async () => ({ ...(await real()), quota });
  }, bytes);
}

test("opening the home page keeps a backup by itself; after the board is lost, 'Restore this' brings it back", async ({ page, context }) => {
  const id = await seedBoard(context);
  await page.goto("/");
  const before = await boardRecord(page, id);
  await expect.poll(async () => (await kept(page)).some((b) => b.reason === "auto" && b.json.includes(`boardkit:board:${id}`)), { timeout: 15_000 }).toBe(true);
  // Opening it again with nothing changed keeps no second copy.
  await page.reload();
  await page.waitForTimeout(4500);
  expect((await kept(page)).length).toBe(1);

  // The board is lost.
  await page.evaluate((id) => localStorage.removeItem(`boardkit:board:${id}`), id);
  await page.goto("/backup/");
  const list = page.getByRole("list", { name: "Automatic backups" });
  await list.getByRole("listitem").filter({ hasText: "1 Boardkit board" }).first().getByRole("button", { name: "Restore this" }).click();
  const dialog = page.getByRole("dialog");
  const [safety] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Replace with this backup" }).click()]);
  expect(safety.suggestedFilename()).toMatch(/^gauntlet-before-restore-/);
  await expect(page.getByRole("status")).toContainText("Restored");
  expect(await boardRecord(page, id)).toBe(before);
  // What was here just before is kept too.
  await expect(list.getByRole("listitem").filter({ hasText: "before a restore" })).toHaveCount(1);
});

test("with the browser's storage nearly full, no backup is kept, the page warns, and Boardkit still saves boards and pictures", async ({ page, context }) => {
  const id = await seedBoard(context);
  await page.goto("/backup/");
  // A 10 MB quota, with a 2.5 MB picture already stored: a backup (the
  // picture as text, ~3.4 MB) is more than backups may take (20%, 2 MB).
  await setQuota(page, 10 * 1024 * 1024);
  expect(await putPicture(page, "boardImage:e2e-big", 2.5 * 1024 * 1024)).toBe(true);

  await page.goto("/");
  await expect(page.locator("[data-backup-warning]")).toContainText("Automatic backup skipped", { timeout: 15_000 });
  await expect(page.locator("[data-backup-warning]").getByRole("link", { name: "Open the backup page" })).toHaveAttribute("href", "/backup/");
  expect(await kept(page)).toEqual([]);

  // The apps' own saves are untouched: a board edit and another picture.
  await renameInBoardkit(context, id, "ZZ saved with full storage");
  expect(await putPicture(page, "boardImage:e2e-more", 1024 * 1024)).toBe(true);

  // The backup page says it too, and "Save a backup" (a file) still works.
  await page.goto("/backup/");
  await expect(page.getByTestId("auto-warning")).toContainText("Automatic backup skipped");
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save a backup" }).click()]);
  expect(file.suggestedFilename()).toMatch(/^gauntlet-backup-/);
});

test("when the browser refuses to store a backup, the page warns and Boardkit still saves", async ({ page, context }) => {
  const id = await seedBoard(context);
  // Every write to the backups' own store fails as a full disk would.
  await context.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "backups") throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await page.goto("/");
  await expect(page.locator("[data-backup-warning]")).toContainText("Automatic backup failed", { timeout: 15_000 });
  expect(await kept(page)).toEqual([]);
  await renameInBoardkit(context, id, "ZZ saved while backups fail");
});

test("the whiteboard keeps backups by itself too, its Backups menu item opens /backup/, and backups kept before are still listed there", async ({ page, context }) => {
  const id = await seedBoard(context);
  // A backup kept before (here by the home page, as on the live site).
  await page.goto("/");
  await expect.poll(async () => (await kept(page)).length, { timeout: 15_000 }).toBe(1);
  const earlier = (await kept(page))[0];
  // Something changes; opening the whiteboard keeps a new backup.
  await page.evaluate((id) => {
    const rec = JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!);
    rec.rev = (rec.rev ?? 0) + 1;
    localStorage.setItem(`boardkit:board:${id}`, JSON.stringify(rec));
  }, id);
  await page.goto("/whiteboard/");
  await page.waitForFunction(() => "editor" in window);
  await expect.poll(async () => (await kept(page)).length, { timeout: 15_000 }).toBe(2);
  expect((await kept(page)).map((b) => b.json)).toContain(earlier.json);

  // Main menu → Backups → the backup page, both backups listed.
  await page.getByTestId("main-menu.button").click();
  await page.getByRole("menuitem", { name: "Backups" }).click();
  await expect(page).toHaveURL(/\/backup\/$/);
  await expect(page.getByRole("list", { name: "Automatic backups" }).getByRole("listitem")).toHaveCount(2);
  // The home page links here too.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Backup" })).toHaveAttribute("href", "/backup/");
});
