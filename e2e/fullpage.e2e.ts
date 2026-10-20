import { expect, test, type Page } from "@playwright/test";

import { seedBoard, whiteboardSaved } from "./helpers";

/**
 * The page and the window, as in Excalidraw. The page is at least the
 * window's size at 100% (so it fills the window, no bars) and as big as
 * what's on it. A smaller window keeps the zoom and shows part of the page:
 * content keeps its size and place, you pan to the rest, and panning stops
 * at the page's edges. Resizing never changes the zoom or moves content.
 * The page's edges are a wall while dragging and resizing: what's dragged
 * never leaves the page, at any point of the drag.
 * Fresh, empty browser profile per test; `window.editor` is tldraw's editor.
 */

type Pt = { x: number; y: number };
type Bounds = { x: number; y: number; w: number; h: number };

const BIG = { width: 1915, height: 910 };
const HALF = { width: 957, height: 910 }; // snapped to half the screen
const QUARTER = { width: 957, height: 455 };
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
const camera = (page: Page) => ed(page, (e) => ({ ...e.getCamera() }) as { x: number; y: number; z: number });
const boundsOf = (page: Page, id: string) =>
  ed(page, (e, id: string) => {
    const b = e.getShapePageBounds(id);
    return { x: b.x, y: b.y, w: b.w, h: b.h } as Bounds;
  }, id);
const selectionBounds = (page: Page) =>
  ed(page, (e) => {
    const b = e.getSelectionPageBounds();
    return { x: b.x, y: b.y, w: b.w, h: b.h } as Bounds;
  });
const shapeIds = (page: Page) => ed(page, (e) => e.getCurrentPageShapes().map((s: any) => s.id) as string[]);
const allShapes = (page: Page) =>
  ed(page, (e) =>
    e.getPages().map((p: any) =>
      [...e.getPageShapeIds(p.id)].sort().map((id: string) => {
        const s = e.getShape(id);
        return { id, x: s.x, y: s.y, rotation: s.rotation, props: JSON.stringify(s.props) };
      }),
    ),
  );

/** No bars: the page covers the whole window, the view never shows past
    its edges. */
