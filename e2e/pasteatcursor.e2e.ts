import { expect, test, type Page } from "./test";

/**
 * Paste at the cursor (owner, Edges round item 4): tldraw's own "Paste at
 * cursor" preference, on by default; the copied items keep their layout;
 * with the cursor off the page, the middle of the view. Fresh profile.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Two rectangles 300 px apart, selected (set up). */
const twoBoxes = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).editor;
    e.createShapes([
      { id: "shape:pa", type: "geo", x: 200, y: 200, props: { w: 100, h: 80 } },
      { id: "shape:pb", type: "geo", x: 500, y: 260, props: { w: 120, h: 60 } },
    ]);
    e.select("shape:pa", "shape:pb");
  });

/** The shapes added by the paste, and their common box's centre. */
const pasted = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).editor;
    const ids = (e.getSelectedShapeIds() as string[]).filter((id) => id !== "shape:pa" && id !== "shape:pb");
    const bs = ids.map((id) => e.getShapePageBounds(id));
    const minX = Math.min(...bs.map((b: any) => b.x));
    const minY = Math.min(...bs.map((b: any) => b.y));
    const maxX = Math.max(...bs.map((b: any) => b.maxX));
    const maxY = Math.max(...bs.map((b: any) => b.maxY));
    return { n: ids.length, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, rel: bs.map((b: any) => [Math.round(b.x - minX), Math.round(b.y - minY)]) };
  });

test("Ctrl+C, move the mouse, Ctrl+V: the copy lands at the cursor, its items' layout kept; the preference is tldraw's own and on", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  expect(await page.evaluate(() => (window as any).editor.user.getIsPasteAtCursorMode())).toBe(true);
  await twoBoxes(page);
  await page.mouse.move(400, 300);
  await page.keyboard.press("Control+c");
  await page.mouse.move(1100, 650, { steps: 4 });
  await page.keyboard.press("Control+v");
  await expect.poll(async () => (await pasted(page)).n).toBe(2);
  const p = await pasted(page);
  // The originals: (200,200)-(620,320), 420 × 120. At the cursor, same layout.
  expect(Math.abs(p.cx - 1100)).toBeLessThan(220);
  expect(Math.abs(p.cy - 650)).toBeLessThan(80);
  expect(p.cx).toBeGreaterThan(700);
  expect(p.rel.sort()).toEqual([[0, 0], [300, 60]].sort());
});

test("with the cursor off the page (on the toolbar), the paste goes to the middle of the view, inside the page", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await twoBoxes(page);
  await page.mouse.move(400, 300);
  await page.keyboard.press("Control+c");
  const bar = (await page.getByTestId("toolbar").boundingBox())!;
  await page.mouse.move(bar.x + 10, bar.y + bar.height / 2, { steps: 4 });
  await page.keyboard.press("Control+v");
  await expect.poll(async () => (await pasted(page)).n).toBe(2);
  const p = await pasted(page);
  expect(Math.abs(p.cx - 800)).toBeLessThan(60);
  expect(Math.abs(p.cy - 500)).toBeLessThan(60);
  // The preference is back on for the next paste.
  await expect.poll(() => page.evaluate(() => (window as any).editor.user.getIsPasteAtCursorMode())).toBe(true);
});
