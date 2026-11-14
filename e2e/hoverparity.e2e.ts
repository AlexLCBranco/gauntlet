import { expect, test, type Locator, type Page } from "./test";

import { box, openMapList, seedMap } from "./helpers";

/**
 * Speed session Part 5 (owner, 2026-11-12): a widget on the whiteboard
 * behaves like it does in its app, on hover too, without selecting or
 * editing it first. A map's box: Linkkit's hover look and its notes
 * preview, as on Linkkit's own page (Linkkit marks the box under the
 * pointer, `data-pointer-over`). Its connect dots and toolbar stay for
 * editing. The board's cards: boardwidget.e2e.ts ("speed session Part 5").
 */

const look = (l: Locator) => l.evaluate((el) => getComputedStyle(el).boxShadow);
const opacity = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).opacity));
const NOTES = "Check the second-night rest before betting";

async function hoverMiddle(page: Page, l: Locator) {
  const b = await box(l);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
}

test("a map's box shows Linkkit's hover look and its notes preview on the whiteboard, nothing selected; not its dots or toolbar", async ({ page, context }) => {
  const mapId = await seedMap(context, "Hover box");
  // Notes on its box (set up: typing them needs Linkkit's side panel).
  const lk = await context.newPage();
  await lk.setViewportSize(page.viewportSize()!);
  await lk.goto("/linkkit/");
  const boxId = await lk.evaluate(
    ({ id, notes }) => {
      const key = `linkkit:map:${id}`;
      const rec = JSON.parse(localStorage.getItem(key)!);
      const node = Object.values(rec.map.nodes as Record<string, { id: string; name: string; notes?: string }>).find((n) => n.name === "Hover box")!;
      node.notes = notes;
      rec.rev += 1;
      localStorage.setItem(key, JSON.stringify(rec));
      return node.id;
    },
    { id: mapId, notes: NOTES },
  );
  // In Linkkit itself: the look and the preview on hover.
  await lk.reload();
  const own = lk.locator(`[data-box-id="${boxId}"]`);
  await expect(own).toBeVisible();
  const ownPreview = own.locator('[class*="notesPreview"]').first();
  await expect(ownPreview).toContainText(NOTES);
  await lk.mouse.move(2, 2);
  const ownRest = await look(own);
  await hoverMiddle(lk, own);
  await expect.poll(() => opacity(ownPreview)).toBe(1);
  const ownHover = await look(own);
  expect(ownHover).not.toBe(ownRest);
  await lk.close();

  // On the whiteboard, the map placed and nothing selected.
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await openMapList(page);
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  await expect(page.locator("[data-map-view][data-ready]")).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as any).editor;
    editor.selectNone();
    editor.setCamera({ ...editor.getCamera(), z: 1 });
  });
  const wb = page.locator(`.tl-html-container [data-box-id="${boxId}"]`);
  const preview = wb.locator('[class*="notesPreview"]').first();
  const dots = wb.locator('[class*="dot"]');
  const toolbar = wb.locator('[class*="toolbar"]').first();
  await page.mouse.move(5, 300);
  await expect.poll(() => opacity(preview)).toBe(0);
  expect(await look(wb)).toBe(ownRest);
  await hoverMiddle(page, wb);
  await expect.poll(() => opacity(preview)).toBe(1);
  await expect(preview).toContainText(NOTES);
  expect(await look(wb)).toBe(ownHover);
  // Not the editing parts.
  for (const d of await dots.all()) expect(await opacity(d)).toBe(0);
  if (await toolbar.count()) expect(await toolbar.evaluate((el) => getComputedStyle(el).visibility === "hidden" || Number(getComputedStyle(el).opacity) === 0)).toBe(true);
  // Still nothing selected; off the box, back to rest.
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds().length)).toBe(0);
  await page.mouse.move(5, 300, { steps: 3 });
  await expect.poll(() => opacity(preview)).toBe(0);
  expect(await look(wb)).toBe(ownRest);
});