async function expectNoBars(page: Page) {
  const size = page.viewportSize()!;
  const sheet = (await page.getByTestId("sheet").boundingBox())!;
  expect(sheet.x).toBeLessThanOrEqual(0.5);
  expect(sheet.y).toBeLessThanOrEqual(0.5);
  expect(sheet.x + sheet.width).toBeGreaterThanOrEqual(size.width - 0.5);
  expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(size.height - 0.5);
  const p = await pageBounds(page);
  const v = await view(page);
  expect(v.x).toBeGreaterThanOrEqual(p.x - 0.5);
  expect(v.y).toBeGreaterThanOrEqual(p.y - 0.5);
  expect(v.x + v.w).toBeLessThanOrEqual(p.x + p.w + 0.5);
  expect(v.y + v.h).toBeLessThanOrEqual(p.y + p.h + 0.5);
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

/** At 100%, the page exactly the window (an empty page, or one whose
    content fits the window). */
async function expectFillsWindow(page: Page) {
  await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
  await expectNoBars(page);
  const p = await pageBounds(page);
  const v = await view(page);
  for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(v[k] - p[k])).toBeLessThan(0.5);
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

/** Pans with the mouse wheel until the view stops moving (or `max` turns). */
async function panUntilStopped(page: Page, dx: number, dy: number, max = 40) {
  const size = page.viewportSize()!;
  await page.mouse.move(size.width / 2, size.height / 2);
  let last = await view(page);
  for (let i = 0; i < max; i++) {
    await page.mouse.wheel(dx, dy);
    await page.waitForTimeout(30);
    const now = await view(page);
    if (Math.abs(now.x - last.x) < 0.01 && Math.abs(now.y - last.y) < 0.01) return now;
    last = now;
  }
  return last;
}

/** Fills shapes, so they can be grabbed anywhere inside (an empty
    rectangle is grabbed by its outline; a selected one's edges resize). */
const fill = (page: Page, ids: string[]) =>
  ed(page, (e, ids: string[]) => void e.updateShapes(ids.map((id) => ({ id, type: "geo", props: { fill: "solid" } }))), ids);
const middle = async (page: Page, id: string) => {
  const b = await boundsOf(page, id);
  return screen(page, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
};

const inside = (b: Bounds, p: Bounds, slack = 0.5) => b.x >= p.x - slack && b.y >= p.y - slack && b.x + b.w <= p.x + p.w + slack && b.y + b.h <= p.y + p.h + slack;

/** Drags with the mouse from `from` to `to` (screen points) in `steps`,
    and after every step reads `check()`: the readings, the last one taken
    just before the drop, and one after the drop. `to` is held inside the
    window (the pointer at the window's edge, as when a hand drags to the
    edge of the screen) unless `outside`. */
async function dragWatching<T>(page: Page, from: Pt, target: Pt, check: () => Promise<T>, steps = 24, outside = false) {
  const size = page.viewportSize()!;
  const to = outside ? target : { x: Math.min(Math.max(target.x, 1), size.width - 2), y: Math.min(Math.max(target.y, 1), size.height - 2) };
  const during: T[] = [];
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    during.push(await check());
  }
  await page.mouse.up();
  await page.waitForTimeout(300); // a few frames, for anything that would pull it in afterwards
  return { during, after: await check() };
}

for (const size of [BIG, LAPTOP]) {
  test(`no bars at ${size.width}x${size.height}: the page fills the window, nothing scrolls, and its edges are real page`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    await expectFillsWindow(page);
    // An empty page is the window's size, one page unit per pixel.
    expect(await pageBounds(page)).toEqual({ x: 0, y: 0, w: size.width, h: size.height });
    expect((await view(page)).z).toBeCloseTo(1, 6);
    // At 100% on a page the window's size there's nowhere to scroll to.
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

test("an empty page follows the window's size; the zoom never changes on a resize", async ({ page }) => {
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
  const zoomed = (await view(page)).z;
  expect(zoomed).toBeGreaterThan(1.05);
  for (const size of [LAPTOP, HALF, QUARTER, BIG]) {
    await page.setViewportSize(size);
    await expect.poll(async () => (await pageBounds(page)).w).toBe(size.width);
    expect((await view(page)).z).toBeCloseTo(zoomed, 6);
    await expectNoBars(page);
  }
  await page.getByTestId("zoom-percent").click();
  await expectFillsWindow(page);
});

test("snapped to half width: zoom and content unchanged, panning reaches every part of the page and stops at each edge, full size restores the view", async ({ page }) => {
  await page.setViewportSize(BIG);
  await open(page);
  // Shapes all over the page, up to its far edges.
  const ids = [
    await drawRect(page, { x: 40, y: 40 }, { x: 240, y: 160 }),
    await drawRect(page, { x: BIG.width - 200, y: 60 }, { x: BIG.width - 10, y: 180 }),
    await drawRect(page, { x: 900, y: 400 }, { x: 1100, y: 520 }),
    await drawRect(page, { x: BIG.width - 300, y: BIG.height - 150 }, { x: BIG.width - 6, y: BIG.height - 6 }),
    await drawRect(page, { x: 30, y: BIG.height - 120 }, { x: 330, y: BIG.height - 8 }),
  ];
  await page.waitForTimeout(300);
  await expectFillsWindow(page);
  const original = await allShapes(page);
  const originalCamera = await camera(page);
  const screenOf = async () => Promise.all(ids.map(async (id) => screen(page, await boundsOf(page, id))));
  const originalScreen = await screenOf();

  for (const size of [HALF, QUARTER]) {
    await page.setViewportSize(size);
    // The zoom stays at 100%; nothing on the page moved or changed size,
    // and what's still in the window is where it was on screen.
    const end = await ed(page, (e) => ({ x: e.getCurrentPageBounds().maxX as number, y: e.getCurrentPageBounds().maxY as number }));
    await expect.poll(() => pageBounds(page)).toEqual({ x: 0, y: 0, w: Math.max(size.width, end.x), h: Math.max(size.height, end.y) });
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
    expect((await view(page)).z).toBeCloseTo(1, 6);
    expect(await allShapes(page)).toEqual(original);
    expect((await screenOf())[0]).toEqual(originalScreen[0]);
    // The page never shrinks below its content (here past the window).
    const p = await pageBounds(page);
    expect(p.w).toBeGreaterThan(size.width);
    await expectNoBars(page);

    // Pan right and down until it stops: the view's far edges are the page's.
    let v = await panUntilStopped(page, 400, 0);
    expect(v.x + v.w).toBeCloseTo(p.w, 1);
    v = await panUntilStopped(page, 0, 400);
    expect(v.y + v.h).toBeCloseTo(p.h, 1);
    await expectNoBars(page);
    // The far corner's shape is reachable and whole on screen there.
    const far = await boundsOf(page, ids[3]);
    const tl = await screen(page, far);
    const br = await screen(page, { x: far.x + far.w, y: far.y + far.h });
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(br.x).toBeLessThanOrEqual(size.width + 0.5);
    expect(br.y).toBeLessThanOrEqual(size.height + 0.5);
    // More wheel past the edge does nothing.
    const atEdge = await view(page);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(800, 800);
    await page.waitForTimeout(50);
    expect(await view(page)).toEqual(atEdge);
    // Back left and up: stops at the page's left and top edges.
    v = await panUntilStopped(page, -400, 0);
    expect(v.x).toBeCloseTo(0, 1);
    v = await panUntilStopped(page, 0, -400);
    expect(v.y).toBeCloseTo(0, 1);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(-800, -800);
    await page.waitForTimeout(50);
    expect((await view(page)).x).toBeCloseTo(0, 1);
    expect((await view(page)).y).toBeCloseTo(0, 1);
    await expectNoBars(page);
    expect(await allShapes(page)).toEqual(original);
  }

  // Space + drag pans too, and the hand tool; both stop at the edges.
  await page.mouse.move(600, 300);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(100, 100, { steps: 6 });
  await page.mouse.move(-2000, -2000, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const pb = await pageBounds(page);
  let v = await view(page);
  expect(v.x + v.w).toBeCloseTo(pb.w, 1);
  expect(v.y + v.h).toBeCloseTo(pb.h, 1);
  await page.keyboard.press("h");
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 6 });
  await page.mouse.move(3000, 3000, { steps: 6 });
  await page.mouse.up();
  v = await view(page);
  expect(v.x).toBeCloseTo(0, 1);
  expect(v.y).toBeCloseTo(0, 1);
  await page.keyboard.press("v");
  expect(await allShapes(page)).toEqual(original);

  // Back to full size: the original view, every shape where it was on screen.
  await page.setViewportSize(BIG);
  await expect.poll(() => pageBounds(page)).toEqual({ x: 0, y: 0, w: BIG.width, h: BIG.height });
  expect(await camera(page)).toEqual(originalCamera);
  expect(await screenOf()).toEqual(originalScreen);
  expect(await allShapes(page)).toEqual(original);
  await expectFillsWindow(page);
});

test("existing content survives: a page drawn on the old 1920x1080 sheet keeps every shape and board where it was, in any window, at 100%", async ({ page, context }) => {
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
  // The board sizes itself to its content, then settles.
  await expect.poll(() => ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board")?.props.scale ?? 0)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const before = await allShapes(page);
  expect(before.flat()).toHaveLength(6);
  await whiteboardSaved(page);

  const covers = async () => {
    const p = await pageBounds(page);
    for (const id of await shapeIds(page)) expect(inside(await boundsOf(page, id), p, 0.01)).toBe(true);
  };
  for (const size of [BIG, LAPTOP, HALF, { width: 1000, height: 1000 }, { width: 2200, height: 900 }]) {
    await page.setViewportSize(size);
    await whiteboardSaved(page);
    await page.reload();
    await page.waitForFunction(() => "editor" in window);
    await expect(page.getByTestId("sheet")).toBeVisible();
    await expect(page.locator("[data-boardkit-board]")).toBeVisible();
    await page.waitForTimeout(500);
    expect(await allShapes(page)).toEqual(before);
    // Opens at 100%, top left; no bars; the page covers every shape.
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
    const opened = await view(page);
    expect(opened.x).toBeCloseTo(0, 6);
    expect(opened.y).toBeCloseTo(0, 6);
    await expectNoBars(page);
    await covers();
    // The second page too.
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByTestId("page-position")).toHaveText(/2 \/ 2/);
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
    await expectNoBars(page);
    await covers();
    await page.getByRole("button", { name: "Previous page" }).click();
    expect(await allShapes(page)).toEqual(before);
  }
});

test("two tabs: a shape drawn near the edge in a big window grows the laptop tab's page, at 100%, never pulled in", async ({ page, context }) => {
  await page.setViewportSize(LAPTOP);
  await open(page);
  const big = await context.newPage();
  await big.setViewportSize(BIG);
  await open(big);
  const id = await drawRect(big, { x: BIG.width - 140, y: BIG.height - 120 }, { x: BIG.width - 10, y: BIG.height - 20 });
  const drawn = await boundsOf(big, id);

  // tldraw syncs tabs; the small tab's page grows to cover it.
  await expect.poll(async () => (await shapeIds(page)).includes(id), { timeout: 10_000 }).toBe(true);
  // (A background tab catches up on its next frames.)
  await expect.poll(async () => inside(drawn, await pageBounds(page), 0.01), { timeout: 5_000 }).toBe(true);
  expect(await boundsOf(page, id)).toEqual(drawn);
  await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
  await expectNoBars(page);

  // An edit in the small tab: the far shape stays put in both tabs.
  await drawRect(page, { x: 100, y: 100 }, { x: 200, y: 180 });
  await page.waitForTimeout(500);
  expect(await boundsOf(page, id)).toEqual(drawn);
  await expect.poll(() => boundsOf(big, id)).toEqual(drawn);
});

// ---- The edge wall --------------------------------------------------------

const EDGES = [
  { name: "right", dx: 1, dy: 0.3 },
  { name: "left", dx: -1, dy: -0.3 },
  { name: "bottom", dx: 0.3, dy: 1 },
  { name: "top", dx: -0.3, dy: -1 },
];

for (const size of [BIG, HALF]) {
  test(`at ${size.width}x${size.height}, a shape dragged past each edge stops at it during the drag and slides along it; no jump on the drop`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    const id = await drawRect(page, { x: size.width / 2 - 60, y: size.height / 2 - 40 }, { x: size.width / 2 + 60, y: size.height / 2 + 40 });
    await page.keyboard.press("v");
    await fill(page, [id]);
    const p = await pageBounds(page);
    const start = await boundsOf(page, id);
    // Each drag starts from the middle of the window (clear of the style
    // panel, which shows on the left while something is selected).
    const toMiddle = () => ed(page, (e, a: { id: string; x: number; y: number }) => void e.updateShape({ id: a.id, type: "geo", x: a.x, y: a.y }), { id, x: start.x, y: start.y });
    for (const edge of EDGES) {
      await toMiddle();
      const from = await middle(page, id);
      const to = { x: from.x + edge.dx * 2000, y: from.y + edge.dy * 2000 };
      const { during, after } = await dragWatching(page, from, to, () => boundsOf(page, id));
      for (const d of during) expect(inside(d, p), `${edge.name} edge, mid-drag ${JSON.stringify(d)}`).toBe(true);
      const last = during[during.length - 1];
      // It reached the edge, and kept its size.
      if (edge.name === "right") expect(last.x + last.w).toBeCloseTo(p.x + p.w, 0);
      if (edge.name === "left") expect(last.x).toBeCloseTo(p.x, 0);
      if (edge.name === "bottom") expect(last.y + last.h).toBeCloseTo(p.y + p.h, 0);
      if (edge.name === "top") expect(last.y).toBeCloseTo(p.y, 0);
      expect(last.w).toBeCloseTo(start.w, 3);
      expect(last.h).toBeCloseTo(start.h, 3);
      // No snap-back: where it was just before the drop is where it stays.
      expect(after).toEqual(last);
    }
    // Sliding: dragged along the right edge it keeps following up and down.
    await toMiddle();
    const from = await middle(page, id);
    const { during } = await dragWatching(page, from, { x: from.x + 800, y: from.y - 200 }, () => boundsOf(page, id), 12);
    const ys = during.map((d) => d.y);
    expect(ys[ys.length - 1]).toBeLessThan(ys[0] - 100);
    for (const d of during) expect(inside(d, p)).toBe(true);
  });
}

test("a multi-selection dragged past each edge stops as one at the edge during the drag, keeping its shape", async ({ page }) => {
  await page.setViewportSize(HALF);
  await open(page);
  const a = await drawRect(page, { x: 300, y: 300 }, { x: 400, y: 380 });
  const b = await drawRect(page, { x: 450, y: 420 }, { x: 600, y: 500 });
  await page.keyboard.press("v");
  await fill(page, [a, b]);
  await page.keyboard.press("Control+a");
  const p = await pageBounds(page);
  const gap = async () => {
    const A = await boundsOf(page, a);
    const B = await boundsOf(page, b);
    return { x: B.x - A.x, y: B.y - A.y };
  };
  const startGap = await gap();
  for (const edge of EDGES) {
    const from = await middle(page, a);
    const { during, after } = await dragWatching(page, from, { x: from.x + edge.dx * 2000, y: from.y + edge.dy * 2000 }, async () => ({ sel: await selectionBounds(page), gap: await gap() }));
    for (const d of during) {
      expect(inside(d.sel, p), `${edge.name} edge, mid-drag`).toBe(true);
      expect(d.gap.x).toBeCloseTo(startGap.x, 3);
      expect(d.gap.y).toBeCloseTo(startGap.y, 3);
    }
    expect(after).toEqual(during[during.length - 1]);
  }
});

test("an image and a Boardkit board widget dragged past the edges stay inside the page during the drag", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await page.setViewportSize(HALF);
  await open(page);
  const ids = await ed(page, (e, boardId: string) => {
    // A small picture, as if dropped in.
    const src = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#c33"/></svg>');
    e.createAssets([{ id: "asset:pic", typeName: "asset", type: "image", props: { name: "pic.svg", src, w: 160, h: 100, mimeType: "image/svg+xml", isAnimated: false }, meta: {} }]);
    e.createShapes([{ id: "shape:pic", type: "image", x: 300, y: 300, props: { assetId: "asset:pic", w: 160, h: 100 } }]);
    e.createShapes([{ id: "shape:board", type: "boardkit-board", x: 200, y: 520, props: { boardId } }]);
    return ["shape:pic", "shape:board"];
  }, boardId);
  await expect(page.locator("[data-boardkit-board]")).toBeVisible();
  await page.waitForTimeout(600); // the board sizes itself
  const p = await pageBounds(page);
  // One widget at a time (the other out of the way), each drag from the
  // middle of the window (clear of the style panel on the left).
  const home = await ed(page, (e, ids: string[]) => ids.map((id) => ({ id, type: e.getShape(id).type, x: e.getShape(id).x, y: e.getShape(id).y })), ids);
  for (const id of ids) {
    await ed(page, (e, a: { id: string; home: { id: string; type: string }[] }) => void e.updateShapes(a.home.map((h) => (h.id === a.id ? { ...h, opacity: 1 } : { ...h, opacity: 0, isLocked: true }))), { id, home });
    const self = home.find((h) => h.id === id)!;
    for (const edge of EDGES) {
      await ed(page, (e, h: { id: string; type: string; x: number; y: number }) => {
        const b = e.getShapePageBounds(h.id);
        const v = e.getViewportPageBounds();
        e.updateShape({ id: h.id, type: h.type, x: v.midX - b.w / 2 + 80, y: v.midY - b.h / 2 });
        e.select(h.id);
      }, self);
      const s = await boundsOf(page, id);
      const from = await middle(page, id);
      const { during, after } = await dragWatching(page, from, { x: from.x + edge.dx * 2000, y: from.y + edge.dy * 2000 }, () => boundsOf(page, id));
      expect(during.some((d) => d.x !== s.x || d.y !== s.y), `${id} moved`).toBe(true);
      for (const d of during) expect(inside(d, p), `${id} ${edge.name} edge, mid-drag ${JSON.stringify(d)}`).toBe(true);
      expect(after).toEqual(during[during.length - 1]);
    }
    await ed(page, (e, home: { id: string; type: string }[]) => void e.updateShapes(home.map((h) => ({ id: h.id, type: h.type, isLocked: false }))), home);
  }
});

