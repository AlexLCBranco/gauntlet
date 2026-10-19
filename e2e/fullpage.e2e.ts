import { expect, test, type Page } from "@playwright/test";

import { seedBoard } from "./helpers";

/**
 * The page fills the whole window, in any window size: no bars at the sides
 * or top and bottom, and all of it is real page (shapes can be drawn right
 * up to the window's edges). The page follows the window when it is
 * resized. Content keeps its place: a window too small for it zooms out
 * just enough to show all of it, the page still filling the window.
 * Fresh, empty browser profile per test; `window.editor` is tldraw's editor.
 */

type Pt = { x: number; y: number };
type Bounds = { x: number; y: number; w: number; h: number };

const BIG = { width: 1915, height: 910 };
const LAPTOP = { width: 1366, height: 768 };

const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) =>
  page.evaluate(([src, a]) => new Function("e", "a", `return (${src})(e, a)`)((window as any).editor, a), [fn.toString(), arg] as const) as Promise<T>;

async function open(page: Page) {
  await page.goto("/whiteboard/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const screen = (page: Page, p: Pt) => ed(page, (e, p: Pt) => e.pageToScreen(p), p);
const pageBounds = (page: Page) => ed(page, (e) => ({ ...e.getCameraOptions().constraints.bounds }) as Bounds);
const view = (page: Page) =>
  ed(page, (e) => {
    const b = e.getViewportPageBounds();
    return { x: b.x, y: b.y, w: b.w, h: b.h, z: e.getZoomLevel() as number };
  });
const boundsOf = (page: Page, id: string) =>
  ed(page, (e, id: string) => {
    const b = e.getShapePageBounds(id);
    return { x: b.x, y: b.y, w: b.w, h: b.h } as Bounds;
  }, id);
const shapeIds = (page: Page) => ed(page, (e) => e.getCurrentPageShapes().map((s: any) => s.id) as string[]);

/** No bars: the page covers the whole window, and the camera shows the
    page exactly (at 100%: nothing past its edges, nothing of it hidden). */
async function expectFillsWindow(page: Page) {
  const size = page.viewportSize()!;
  await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
  const sheet = (await page.getByTestId("sheet").boundingBox())!;
  expect(sheet.x).toBeCloseTo(0, 0);
  expect(sheet.y).toBeCloseTo(0, 0);
  expect(sheet.width).toBeCloseTo(size.width, 0);
  expect(sheet.height).toBeCloseTo(size.height, 0);
  const p = await pageBounds(page);
  const v = await view(page);
  for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(v[k] - p[k])).toBeLessThan(0.5);
  // At every edge and corner of the window the page is on top of the
  // darker surround, never the surround alone.
  const spots: [number, number][] = [
    [1, 1], [size.width - 2, 1], [1, size.height - 2], [size.width - 2, size.height - 2],
    [size.width / 2, 1], [size.width / 2, size.height - 2], [1, size.height / 2], [size.width - 2, size.height / 2],
  ];
  const onTop = await page.evaluate((spots) =>
    spots.map(([x, y]) => {
      const stack = document.elementsFromPoint(x, y);
      const s = stack.findIndex((n) => n.getAttribute("data-testid") === "sheet");
      const o = stack.findIndex((n) => n.classList.contains("gauntlet-outside"));
      return s >= 0 && (o < 0 || s < o);
    }), spots);
  expect(onTop).toEqual(spots.map(() => true));
}

/** A rectangle drawn with the mouse between two screen points. Its id. */
async function drawRect(page: Page, a: Pt, b: Pt): Promise<string> {
  const before = await shapeIds(page);
  await page.keyboard.press("2");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const added = (await shapeIds(page)).filter((id) => !before.includes(id));
  expect(added).toHaveLength(1);
  return added[0];
}

/** Whole shape on screen, inside the window. */
async function expectOnScreen(page: Page, id: string) {
  const size = page.viewportSize()!;
  const b = await boundsOf(page, id);
  const tl = await screen(page, { x: b.x, y: b.y });
  const br = await screen(page, { x: b.x + b.w, y: b.y + b.h });
  expect(tl.x).toBeGreaterThanOrEqual(-0.5);
  expect(tl.y).toBeGreaterThanOrEqual(-0.5);
  expect(br.x).toBeLessThanOrEqual(size.width + 0.5);
  expect(br.y).toBeLessThanOrEqual(size.height + 0.5);
}

for (const size of [BIG, LAPTOP]) {
  test(`no bars at ${size.width}x${size.height}: the page fills the window, nothing scrolls, and its edges are real page`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    await expectFillsWindow(page);
    // An empty page is the window's size, one page unit per pixel.
    expect(await pageBounds(page)).toEqual({ x: 0, y: 0, w: size.width, h: size.height });
    expect((await view(page)).z).toBeCloseTo(1, 6);
    // At 100% there's nowhere to scroll to.
    const before = await view(page);
    await page.mouse.move(size.width / 2, size.height / 2);
    for (const [dx, dy] of [[-3000, 0], [3000, 0], [0, -3000], [0, 3000]]) {
      for (let i = 0; i < 3; i++) await page.mouse.wheel(dx / 3, dy / 3);
      expect(await view(page)).toEqual(before);
    }
    // Shapes drawn against the right edge and the bottom edge of the window
    // stay where they were drawn: that space is page, not background.
    const right = await drawRect(page, { x: size.width - 160, y: size.height / 2 - 40 }, { x: size.width - 4, y: size.height / 2 + 40 });
    const bottom = await drawRect(page, { x: size.width / 2 - 80, y: size.height - 90 }, { x: size.width / 2 + 80, y: size.height - 4 });
    await page.waitForTimeout(300); // a tick or two, for anything that pulls shapes inside
    const r = await boundsOf(page, right);
    const b = await boundsOf(page, bottom);
    expect(r.x + r.w).toBeCloseTo(size.width - 4, 0);
    expect(b.y + b.h).toBeCloseTo(size.height - 4, 0);
    await expectFillsWindow(page);
  });
}

