import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The whiteboard (whiteboard phase 1: the floor) at /whiteboard/. Fresh,
 * empty browser profile per test, so every shape here is made by the test.
 * The page's `window.editor` (tldraw's editor) is read to check results and
 * to turn sheet coordinates into screen points; every action itself goes
 * through the mouse and keyboard, as a person would.
 */

const SHEET = { w: 1920, h: 1080 };

// 16:9, like the sheet: at 100% the whole sheet is on screen, so the tests
// can reach every part of it. Other window shapes are tested on their own.
test.use({ viewport: { width: 1600, height: 900 } });

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

/** What the camera shows, in sheet units, and the zoom. */
const view = (page: Page) =>
  ed(page, (e) => {
    const b = e.getViewportPageBounds();
    return { x: b.x, y: b.y, w: b.w, h: b.h, z: e.getZoomLevel() } as Bounds & { z: number };
  });

/** Nothing outside the sheet is on screen (half a sheet unit of rounding). */
function expectInsideSheet(v: Bounds) {
  expect(v.x).toBeGreaterThanOrEqual(-0.5);
  expect(v.y).toBeGreaterThanOrEqual(-0.5);
  expect(v.x + v.w).toBeLessThanOrEqual(SHEET.w + 0.5);
  expect(v.y + v.h).toBeLessThanOrEqual(SHEET.h + 0.5);
}

/** Wheel-pans far past every edge, checking the view after each. */
async function panEverywhere(page: Page) {
  for (const [dx, dy] of [[-5000, 0], [5000, 0], [0, -5000], [0, 5000]]) {
    for (let i = 0; i < 5; i++) await page.mouse.wheel(dx / 5, dy / 5);
    expectInsideSheet(await view(page));
  }
}

test("starts dark at 100%: the page fills a 16:9 window exactly, and nothing outside it ever shows", async ({ page }) => {
  await open(page);
  expect(await ed(page, (e) => e.user.getIsDarkMode())).toBe(true);
  await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
  // A 16:9 window shows exactly the whole sheet.
  const fit = await view(page);
  expect(fit.x).toBeCloseTo(0, 0);
  expect(fit.y).toBeCloseTo(0, 0);
  expect(fit.w).toBeCloseTo(SHEET.w, 0);
  expect(fit.h).toBeCloseTo(SHEET.h, 0);

  const middle = await screen(page, { x: SHEET.w / 2, y: SHEET.h / 2 });
  await page.mouse.move(middle.x, middle.y);
  // At 100% there's nowhere to pan to.
  await panEverywhere(page);
  expect(await view(page)).toEqual(fit);
  // Zooming out stops at 100%.
  await page.keyboard.down("Control");
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 400);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await view(page)).z).toBeCloseTo(fit.z, 3);
  await expect(page.getByTestId("zoom-percent")).toHaveText("100%");

  // Zoomed in, panning goes only up to the sheet's edges.
  await page.keyboard.down("Control");
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await view(page)).z).toBeGreaterThan(fit.z * 1.5);
  await expect(page.getByTestId("zoom-percent")).not.toHaveText("100%");
  await panEverywhere(page);
  // The percentage resets to 100% (the page filling the window).
  await page.getByTestId("zoom-percent").click();
  await expect.poll(() => view(page)).toEqual(fit);
});

/** Zoomed in, the view stays on the sheet: along an axis where the sheet is
    wider than the window it never shows past the edge; along one where the
    sheet is narrower it stays centred (dark bars on both sides). */
function expectBounded(v: Bounds) {
  if (v.w <= SHEET.w + 0.5) { expect(v.x).toBeGreaterThanOrEqual(-0.5); expect(v.x + v.w).toBeLessThanOrEqual(SHEET.w + 0.5); }
  else expect(v.x + v.w / 2).toBeCloseTo(SHEET.w / 2, 0);
  if (v.h <= SHEET.h + 0.5) { expect(v.y).toBeGreaterThanOrEqual(-0.5); expect(v.y + v.h).toBeLessThanOrEqual(SHEET.h + 0.5); }
  else expect(v.y + v.h / 2).toBeCloseTo(SHEET.h / 2, 0);
}