test("resizing: a corner handle stops at the page's edge during the drag (free and locked aspect, multi-selection too)", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await page.setViewportSize(HALF);
  await open(page);
  const rect = await drawRect(page, { x: 300, y: 300 }, { x: 420, y: 380 });
  await page.keyboard.press("v");
  const p = await pageBounds(page);
  type Corner = "br" | "bl" | "tl";
  const handle = async (corner: Corner) => {
    const s = await selectionBounds(page);
    return screen(page, { x: corner === "br" ? s.x + s.w : s.x, y: corner === "tl" ? s.y : s.y + s.h });
  };
  const resizeTo = async (corner: Corner, to: (from: Pt) => Pt) => {
    const from = await handle(corner);
    // The pointer goes past the window's edge (the handle has no offset
    // from the pointer, so inside the window it never reaches the page's).
    return dragWatching(page, from, to(from), () => selectionBounds(page), 24, true);
  };

  // A rectangle: the bottom-right handle past the right edge, the
  // bottom-left past the bottom, the top-left past the top-left corner.
  await ed(page, (e, id: string) => void e.select(id), rect);
  for (const [corner, to] of [
    ["br", (f: Pt) => ({ x: f.x + 2000, y: f.y + 50 })],
    ["bl", (f: Pt) => ({ x: f.x + 30, y: f.y + 2000 })],
    ["tl", (f: Pt) => ({ x: f.x - 2000, y: f.y - 2000 })],
  ] as const) {
    const { during, after } = await resizeTo(corner, to);
    for (const d of during) expect(inside(d, p), `resize ${corner}, mid-drag ${JSON.stringify(d)}`).toBe(true);
    expect(after).toEqual(during[during.length - 1]);
  }
  let r = await boundsOf(page, rect);
  // Reached the edges it was pushed against.
  expect(r.x).toBeCloseTo(0, 0);
  expect(r.y).toBeCloseTo(0, 0);
  expect(r.x + r.w).toBeCloseTo(p.w, 0);
  expect(r.y + r.h).toBeCloseTo(p.h, 0);

  // A Boardkit board widget (scales like a picture, aspect locked).
  await ed(page, (e) => void e.deleteShapes([...e.getCurrentPageShapeIds()]));
  await ed(page, (e, boardId: string) => {
    e.createShapes([{ id: "shape:board", type: "boardkit-board", x: 100, y: 100, props: { boardId } }]);
    e.select("shape:board");
  }, boardId);
  await expect(page.locator("[data-boardkit-board]")).toBeVisible();
  await page.waitForTimeout(600);
  {
    const { during, after } = await resizeTo("br", (f) => ({ x: f.x + 2000, y: f.y + 600 }));
    expect(during.some((d) => d.w > during[0].w - 0.5)).toBe(true);
    for (const d of during) expect(inside(d, p), `board resize, mid-drag ${JSON.stringify(d)}`).toBe(true);
    expect(after).toEqual(during[during.length - 1]);
  }

  // A multi-selection.
  await ed(page, (e) => void e.deleteShapes([...e.getCurrentPageShapeIds()]));
  await drawRect(page, { x: 300, y: 300 }, { x: 400, y: 380 });
  await drawRect(page, { x: 450, y: 420 }, { x: 600, y: 500 });
  await page.keyboard.press("v");
  await page.keyboard.press("Control+a");
  {
    const { during, after } = await resizeTo("br", (f) => ({ x: f.x + 2000, y: f.y + 2000 }));
    for (const d of during) expect(inside(d, p), `multi resize, mid-drag ${JSON.stringify(d)}`).toBe(true);
    expect(after).toEqual(during[during.length - 1]);
    r = during[during.length - 1];
    expect(Math.max(r.x + r.w - p.w, r.y + r.h - p.h)).toBeGreaterThan(-1); // it reached an edge
  }
});

test("a rectangle drawn past the edge, a pen stroke and a line's end stop at the page's edge while drawing", async ({ page }) => {
  await page.setViewportSize(HALF);
  await open(page);
  const p = await pageBounds(page);
  // Drawing starts inside; the pointer then leaves the window's (and the page's) right edge.
  for (const key of ["2", "7", "6"]) {
    const before = await shapeIds(page);
    await page.keyboard.press(key);
    const { during } = await dragWatching(page, { x: HALF.width - 200, y: 400 }, { x: HALF.width + 400, y: 470 }, async () => {
      const added = (await shapeIds(page)).filter((id) => !before.includes(id));
      return added.length ? boundsOf(page, added[0]) : null;
    }, 24, true);
    await page.keyboard.press("Escape");
    for (const d of during) if (d) expect(inside(d, p, 2), `tool ${key}, mid-draw ${JSON.stringify(d)}`).toBe(true);
    expect(during.filter(Boolean).length).toBeGreaterThan(0);
  }
});
