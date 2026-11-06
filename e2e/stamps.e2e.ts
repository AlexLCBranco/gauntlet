import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "./test";

/**
 * The stamps tray v0 (owner, Edges round item 6; src/stamps/). Fresh
 * profile, 1600 × 1000.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAI0lEQVR42mP8z8DwnwEJMDIwMDDgEmBEZsAkGJE1MKIrAAA0lgcDpPY0eQAAAABJRU5ErkJggg==";

/** A labelled rectangle, selected (set up). */
const labelledBox = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).editor;
    e.createShape({ id: "shape:tv", type: "geo", x: 300, y: 300, props: { w: 80, h: 40, richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "tv" }] }] } } });
    e.select("shape:tv");
  });

const tvCount = (page: Page) =>
  page.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).filter((s) => s.type === "geo" && s.props.richText?.content?.[0]?.content?.[0]?.text === "tv").length);
const newestCenter = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).editor;
    const ids = e.getSelectedShapeIds();
    const b = e.getSelectionPageBounds();
    return { ids, x: b.midX, y: b.midY };
  });

const tray = (page: Page) => page.getByTestId("stamps-tray");
const stickers = (page: Page) => tray(page).getByTestId("stamp");

async function openTray(page: Page) {
  await page.getByTestId("tools.stamps").click();
  await expect(tray(page)).toBeVisible();
}

/** A picture into the tray as a paste or a drop event (a test can't put a
    file on the real clipboard or drag one from the desktop). */
const pictureInto = (page: Page, how: "paste" | "drop") =>
  page.evaluate(
    async ({ b64, how }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], "logo.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const el = document.querySelector('[data-testid="stamps-tray"]')!;
      if (how === "paste") window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
      else el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    { b64: PNG, how },
  );