test("in a window that isn't 16:9 the whole page shows, centred, with dark bars, nothing scrolls at 100%, and it stays so when the window changes", async ({ page }) => {
  for (const size of [{ width: 1400, height: 900 }, { width: 900, height: 900 }, { width: 1800, height: 700 }]) {
    await page.setViewportSize(size);
    await open(page);
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
    const v = await view(page);
    // The whole sheet is in view, touching the window on one axis.
    expect(v.x).toBeLessThanOrEqual(0.5);
    expect(v.y).toBeLessThanOrEqual(0.5);
    expect(v.x + v.w).toBeGreaterThanOrEqual(SHEET.w - 0.5);
    expect(v.y + v.h).toBeGreaterThanOrEqual(SHEET.h - 0.5);
    expect(Math.abs(v.w - SHEET.w) < 0.5 || Math.abs(v.h - SHEET.h) < 0.5).toBe(true);
    // Centred: the bars on either side are the same size.
    const box = (await page.getByTestId("sheet").boundingBox())!;
    expect(box.x).toBeCloseTo(size.width - (box.x + box.width), 0);
    expect(box.y).toBeCloseTo(size.height - (box.y + box.height), 0);
    // The bars are dark (dark theme by default).
    const bar = await page.evaluate(([x, y]) => {
      const el = document.elementsFromPoint(x, y).find((n) => n.classList.contains("gauntlet-outside"));
      return el ? getComputedStyle(el).backgroundColor : null;
    }, box.x > 2 ? [box.x / 2, size.height / 2] : [size.width / 2, box.y / 2 + 60]);
    expect(bar).toBe("rgb(38, 38, 44)");
    // At 100% nothing scrolls, whichever way.
    const middle = await screen(page, { x: SHEET.w / 2, y: SHEET.h / 2 });
    await page.mouse.move(middle.x, middle.y);
    for (const [dx, dy] of [[-5000, 0], [5000, 0], [0, -5000], [0, 5000]]) {
      for (let i = 0; i < 5; i++) await page.mouse.wheel(dx / 5, dy / 5);
      expect(await view(page)).toEqual(v);
    }
    // Zoomed in, panning stays on the sheet.
    await page.keyboard.down("Control");
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
    await page.keyboard.up("Control");
    await expect(page.getByTestId("zoom-percent")).not.toHaveText("100%");
    for (const [dx, dy] of [[-5000, 0], [5000, 0], [0, -5000], [0, 5000]]) {
      for (let i = 0; i < 5; i++) await page.mouse.wheel(dx / 5, dy / 5);
      expectBounded(await view(page));
    }
  }
  // Resizing the window at 100% keeps the whole page in view.
  await page.getByTestId("zoom-percent").click();
  await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
  await expect.poll(async () => Math.round((await view(page)).w)).toBe(SHEET.w);
  expectInsideSheet(await view(page));
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
  // (Escape first: the style panel and the menu sit over the sheet's top
  // left corner while something is selected.)
  await page.keyboard.press("Escape");
  await page.keyboard.press("w");
  await loop(page, [{ x: 60, y: 70 }, { x: 860, y: 70 }, { x: 860, y: 660 }, { x: 60, y: 660 }]);
  expect(await selected(page)).toEqual([frame]);
});

test("nothing sits past the sheet's edge, and undo puts a move back in one step", async ({ page }) => {
  await open(page);
  const a = await rect(page, 1700, 500, 150, 100);
  await page.keyboard.press("v");
  // Selected, so it can be grabbed from inside (it has no fill).
  await ed(page, (e, id: string) => void e.select(id), a);
  // Drag it up to the right edge, so most of it pokes past.
  await drag(page, { x: 1775, y: 550 }, { x: 1915, y: 550 });
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
  // The hobby key and localhost show tldraw's watermark; the temporary
  // evaluation key (until 2026-11-01) doesn't, so there's nothing to cover.
  const mark = page.locator(".tl-watermark_SEE-LICENSE");
  await page.waitForTimeout(1000);
  if ((await mark.count()) === 0) return;
  await expect(mark).toBeVisible();
  const m = (await mark.boundingBox())!;
  const overlap = arrows.x < m.x + m.width && m.x < arrows.x + arrows.width && arrows.y < m.y + m.height && m.y < arrows.y + arrows.height;
  expect(overlap).toBe(false);
});

