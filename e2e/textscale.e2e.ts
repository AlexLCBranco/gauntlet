import { expect, test, type Page } from "./test";

import { whiteboardSaved } from "./helpers";

/**
 * GT-2: a corner drag on a text box scales its font like a picture; a side
 * handle changes only the width (the text re-wraps). The new size is the
 * text's real font size (meta fontPx; tldraw's props.scale stays 1), the
 * style panel shows it, one undo puts the old size back, and it survives a
 * reload (src/style/shapeUtils.ts, TextUtil.onResize). Fresh profile.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

const rt = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
  await page.evaluate(() => void (window as any).editor.setCamera({ x: 0, y: 0, z: 1 }));
}

/** The text's size once its font has loaded: until then it is measured in a
    narrower fallback font, and grows when the font arrives (a drag from the
    old edge then started inside the text). */
async function settled(page: Page, id: string) {
  await page.evaluate(() => document.fonts.ready);
  let last = -1;
  await expect
    .poll(async () => {
      const w = (await text(page, id)).bw;
      const same = w === last;
      last = w;
      return same;
    })
    .toBe(true);
  return text(page, id);
}

type T = { fontPx: number | null; scale: number; w: number; autoSize: boolean; bw: number; bh: number; x: number; y: number };
const text = (page: Page, id: string) =>
  page.evaluate((id) => {
    const e = (window as any).editor;
    const s = e.getShape(id);
    const b = e.getShapePageBounds(id);
    return { fontPx: s.meta.fontPx ?? null, scale: s.props.scale, w: s.props.w, autoSize: s.props.autoSize, bw: b.w, bh: b.h, x: s.x, y: s.y };
  }, id) as Promise<T>;
/** The font size the text is drawn with, read from the page. */
const drawnPx = (page: Page, id: string) =>
  page.evaluate((id) => parseFloat(getComputedStyle(document.querySelector(`[data-shape-id="${id}"] .tl-rich-text`)!).fontSize), id);

/** Drag from the shape's page point (fx, fy of the way across) by (dx, dy) screen px. */
async function dragFrom(page: Page, id: string, fx: number, fy: number, dx: number, dy: number) {
  const p = await page.evaluate(({ id, fx, fy }) => {
    const e = (window as any).editor;
    const b = e.getShapePageBounds(id);
    return e.pageToScreen({ x: b.x + b.w * fx, y: b.y + b.h * fy }) as { x: number; y: number };
  }, { id, fx, fy });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx / 2, p.y + dy / 2, { steps: 5 });
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 5 });
  // tldraw applies pointer moves on its tick: let the last one land first.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.mouse.up();
}

test("a corner drag scales a text's font; the panel shows the real size; one undo puts it back; it survives a reload", async ({ page }) => {
  await open(page);
  await page.evaluate((richText) => {
    const e = (window as any).editor;
    e.createShapes([{ id: "shape:ts", type: "text", x: 400, y: 300, props: { richText, size: "m" } }]);
    e.select("shape:ts");
  }, rt("Lakers ml"));
  const before = await settled(page, "shape:ts");
  expect(await drawnPx(page, "shape:ts")).toBe(24);
  await expect(page.getByText("Font size · 24 px")).toBeVisible();
  await expect(page.getByTestId("font-m")).toHaveAttribute("aria-pressed", "true");

  // Bottom-right corner out by half the box's width: about 1.5 times bigger.
  await dragFrom(page, "shape:ts", 1, 1, before.bw / 2, before.bh / 2);
  const big = await text(page, "shape:ts");
  expect(big.scale).toBe(1);
  expect(big.fontPx).toBeGreaterThan(24 * 1.4);
  expect(big.fontPx).toBeLessThan(24 * 1.6);
  expect(await drawnPx(page, "shape:ts")).toBeCloseTo(big.fontPx!, 0);
  expect(big.bw).toBeGreaterThan(before.bw * 1.35);
  expect(big.bh).toBeGreaterThan(before.bh * 1.35);
  // The top-left corner stayed put (tldraw re-measures the text at its new size: a pixel either way).
  expect(Math.abs(big.x - before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(big.y - before.y)).toBeLessThanOrEqual(2);
  // The panel shows the real size, no step marked unless it is exactly one.
  await expect(page.getByText(`Font size · ${big.fontPx} px`)).toBeVisible();

  // Smaller again from the top-left corner: the bottom-right stays.
  const right = big.x + big.bw;
  await dragFrom(page, "shape:ts", 0, 0, big.bw / 3, big.bh / 3);
  const small = await text(page, "shape:ts");
  expect(small.fontPx).toBeLessThan(big.fontPx!);
  expect(small.x + small.bw).toBeCloseTo(right, -1);

  // One undo: the bigger size, in one step; again: the start.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await text(page, "shape:ts")).fontPx).toBe(big.fontPx);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await text(page, "shape:ts")).fontPx).toBeNull();
  expect(await drawnPx(page, "shape:ts")).toBe(24);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await text(page, "shape:ts")).fontPx).toBe(big.fontPx);

  // A step picked in the panel replaces the scaled size.
  await page.getByTestId("font-xl").click();
  await expect.poll(async () => (await text(page, "shape:ts")).fontPx).toBeNull();
  expect(await drawnPx(page, "shape:ts")).toBe(44);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await text(page, "shape:ts")).fontPx).toBe(big.fontPx);

  // Survives a reload.
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect.poll(async () => (await text(page, "shape:ts")).fontPx).toBe(big.fontPx);
  await expect.poll(() => drawnPx(page, "shape:ts")).toBeCloseTo(big.fontPx!, 0);
});

test("a side handle changes only the width: the text re-wraps, its font stays", async ({ page }) => {
  await open(page);
  await page.evaluate((richText) => {
    const e = (window as any).editor;
    e.createShapes([{ id: "shape:tw", type: "text", x: 400, y: 300, props: { richText, size: "m" } }]);
    e.select("shape:tw");
  }, rt("Lakers moneyline tonight at home"));
  const before = await settled(page, "shape:tw");

  // Right side in to about half: two or more lines, same font size.
  await dragFrom(page, "shape:tw", 1, 0.5, -before.bw / 2, 0);
  const narrow = await text(page, "shape:tw");
  expect(narrow.fontPx).toBeNull();
  expect(narrow.scale).toBe(1);
  expect(narrow.autoSize).toBe(false);
  expect(await drawnPx(page, "shape:tw")).toBe(24);
  expect(narrow.bw).toBeLessThan(before.bw * 0.6);
  expect(narrow.bh).toBeGreaterThan(before.bh * 1.5);

  // Then a corner on the wrapped text: font and width scale together.
  await dragFrom(page, "shape:tw", 1, 1, narrow.bw / 2, narrow.bh / 2);
  const big = await text(page, "shape:tw");
  expect(big.fontPx).toBeGreaterThan(24 * 1.3);
  expect(big.w).toBeGreaterThan(narrow.w * 1.3);
  // Still wrapped the same way: the box grew in proportion.
  expect(big.bh / big.bw).toBeCloseTo(narrow.bh / narrow.bw, 1);
});