test("resizing the window resizes the page with it", async ({ page }) => {
  await page.setViewportSize(BIG);
  await open(page);
  await expectFillsWindow(page);
  for (const size of [LAPTOP, { width: 1600, height: 1000 }, { width: 900, height: 900 }, { width: 1800, height: 600 }, BIG]) {
    await page.setViewportSize(size);
    await expect.poll(() => pageBounds(page)).toEqual({ x: 0, y: 0, w: size.width, h: size.height });
    await expectFillsWindow(page);
  }
  // Zoomed in, a resize keeps the zoom and the view stays on the page.
  await page.keyboard.down("Control");
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await expect(page.getByTestId("zoom-percent")).not.toHaveText("100%");
  await page.setViewportSize(LAPTOP);
  await expect.poll(() => pageBounds(page)).toEqual({ x: 0, y: 0, w: LAPTOP.width, h: LAPTOP.height });
  await expect(page.getByTestId("zoom-percent")).not.toHaveText("100%");
  const v = await view(page);
  expect(v.x).toBeGreaterThanOrEqual(-0.5);
  expect(v.y).toBeGreaterThanOrEqual(-0.5);
  expect(v.x + v.w).toBeLessThanOrEqual(LAPTOP.width + 0.5);
  expect(v.y + v.h).toBeLessThanOrEqual(LAPTOP.height + 0.5);
  await page.getByTestId("zoom-percent").click();
  await expectFillsWindow(page);
});