test("the tldraw license is accepted: the editor stays up past 5 s with no license warning", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (m) => { if (/licen[cs]e/i.test(m.text())) warnings.push(m.text()); });
  await open(page);
  await page.waitForTimeout(6500);
  await expect(page.getByTestId("sheet")).toBeVisible();
  await expect(page.locator(".tl-canvas")).toBeVisible();
  // Localhost needs no key; anywhere else tldraw warns when it's missing or bad.
  if (!/localhost|127\.0\.0\.1/.test(page.url())) expect(warnings).toEqual([]);
});

// ---------------------------------------------------------------------------
// The owner's phase 1 fixes (HANDOFF.md, 2026-10-18)

const panel = (page: Page) => page.getByTestId("style-panel");
const shapeOf = (page: Page, id: string) => ed(page, (e, id: string) => e.getShape(id), id);

test("fix 1: text can be made smaller than tldraw's smallest size (XXS, XS), and its box shrinks to fit", async ({ page }) => {
  await open(page);
  await page.keyboard.press("8");
  const at = await screen(page, { x: 600, y: 400 });
  await page.mouse.click(at.x, at.y);
  await page.keyboard.type("Small notes");
  await page.keyboard.press("Escape");
  const id = await ed(page, (e) => e.getCurrentPageShapesSorted().at(-1).id as string);
  await ed(page, (e, id: string) => void e.select(id), id);
  const fontPx = () =>
    ed(page, (_e, id: string) => {
      const el = document.querySelector(`[data-shape-id="${id}"] .tl-rich-text`) as HTMLElement;
      return parseFloat(getComputedStyle(el).fontSize);
    }, id);
  await page.getByTestId("font-s").click();
  await expect.poll(fontPx).toBe(18);
  const sWidth = (await boundsOf(page, id)).w;
  for (const [step, px] of [["xs", 14], ["xxs", 10]] as const) {
    await page.getByTestId(`font-${step}`).click();
    await expect.poll(fontPx).toBe(px);
    expect((await boundsOf(page, id)).w).toBeLessThan(sWidth);
  }
  // Saved with the shape, and one undo step each.
  expect((await shapeOf(page, id)).meta.fontStep).toBe("xxs");
  await page.keyboard.press("Control+z");
  await expect.poll(fontPx).toBe(14);
});

test("fix 2: the style panel shows only while something is selected and goes away on a click elsewhere or Escape", async ({ page }) => {
  await open(page);
  await expect(panel(page)).toHaveCount(0);
  const a = await rect(page, 300, 300);
  await ed(page, (e, id: string) => void e.select(id), a);
  await expect(panel(page)).toBeVisible();
  // A click on empty sheet deselects, and the panel goes.
  const empty = await screen(page, { x: 1200, y: 800 });
  await page.mouse.click(empty.x, empty.y);
  expect(await selected(page)).toEqual([]);
  await expect(panel(page)).toHaveCount(0);
  // Selecting by clicking brings it back; Escape deselects and closes it.
  const on = await screen(page, { x: 360, y: 340 });
  await page.mouse.click(on.x, on.y);
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  // A drawing tool on its own (nothing selected) doesn't open it either.
  await page.keyboard.press("2");
  await expect(panel(page)).toHaveCount(0);
});

test("fix 4: Clear page (main menu) asks first, Cancel keeps everything, Clear wipes only this page, Ctrl+Z brings it back", async ({ page }) => {
  await open(page);
  await rect(page, 200, 200);
  await rect(page, 500, 200);
  // Another page with a shape, which must survive.
  await page.getByRole("button", { name: "Next page" }).click();
  await rect(page, 300, 300);
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect.poll(async () => (await shapeIds(page)).length).toBe(2);

  const openDialog = async () => {
    await page.getByTestId("main-menu.button").click();
    await page.getByTestId("main-menu.clear-page").click();
    await expect(page.getByRole("dialog")).toContainText("Clear page");
  };
  await openDialog();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await shapeIds(page)).toHaveLength(2);

  await openDialog();
  await page.getByTestId("clear-page-confirm").click();
  await expect.poll(async () => (await shapeIds(page)).length).toBe(0);
  expect(await ed(page, (e) => e.getPageShapeIds(e.getPages()[1].id).size as number)).toBe(1);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await shapeIds(page)).length).toBe(2);
});