test("add from the selection, a pasted and a dropped picture; place by click (where the pointer was on the page) and by drag; the same tray on another page and after a reload; delete; reorder", async ({ page }) => {
  await open(page);
  await labelledBox(page);
  await openTray(page);
  await expect(tray(page)).toContainText("Select something");
  await page.getByTestId("stamps-add-selection").click();
  await expect(stickers(page)).toHaveCount(1);

  // Paste (the pointer over the tray) and drop.
  await stickers(page).first().hover();
  await pictureInto(page, "paste");
  await expect(stickers(page)).toHaveCount(2);
  await pictureInto(page, "drop");
  await expect(stickers(page)).toHaveCount(3);

  // Click: a copy where the pointer last was on the page.
  await page.mouse.move(800, 600, { steps: 3 });
  await stickers(page).first().click();
  await expect.poll(() => tvCount(page)).toBe(2);
  let c = await newestCenter(page);
  expect(Math.abs(c.x - 800)).toBeLessThan(10);
  expect(Math.abs(c.y - 600)).toBeLessThan(10);
  // Drag: a copy where it is let go. Each is independent: moving one moves only it.
  const s0 = (await stickers(page).first().boundingBox())!;
  await page.mouse.move(s0.x + s0.width / 2, s0.y + s0.height / 2);
  await page.mouse.down();
  await page.mouse.move(700, 450, { steps: 8 });
  await page.mouse.move(500, 400, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => tvCount(page)).toBe(3);
  c = await newestCenter(page);
  expect(Math.abs(c.x - 500)).toBeLessThan(10);
  expect(Math.abs(c.y - 400)).toBeLessThan(10);
  // A dropped picture's sticker puts a picture.
  await page.mouse.move(1000, 700, { steps: 3 });
  await stickers(page).nth(2).click();
  await expect.poll(() => page.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).filter((s) => s.type === "image").length)).toBe(1);

  // Another page: the same tray.
  const ids = await stickers(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-stamp")));
  await page.evaluate(() => {
    const e = (window as any).editor;
    e.createPage({ name: "Two" });
    e.setCurrentPage(e.getPages().at(-1).id);
  });
  expect(await stickers(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-stamp")))).toEqual(ids);
  // A reload: still there.
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await openTray(page);
  await expect(stickers(page)).toHaveCount(3);
  expect(await stickers(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-stamp")))).toEqual(ids);

  // Reorder: the last dragged before the first.
  const first = (await stickers(page).first().boundingBox())!;
  const last = (await stickers(page).last().boundingBox())!;
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => stickers(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-stamp")))).toEqual([ids[2], ids[0], ids[1]]);
  // Delete.
  await stickers(page).nth(1).hover();
  await stickers(page).nth(1).getByTestId("stamp-delete").click();
  await expect(stickers(page)).toHaveCount(2);
  expect(await stickers(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-stamp")))).toEqual([ids[2], ids[1]]);
  // One click on the button closes the tray.
  await page.getByTestId("tools.stamps").click();
  await expect(tray(page)).toHaveCount(0);
});

test("the tray is in the backup file and comes back with a restore into a fresh browser", async ({ page, browser, baseURL }) => {
  await open(page);
  await labelledBox(page);
  await openTray(page);
  await page.getByTestId("stamps-add-selection").click();
  await expect(stickers(page)).toHaveCount(1);
  await page.goto("/backup/");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save a backup" }).click()]);
  const file = await readFile((await download.path())!, "utf-8");
  expect(file).toContain("gauntlet-stamps");

  const ctx = await browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
  const fresh = await ctx.newPage();
  await fresh.goto("/backup/");
  await fresh.getByLabel("Backup file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(file) });
  const dialog = fresh.getByRole("dialog", { name: "Replace what's here with this backup?" });
  await Promise.all([fresh.waitForEvent("download"), dialog.getByRole("button", { name: "Replace with this backup" }).click()]);
  await expect(fresh.getByRole("status")).toContainText("Restored");
  await open(fresh);
  await openTray(fresh);
  await expect(stickers(fresh)).toHaveCount(1);
  await fresh.mouse.move(700, 500, { steps: 2 });
  // The restored page has the original box; the sticker adds a copy.
  expect(await tvCount(fresh)).toBe(1);
  await stickers(fresh).first().click();
  await expect.poll(() => tvCount(fresh)).toBe(2);
  await ctx.close();
});

test("no slowdown with 50 stickers: opening the tray and zooming the page with it open, against an empty tray", async ({ page }) => {
  await open(page);
  await labelledBox(page);
  // 50 stickers (set up: one added, then copied in the tray's store).
  await openTray(page);
  await page.getByTestId("stamps-add-selection").click();
  await expect(stickers(page)).toHaveCount(1);

  const measure = async () => {
    await page.getByTestId("tools.stamps").click();
    await expect(tray(page)).toHaveCount(0);
    const t0 = Date.now();
    await page.getByTestId("tools.stamps").click();
    await expect(tray(page)).toBeVisible();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const openMs = Date.now() - t0;
    await page.mouse.move(800, 500);
    const frames = await page.evaluate(async () => {
      const gaps: number[] = [];
      let last = performance.now();
      let on = true;
      const tick = (t: number) => {
        gaps.push(t - last);
        last = t;
        if (on) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      for (let i = 0; i < 20; i++) {
        (window as any).editor.zoomIn(undefined, { animation: { duration: 0 } });
        await new Promise((r) => setTimeout(r, 30));
        (window as any).editor.zoomOut(undefined, { animation: { duration: 0 } });
        await new Promise((r) => setTimeout(r, 30));
      }
      on = false;
      gaps.sort((a, b) => a - b);
      return { p95: gaps[Math.floor(gaps.length * 0.95)]!, longest: gaps.at(-1)! };
    });
    return { openMs, ...frames };
  };

  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const o = indexedDB.open("gauntlet-stamps", 1); o.onsuccess = () => r(o.result); });
    const tx = db.transaction("tray", "readwrite");
    tx.objectStore("tray").put([], "stamps");
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  });
  // Empty tray (re-read from storage).
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await labelledBox(page);
  await openTray(page);
  await expect(stickers(page)).toHaveCount(0);
  const empty = await measure();

  await page.getByTestId("stamps-add-selection").click();
  await expect(stickers(page)).toHaveCount(1);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const o = indexedDB.open("gauntlet-stamps", 1); o.onsuccess = () => r(o.result); });
    const get = db.transaction("tray").objectStore("tray").get("stamps");
    const one = (await new Promise((r) => (get.onsuccess = () => r(get.result))) as any[])[0];
    const fifty = Array.from({ length: 50 }, (_, i) => ({ ...one, id: `stamp-many-${i}` }));
    const tx = db.transaction("tray", "readwrite");
    tx.objectStore("tray").put(fifty, "stamps");
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  });
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await openTray(page);
  await expect(stickers(page)).toHaveCount(50);
  const many = await measure();
  console.log("stamps", JSON.stringify({ empty, many }));
  test.info().annotations.push({ type: "stamps", description: JSON.stringify({ empty, many }) });
  expect(many.openMs).toBeLessThan(Math.max(300, empty.openMs * 3));
  expect(many.p95).toBeLessThan(Math.max(34, empty.p95 * 1.5));
});
