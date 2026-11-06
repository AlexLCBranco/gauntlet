import { expect, test, type Page } from "./test";

/**
 * The style panel: collapse and left/right (owner, Edges round item 5;
 * src/style/panelPlace.ts). Fresh profile, 1600 × 1000.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const select = (page: Page, id: string) => page.evaluate((id) => void (window as any).editor.select(id), id);
const rect = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
  }, sel);
const overlap = (a: { l: number; t: number; r: number; b: number }, b: { l: number; t: number; r: number; b: number }) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

async function twoRects(page: Page) {
  await page.evaluate(() => {
    const e = (window as any).editor;
    e.createShapes([
      { id: "shape:s1", type: "geo", x: 600, y: 300, props: { w: 200, h: 120 } },
      { id: "shape:s2", type: "geo", x: 900, y: 300, props: { w: 200, h: 120 } },
    ]);
  });
}

test("collapse to a tab at the edge, stays collapsed while other things are selected, one click opens it; switch sides; both remembered after a reload", async ({ page }) => {
  await open(page);
  await twoRects(page);
  await select(page, "shape:s1");
  const panel = page.getByTestId("style-panel");
  await expect(panel).toHaveAttribute("data-side", "left");
  expect((await rect(page, '[data-testid="style-panel"]'))!.l).toBeLessThan(20);

  await page.getByTestId("style-panel-collapse").click();
  await expect(panel).toHaveCount(0);
  const tab = page.getByTestId("style-panel-tab");
  await expect(tab).toBeVisible();
  expect((await rect(page, '[data-testid="style-panel-tab"]'))!.l).toBe(0);
  await select(page, "shape:s2");
  await expect(panel).toHaveCount(0);
  await expect(tab).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await select(page, "shape:s1");
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(panel).toBeVisible();

  // To the right, and remembered.
  await page.getByTestId("style-panel-side").click();
  await expect(panel).toHaveAttribute("data-side", "right");
  expect((await rect(page, '[data-testid="style-panel"]'))!.r).toBeGreaterThan(1580);
  await page.getByTestId("style-panel-collapse").click();
  expect((await rect(page, '[data-testid="style-panel-tab"]'))!.r).toBe(1600);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await select(page, "shape:s2");
  await expect(page.getByTestId("style-panel-tab")).toHaveAttribute("data-side", "right");
  await page.getByTestId("style-panel-tab").click();
  await expect(panel).toHaveAttribute("data-side", "right");
});

test("on either side, the panel covers neither the toolbar, the page arrows and save status, the zoom, nor tldraw's watermark; a selection's handle under it still takes the press", async ({ page }) => {
  await open(page);
  await twoRects(page);
  for (const side of ["left", "right"] as const) {
    await select(page, "shape:s1");
    const panel = page.getByTestId("style-panel");
    if ((await panel.getAttribute("data-side")) !== side) await page.getByTestId("style-panel-side").click();
    await expect(panel).toHaveAttribute("data-side", side);
    const p = (await rect(page, '[data-testid="style-panel"]'))!;
    for (const sel of ['[data-testid="toolbar"]', ".gauntlet-pages", ".gauntlet-zoom-undo .gauntlet-island", ".tl-watermark_SEE-LICENSE"]) {
      const r = await rect(page, sel);
      if (r) expect(overlap(p, r), `${side}: the panel over ${sel}`).toBe(false);
    }
    // A rectangle whose left edge lies under the panel: its handle takes the press.
    await page.evaluate(({ side, p }) => {
      const e = (window as any).editor;
      const x = side === "left" ? p.r - 40 : p.l - 160;
      e.updateShape({ id: "shape:s1", type: "geo", x, y: 400, props: { w: 200, h: 120 } });
      e.select("shape:s1");
    }, { side, p });
    const edgeX = side === "left" ? p.r - 40 : p.l - 160 + 200;
    const before = await page.evaluate(() => (window as any).editor.getShapePageBounds("shape:s1").w);
    await page.mouse.move(edgeX + (side === "left" ? 3 : -3), 460, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(edgeX + (side === "left" ? 40 : -40), 460, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.up();
    const after = await page.evaluate(() => (window as any).editor.getShapePageBounds("shape:s1").w);
    expect(after, `${side}: resized from the edge under the panel`).toBeLessThan(before - 20);
  }
  // The save status never runs over the watermark.
  const pages = (await rect(page, ".gauntlet-pages"))!;
  const wm = await rect(page, ".tl-watermark_SEE-LICENSE");
  if (wm) expect(overlap(pages, wm)).toBe(false);
});
