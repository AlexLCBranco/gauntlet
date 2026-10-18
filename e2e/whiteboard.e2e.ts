import { expect, test, type Page } from "@playwright/test";

/**
 * The whiteboard (whiteboard phase 1: the floor) at /whiteboard/. Fresh,
 * empty browser profile per test, so every shape here is made by the test.
 * The page's `window.editor` (tldraw's editor) is read to check results and
 * to turn sheet coordinates into screen points; every action itself goes
 * through the mouse and keyboard, as a person would.
 */

const SHEET = { w: 1920, h: 1080 };

type Pt = { x: number; y: number };
type Bounds = { x: number; y: number; w: number; h: number };

async function open(page: Page) {
  await page.goto("/whiteboard/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Runs `fn(editor)` in the page. */
const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) =>
  page.evaluate(([src, a]) => new Function("e", "a", `return (${src})(e, a)`)((window as any).editor, a), [fn.toString(), arg] as const) as Promise<T>;

/** Screen point of a sheet point. */
const screen = (page: Page, p: Pt) => ed(page, (e, p: Pt) => e.pageToScreen(p), p);

async function drag(page: Page, from: Pt, to: Pt, opts: { shift?: boolean } = {}) {
  const a = await screen(page, from);
  const b = await screen(page, to);
  if (opts.shift) await page.keyboard.down("Shift");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up("Shift");
}

/** Draws a loop through `points` (sheet coordinates) with the mouse down. */
async function loop(page: Page, points: Pt[], opts: { shift?: boolean; whileDown?: () => Promise<void> } = {}) {
  const s = [];
  for (const p of points) s.push(await screen(page, p));
  if (opts.shift) await page.keyboard.down("Shift");
  await page.mouse.move(s[0].x, s[0].y);
  await page.mouse.down();
  for (const p of s.slice(1)) await page.mouse.move(p.x, p.y, { steps: 6 });
  await opts.whileDown?.();
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up("Shift");
}

/** A rectangle drawn with the "2" key (Excalidraw's) and a drag. Its id. */
async function rect(page: Page, x: number, y: number, w = 120, h = 80): Promise<string> {
  const before = await shapeIds(page);
  await page.keyboard.press("2");
  await drag(page, { x, y }, { x: x + w, y: y + h });
  await page.keyboard.press("Escape");
  const after = await shapeIds(page);
  const added = after.filter((id) => !before.includes(id));
  expect(added).toHaveLength(1);
  return added[0];
}

const shapeIds = (page: Page) => ed(page, (e) => e.getCurrentPageShapes().map((s: any) => s.id) as string[]);
const selected = async (page: Page) => (await ed(page, (e) => e.getSelectedShapeIds() as string[])).sort();
const tool = (page: Page) => ed(page, (e) => e.getCurrentToolId() as string);
const boundsOf = (page: Page, id: string) =>
  ed(page, (e, id: string) => {
    const b = e.getShapePageBounds(id);
    return { x: b.x, y: b.y, w: b.w, h: b.h } as Bounds;
  }, id);
const position = (page: Page) => page.getByTestId("page-position");

test("starts dark with the whole sheet in view, and the camera can't leave the sheet", async ({ page }) => {
  await open(page);
  expect(await ed(page, (e) => e.user.getIsDarkMode())).toBe(true);

  const view = () => ed(page, (e) => {
    const b = e.getViewportPageBounds();
    return { x: b.x, y: b.y, w: b.w, h: b.h, z: e.getZoomLevel() } as Bounds & { z: number };
  });
  const fit = await view();
  // The whole sheet is in view at the start.
  expect(fit.x).toBeLessThanOrEqual(0);
  expect(fit.y).toBeLessThanOrEqual(0);
  expect(fit.x + fit.w).toBeGreaterThanOrEqual(SHEET.w);
  expect(fit.y + fit.h).toBeGreaterThanOrEqual(SHEET.h);

  const middle = await screen(page, { x: SHEET.w / 2, y: SHEET.h / 2 });
  await page.mouse.move(middle.x, middle.y);
  // Zooming out stops at the whole sheet.
  await page.keyboard.down("Control");
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 400);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await view()).z).toBeCloseTo(fit.z, 3);

  // Zoom in, then try to pan far past every edge: the view stays on the sheet.
  await page.keyboard.down("Control");
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await view()).z).toBeGreaterThan(fit.z * 1.5);
  for (const [dx, dy] of [[-5000, 0], [5000, 0], [0, -5000], [0, 5000]]) {
    for (let i = 0; i < 5; i++) await page.mouse.wheel(dx / 5, dy / 5);
    const v = await view();
    // A 24 px screen margin past the edge is allowed (the padding), no more.
    const m = 24 / v.z + 1;
    expect(v.x).toBeGreaterThanOrEqual(-m);
    expect(v.y).toBeGreaterThanOrEqual(-m);
    expect(v.x + v.w).toBeLessThanOrEqual(SHEET.w + m);
    expect(v.y + v.h).toBeLessThanOrEqual(SHEET.h + m);
  }
});