test("content near the right edge at 1915x910 is all visible at laptop size: zoomed out, never moved", async ({ page }) => {
  await page.setViewportSize(BIG);
  await open(page);
  const id = await drawRect(page, { x: BIG.width - 140, y: 300 }, { x: BIG.width - 10, y: 400 });
  const drawn = await boundsOf(page, id);
  expect(drawn.x + drawn.w).toBeGreaterThan(LAPTOP.width + 400); // well past a laptop's width

  // The window shrinks to laptop size.
  await page.setViewportSize(LAPTOP);
  await expect.poll(async () => (await view(page)).z).toBeLessThan(0.99);
  expect(await boundsOf(page, id)).toEqual(drawn);
  await expectOnScreen(page, id);
  await expectFillsWindow(page);
  // Zoomed out just enough: the shape's right edge is at the window's.
  expect((await view(page)).z).toBeCloseTo(LAPTOP.width / (drawn.x + drawn.w), 3);

  // Opening the page on a laptop: the same.
  await page.waitForTimeout(800); // saved (tldraw saves to IndexedDB)
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect.poll(async () => (await view(page)).z).toBeLessThan(0.99);
  expect(await boundsOf(page, id)).toEqual(drawn);
  await expectOnScreen(page, id);
  await expectFillsWindow(page);

  // Editing something else there doesn't pull it in either.
  const other = await drawRect(page, { x: 200, y: 200 }, { x: 300, y: 280 });
  await page.keyboard.press("v");
  const o = await boundsOf(page, other);
  const from = await screen(page, { x: o.x + o.w / 2, y: o.y + 1 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await boundsOf(page, id)).toEqual(drawn);

  // Back in the big window: 1 pixel per unit again, shape where it was.
  await page.setViewportSize(BIG);
  await expect.poll(async () => (await view(page)).z).toBeCloseTo(1, 6);
  expect(await boundsOf(page, id)).toEqual(drawn);
  await expectFillsWindow(page);
});

test("existing content survives: a page drawn on the old 1920x1080 sheet keeps every shape and board where it was, in any window", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  // Content as the old build left it: anywhere on the fixed 1920x1080
  // sheet, right into its far corner, in the same saved format.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const made = await ed(page, (e, boardId: string) => {
    const shapes = [
      { type: "geo", x: 0, y: 0, props: { w: 200, h: 120, geo: "rectangle" } },
      { type: "geo", x: 1700, y: 900, props: { w: 220, h: 180, geo: "ellipse" } },
      { type: "text", x: 1500, y: 60, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "far right" }] }] } } },
      { type: "geo", x: 40, y: 960, props: { w: 300, h: 120, geo: "rectangle" } },
    ];
    e.createShapes(shapes);
    // A Boardkit board in the lower right.
    e.createShapes([{ type: "boardkit-board", x: 1100, y: 500, props: { boardId } }]);
    // A second page with content in the far corner too.
    const second = e.getCurrentPageId();
    const id = "page:old2";
    e.createPage({ id, name: "Old 2" });
    e.setCurrentPage(id);
    e.createShapes([{ type: "geo", x: 1800, y: 1000, props: { w: 120, h: 80, geo: "rectangle" } }]);
    e.setCurrentPage(second);
    return true;
  }, boardId);
  expect(made).toBe(true);
  const snapshot = () =>
    ed(page, (e) =>
      e.getPages().map((p: any) =>
        [...e.getPageShapeIds(p.id)].sort().map((id: string) => {
          const s = e.getShape(id);
          return { id, x: s.x, y: s.y, rotation: s.rotation, props: JSON.stringify(s.props) };
        }),
      ),
    );
  // The board sizes itself to its content, then settles.
  await expect.poll(() => ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board")?.props.scale ?? 0)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const before = await snapshot();
  expect(before.flat()).toHaveLength(6);
  const board = before[0].find((s) => s.props.includes(boardId))!;
  expect(JSON.parse(board.props).scale).toBeGreaterThan(0);
  await page.waitForTimeout(800); // saved

  for (const size of [BIG, LAPTOP, { width: 1000, height: 1000 }, { width: 2200, height: 900 }]) {
    await page.setViewportSize(size);
    await page.reload();
    await page.waitForFunction(() => "editor" in window);
    await expect(page.getByTestId("sheet")).toBeVisible();
    await expect(page.locator("[data-boardkit-board]")).toBeVisible();
    await page.waitForTimeout(500);
    expect(await snapshot()).toEqual(before);
    await expectFillsWindow(page);
    for (const id of await shapeIds(page)) await expectOnScreen(page, id);
    // The second page too.
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByTestId("page-position")).toHaveText(/2 \/ 2/);
    await expectFillsWindow(page);
    for (const id of await shapeIds(page)) await expectOnScreen(page, id);
    await page.getByRole("button", { name: "Previous page" }).click();
    expect(await snapshot()).toEqual(before);
  }
});

test("two tabs: a shape drawn near the edge in a big window shows whole in a laptop-sized tab, and editing there never pulls it in", async ({ page, context }) => {
  await page.setViewportSize(LAPTOP);
  await open(page);
  const big = await context.newPage();
  await big.setViewportSize(BIG);
  await open(big);
  const id = await drawRect(big, { x: BIG.width - 140, y: BIG.height - 120 }, { x: BIG.width - 10, y: BIG.height - 20 });
  const drawn = await boundsOf(big, id);

  // tldraw syncs tabs; the small tab's page grows to cover it, zoomed out.
  await expect.poll(async () => (await shapeIds(page)).includes(id), { timeout: 10_000 }).toBe(true);
  // (A background tab catches up on its next frames.)
  await expect(() => expectOnScreen(page, id)).toPass({ timeout: 5_000 });
  expect(await boundsOf(page, id)).toEqual(drawn);
  await expectFillsWindow(page);

  // An edit in the small tab: the far shape stays put in both tabs.
  await drawRect(page, { x: 100, y: 100 }, { x: 200, y: 180 });
  await page.waitForTimeout(500);
  expect(await boundsOf(page, id)).toEqual(drawn);
  await expect.poll(() => boundsOf(big, id)).toEqual(drawn);
});