test("fix 5: Excalidraw's layout: menu top-left, tools top-centre, zoom and undo/redo bottom-left, page arrows bottom-right", async ({ page }) => {
  await open(page);
  const vp = page.viewportSize()!;
  const box = async (l: Locator) => (await l.boundingBox())!;
  const menu = await box(page.getByTestId("main-menu.button"));
  expect(menu.x).toBeLessThan(60);
  expect(menu.y).toBeLessThan(60);
  const tools = await box(page.locator(".gauntlet-top-toolbar .tlui-main-toolbar__tools"));
  expect(Math.abs(tools.x + tools.width / 2 - vp.width / 2)).toBeLessThan(4);
  expect(tools.y).toBeLessThan(60);
  for (const l of [page.getByTestId("zoom-percent"), page.getByRole("button", { name: "Undo" }), page.getByRole("button", { name: "Redo" })]) {
    const b = await box(l);
    expect(b.x + b.width).toBeLessThan(vp.width / 3);
    expect(b.y).toBeGreaterThan(vp.height - 80);
  }
  const arrows = await box(page.getByRole("group", { name: "Pages" }));
  expect(arrows.x).toBeGreaterThan(vp.width * 0.66);
  expect(arrows.y).toBeGreaterThan(vp.height - 120);
  // tldraw's own undo/redo row (top left) and style panel (top right) are gone.
  await expect(page.locator(".tlui-style-panel")).toHaveCount(0);
  await expect(page.getByTestId("quick-actions.undo")).toHaveCount(0);

  // The tools stay centred when the style panel opens on the left.
  const b = await rect(page, 900, 500);
  await ed(page, (e, id: string) => void e.select(id), b);
  await expect(panel(page)).toBeVisible();
  expect((await box(page.locator(".gauntlet-top-toolbar .tlui-main-toolbar__tools"))).x).toBeCloseTo(tools.x, 0);

  // The undo/redo buttons work.
  const a = await rect(page, 300, 300);
  // (tldraw keeps selection changes as steps too, so drawing a shape and
  // pressing Escape takes two steps back, as with Ctrl+Z.)
  for (let i = 0; i < 3 && (await shapeIds(page)).includes(a); i++) await page.getByRole("button", { name: "Undo" }).click();
  expect(await shapeIds(page)).not.toContain(a);
  for (let i = 0; i < 3 && !(await shapeIds(page)).includes(a); i++) await page.getByRole("button", { name: "Redo" }).click();
  expect(await shapeIds(page)).toContain(a);
});

test("fix 6: the style panel is Excalidraw's: on the left under the menu, labelled sections, layer and delete actions", async ({ page }) => {
  await open(page);
  const a = await rect(page, 600, 300);
  await ed(page, (e, id: string) => void e.select(id), a);
  const p = (await panel(page).boundingBox())!;
  const menu = (await page.getByTestId("main-menu.button").boundingBox())!;
  expect(p.x).toBeLessThan(40);
  expect(p.y).toBeGreaterThanOrEqual(menu.y + menu.height);
  for (const title of ["Stroke", "Background", "Stroke width", "Stroke style", "Font size", "Opacity", "Layers", "Actions"]) {
    await expect(panel(page).locator("legend").filter({ hasText: new RegExp(`^${title}$`) })).toHaveCount(1);
  }
  // A stroke colour changes the shape and shows as picked.
  await page.getByTestId("stroke-blue").click();
  expect((await shapeOf(page, a)).props.color).toBe("blue");
  await expect(page.getByTestId("stroke-blue")).toHaveAttribute("aria-pressed", "true");
  // Each change is one undo step.
  await page.getByTestId("stroke-width-xl").click();
  expect((await shapeOf(page, a)).props.size).toBe("xl");
  await page.keyboard.press("Control+z");
  expect((await shapeOf(page, a)).props.size).not.toBe("xl");
  await panel(page).getByRole("button", { name: "Delete" }).click();
  expect(await shapeIds(page)).not.toContain(a);
});