test("Excalidraw's number keys pick the tools, and each draws its shape", async ({ page }) => {
  await open(page);
  const last = () => ed(page, (e) => {
    const s = e.getCurrentPageShapesSorted().at(-1);
    return s.type === "geo" ? `geo:${s.props.geo}` : s.type;
  });
  const cases: [string, string][] = [
    ["2", "geo:rectangle"],
    ["3", "geo:diamond"],
    ["d", "geo:diamond"],
    ["4", "geo:ellipse"],
    ["5", "arrow"],
    ["6", "line"],
    ["7", "draw"],
    ["p", "draw"],
  ];
  let y = 80;
  for (const [key, type] of cases) {
    await page.keyboard.press(key);
    await drag(page, { x: 200, y }, { x: 340, y: y + 90 });
    await page.keyboard.press("Escape");
    expect(await last(), `key ${key}`).toBe(type);
    y += 110;
  }
  await page.keyboard.press("8");
  const at = await screen(page, { x: 900, y: 200 });
  await page.mouse.click(at.x, at.y);
  await page.keyboard.type("Game 1 notes");
  await page.keyboard.press("Escape");
  expect(await ed(page, (e) => e.getCurrentPageShapesSorted().at(-1).type)).toBe("text");
  for (const [key, id] of [["1", "select"], ["0", "eraser"], ["h", "hand"], ["w", "lasso"], ["v", "select"]]) {
    await page.keyboard.press(key);
    expect(await tool(page), `key ${key}`).toBe(id);
  }
});

test("box select picks only what is wholly inside the box", async ({ page }) => {
  await open(page);
  const a = await rect(page, 100, 100);
  await rect(page, 300, 100);
  await page.keyboard.press("v");
  // From empty sheet: around a, through half of b.
  await drag(page, { x: 60, y: 60 }, { x: 360, y: 220 });
  expect(await selected(page)).toEqual([a]);
});

test("lasso: a loop selects what is wholly inside, Shift adds, Escape cancels", async ({ page }) => {
  await open(page);
  const a = await rect(page, 100, 100);
  const b = await rect(page, 300, 100);
  const c = await rect(page, 500, 100);

  await page.keyboard.press("w");
  expect(await tool(page)).toBe("lasso");
  // A loop around a and b (not c), drawn freehand with a wobble.
  await loop(page, [{ x: 70, y: 70 }, { x: 260, y: 50 }, { x: 460, y: 70 }, { x: 450, y: 210 }, { x: 260, y: 240 }, { x: 60, y: 210 }], {
    whileDown: async () => expect(page.getByTestId("lasso-loop")).toBeVisible(),
  });
  expect(await selected(page)).toEqual([a, b].sort());
  await expect(page.getByTestId("lasso-loop")).toHaveCount(0);
  // Back to Select, so the pick can be moved right away.
  expect(await tool(page)).toBe("select");

  // Shift + lasso around c adds it.
  await page.keyboard.press("w");
  await loop(page, [{ x: 480, y: 80 }, { x: 650, y: 80 }, { x: 650, y: 200 }, { x: 480, y: 200 }], { shift: true });
  expect(await selected(page)).toEqual([a, b, c].sort());

  // A loop that cuts through b (only its left half inside) picks a only.
  await page.keyboard.press("w");
  await loop(page, [{ x: 70, y: 70 }, { x: 350, y: 70 }, { x: 350, y: 210 }, { x: 70, y: 210 }]);
  expect(await selected(page)).toEqual([a]);

  // Escape mid-loop puts the selection back as it was.
  await page.keyboard.press("w");
  const start = await screen(page, { x: 470, y: 60 });
  const end = await screen(page, { x: 700, y: 240 });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, start.y, { steps: 5 });
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.move(start.x, end.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await selected(page)).toEqual([a]);

  // The lasso picks a whole group when the whole group is inside.
  await page.keyboard.press("v");
  await ed(page, (e, ids: string[]) => {
    e.selectNone();
    e.groupShapes(ids);
  }, [b, c]);
  const group = await ed(page, (e, b: string) => e.getShape(b).parentId as string, b);
  await page.keyboard.press("w");
  await loop(page, [{ x: 270, y: 70 }, { x: 650, y: 70 }, { x: 650, y: 210 }, { x: 270, y: 210 }]);
  expect(await selected(page)).toEqual([group]);
});