test("fix 8: dragging shows a rectangle outline around what's moving, gone when dropped", async ({ page }) => {
  await open(page);
  const a = await rect(page, 400, 300, 200, 120);
  await page.keyboard.press("v");
  await ed(page, (e, id: string) => void e.select(id), a);
  const from = await screen(page, { x: 500, y: 360 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 40, { steps: 4 });
  await page.mouse.move(from.x + 120, from.y + 80, { steps: 4 });
  const outline = page.getByTestId("drag-outline");
  await expect(outline).toBeVisible();
  // It surrounds the shape where it is now, close around it.
  const o = (await outline.boundingBox())!;
  const b = await boundsOf(page, a);
  const tl = await screen(page, { x: b.x, y: b.y });
  const br = await screen(page, { x: b.x + b.w, y: b.y + b.h });
  expect(o.x).toBeLessThanOrEqual(tl.x);
  expect(o.y).toBeLessThanOrEqual(tl.y);
  expect(o.x + o.width).toBeGreaterThanOrEqual(br.x);
  expect(o.y + o.height).toBeGreaterThanOrEqual(br.y);
  expect(o.x).toBeGreaterThan(tl.x - 12);
  await page.mouse.up();
  await expect(outline).toHaveCount(0);
});

test("fix 9: a shape with text gets its own background colour and text colour, apart from its outline", async ({ page }) => {
  await open(page);
  const a = await rect(page, 400, 300, 260, 140);
  // Type a label into it (Enter edits the selected shape).
  await ed(page, (e, id: string) => void e.select(id), a);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Game 7");
  await page.keyboard.press("Escape");
  await ed(page, (e, id: string) => void e.select(id), a);
  await page.getByTestId("stroke-blue").click();
  await page.getByTestId("background-yellow").click();
  await page.getByTestId("text-red").click();
  const s = await shapeOf(page, a);
  expect(s.props.color).toBe("blue");
  expect(s.props.labelColor).toBe("red");
  expect(s.meta.fillColor).toBe("yellow");
  expect(s.props.fill).not.toBe("none");
  // Drawn that way: the fill yellow, the outline blue, the label red.
  const drawn = await ed(page, (e, id: string) => {
    const colors = e.getCurrentTheme().colors[e.getColorMode()];
    const el = document.querySelector(`[data-shape-id="${id}"]`)!;
    const paths = [...el.querySelectorAll("path")];
    return {
      fills: paths.map((p) => p.getAttribute("fill")),
      strokes: paths.map((p) => p.getAttribute("stroke")),
      label: getComputedStyle(el.querySelector(".tl-rich-text") as HTMLElement).color,
      yellow: colors.yellow.fill,
      blue: colors.blue.solid,
      red: colors.red.solid,
    };
  }, a);
  expect(drawn.fills).toContain(drawn.yellow);
  expect(drawn.strokes).toContain(drawn.blue);
  const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  expect(drawn.label).toBe(rgb(drawn.red));
  // Transparent takes the background away again.
  await page.getByTestId("background-transparent").click();
  expect((await shapeOf(page, a)).props.fill).toBe("none");
});

test("one Ctrl+Z undoes a shape just drawn, even after Escape, as in Excalidraw; Ctrl+Y brings it back", async ({ page }) => {
  await open(page);
  const keep = await rect(page, 100, 100); // rect() ends with Escape
  const id = await rect(page, 400, 300);
  // A shape drawn and left selected (no Escape) also goes in one press.
  await page.keyboard.press("4");
  await drag(page, { x: 800, y: 300 }, { x: 950, y: 420 });
  const ellipse = (await shapeIds(page)).find((s) => s !== keep && s !== id)!;
  await page.keyboard.press("Control+z");
  await expect.poll(() => shapeIds(page)).toEqual([keep, id]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(() => shapeIds(page)).toEqual([keep]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => shapeIds(page)).toEqual([]);
  await page.keyboard.press("Control+y");
  await expect.poll(() => shapeIds(page)).toEqual([keep]);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => shapeIds(page)).toEqual([keep, id]);
  expect(ellipse).toBeTruthy();
  // Deselecting with a click on empty space isn't an undo step either.
  await page.keyboard.press("2");
  await drag(page, { x: 1200, y: 600 }, { x: 1350, y: 700 });
  const empty = await screen(page, { x: 1700, y: 950 });
  await page.mouse.click(empty.x, empty.y);
  await expect.poll(() => selected(page)).toEqual([]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => shapeIds(page)).toEqual([keep, id]);
});