test("lasso reaches inside a frame: a loop around one shape in a frame picks just that shape", async ({ page }) => {
  await open(page);
  await page.keyboard.press("f");
  await drag(page, { x: 100, y: 100 }, { x: 800, y: 600 });
  await page.keyboard.press("Escape");
  const frame = await ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "frame").id as string);
  const inner = await rect(page, 200, 200);
  await rect(page, 500, 200);
  expect(await ed(page, (e, id: string) => e.getShape(id).parentId as string, inner)).toBe(frame);
  await page.keyboard.press("w");
  await loop(page, [{ x: 170, y: 170 }, { x: 360, y: 170 }, { x: 360, y: 320 }, { x: 170, y: 320 }]);
  expect(await selected(page)).toEqual([inner]);
  // A loop around the whole frame picks the frame (which carries its shapes).
  await page.keyboard.press("w");
  await loop(page, [{ x: 60, y: 40 }, { x: 860, y: 40 }, { x: 860, y: 660 }, { x: 60, y: 660 }]);
  expect(await selected(page)).toEqual([frame]);
});

test("nothing sits past the sheet's edge, and undo puts a move back in one step", async ({ page }) => {
  await open(page);
  const a = await rect(page, 1700, 500, 150, 100);
  await page.keyboard.press("v");
  // Drag it far past the right edge (the pointer leaves the sheet).
  await drag(page, { x: 1775, y: 550 }, { x: 2050, y: 550 });
  await expect.poll(async () => (await boundsOf(page, a)).x + (await boundsOf(page, a)).w).toBeLessThanOrEqual(SHEET.w + 0.5);
  const b = await boundsOf(page, a);
  expect(b.x).toBeGreaterThan(1700); // it did move, up to the edge
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await boundsOf(page, a)).x).toBeCloseTo(1700, 0);
});

test("pages: next makes a new page on the last one, previous/next and PageUp/PageDown move between them, all saved", async ({ page }) => {
  await open(page);
  await expect(position(page)).toHaveText(/Page 1\s+1 \/ 1/);
  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
  await rect(page, 100, 100);

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(position(page)).toHaveText(/Page 2\s+2 \/ 2/);
  expect(await shapeIds(page)).toHaveLength(0); // a new, empty page
  // The new page fits the sheet too.
  expect(await ed(page, (e) => e.getViewportPageBounds().w >= 1920)).toBe(true);
  await rect(page, 400, 300);
  await rect(page, 600, 300);
  // Keys still reach the whiteboard after clicking the arrows.
  expect(await tool(page)).toBe("select");

  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(position(page)).toHaveText(/1 \/ 2/);
  expect(await shapeIds(page)).toHaveLength(1);
  await page.keyboard.press("PageDown");
  await expect(position(page)).toHaveText(/2 \/ 2/);
  expect(await shapeIds(page)).toHaveLength(2);
  await page.keyboard.press("PageDown"); // on the last page: a new one
  await expect(position(page)).toHaveText(/Page 3\s+3 \/ 3/);
  await page.keyboard.press("PageUp");
  await expect(position(page)).toHaveText(/2 \/ 3/);

  // Everything survives a reload (tldraw saves to IndexedDB).
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(position(page)).toHaveText(/\/ 3/);
  expect(await ed(page, (e) => e.getPages().map((p: any) => e.getPageShapeIds(p.id).size))).toEqual([1, 2, 0]);
});

test("present: the page as a slide, arrow keys go page to page, Escape stops", async ({ page }) => {
  await open(page);
  await rect(page, 100, 100);
  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByRole("button", { name: "Previous page" }).click();

  await page.getByRole("button", { name: "Present" }).click();
  const state = () => ed(page, (e) => ({ focus: e.getInstanceState().isFocusMode, readonly: e.getIsReadonly() }));
  await expect.poll(state).toEqual({ focus: true, readonly: true });
  await expect(page.locator(".tlui-toolbar")).toHaveCount(0); // no tools while presenting
  await page.keyboard.press("ArrowRight");
  await expect(position(page)).toHaveText(/2 \/ 2/);
  await page.keyboard.press("ArrowRight"); // last slide: no new page
  await expect(position(page)).toHaveText(/2 \/ 2/);
  await page.keyboard.press("ArrowLeft");
  await expect(position(page)).toHaveText(/1 \/ 2/);
  await page.keyboard.press("Escape");
  await expect.poll(state).toEqual({ focus: false, readonly: false });
  await expect(page.locator(".tlui-toolbar").first()).toBeVisible();
});

test("the page arrows sit bottom-right and leave tldraw's watermark uncovered", async ({ page }) => {
  await open(page);
  const arrows = (await page.getByRole("group", { name: "Pages" }).boundingBox())!;
  const view = page.viewportSize()!;
  expect(arrows.x + arrows.width).toBeGreaterThan(view.width - 40);
  expect(arrows.y + arrows.height).toBeGreaterThan(view.height - 120);
  const mark = page.locator(".tl-watermark_SEE-LICENSE");
  await expect(mark).toBeVisible();
  const m = (await mark.boundingBox())!;
  const overlap = arrows.x < m.x + m.width && m.x < arrows.x + arrows.width && arrows.y < m.y + m.height && m.y < arrows.y + arrows.height;
  expect(overlap).toBe(false);
});
