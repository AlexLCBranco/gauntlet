import { expect, test, type Locator, type Page } from "@playwright/test";

import { whiteboardSaved } from "./helpers";

/**
 * The whiteboard (whiteboard phase 1: the floor), the home page `/`. Fresh,
 * empty browser profile per test, so every shape here is made by the test.
 * The page's `window.editor` (tldraw's editor) is read to check results and
 * to turn sheet coordinates into screen points; every action itself goes
 * through the mouse and keyboard, as a person would.
 */

/** The page in a 1920x1080 window: the page is the window's size (one
    unit per pixel), so the coordinates below are also screen pixels. Other
    window sizes: fullpage.e2e.ts. */
const SHEET = { w: 1920, h: 1080 };
test.use({ viewport: { width: 1920, height: 1080 } });

type Pt = { x: number; y: number };
type Bounds = { x: number; y: number; w: number; h: number };

async function open(page: Page) {
  await page.goto("/");
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
/** What "‹ 2 / 4 ›" shows, as seen (tldraw's page-menu button laid over
    "2 / 4" carries the page's name, hidden). */
const shown = (page: Page) => position(page).evaluate((el) => (el as HTMLElement).innerText.trim());

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

test("starts dark at 100%: the page fills the window exactly, and nothing outside it ever shows", async ({ page }) => {
  await open(page);
  expect(await ed(page, (e) => e.user.getIsDarkMode())).toBe(true);
  await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
  // The window shows exactly the whole page.
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
  // The Frame tool is gone (owner, 2026-10-20), but frames already on a page
  // stay: make one in code, where the tool used to draw it.
  const frame = await ed(page, (e) => {
    e.createShape({ type: "frame", x: 100, y: 100, props: { w: 700, h: 500 } });
    return e.getCurrentPageShapes().find((s: any) => s.type === "frame").id as string;
  });
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
  await expect.poll(() => shown(page)).toBe("1 / 1");
  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
  await rect(page, 100, 100);

  await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => shown(page)).toBe("2 / 2");
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
  await expect.poll(() => shown(page)).toBe("3 / 3");
  await page.keyboard.press("PageUp");
  await expect(position(page)).toHaveText(/2 \/ 3/);

  // Everything survives a reload (tldraw saves to IndexedDB).
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(position(page)).toHaveText(/\/ 3/);
  expect(await ed(page, (e) => e.getPages().map((p: any) => e.getPageShapeIds(p.id).size))).toEqual([1, 2, 0]);
});

test("a reload right after changing page opens on that page, not the one before", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(position(page)).toHaveText(/2 \/ 2/);
  await whiteboardSaved(page); // page 2 saved by tldraw too
  // tldraw saves the current page 350 ms after a change: reload well
  // before that, as a busy machine or a quick F5 does. Then the other way.
  for (const [arrow, where] of [["Previous page", /1 \/ 2/], ["Next page", /2 \/ 2/], ["Previous page", /1 \/ 2/]] as const) {
    await page.getByRole("button", { name: arrow }).click();
    await expect(position(page)).toHaveText(where);
    await page.reload();
    await page.waitForFunction(() => "editor" in window);
    await expect(position(page)).toHaveText(where);
    // Opens at 100%, top left, as a page always does.
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
    const view = await ed(page, (e) => ({ x: e.getViewportPageBounds().x, y: e.getViewportPageBounds().y }));
    expect(view.x).toBeCloseTo(0, 6);
    expect(view.y).toBeCloseTo(0, 6);
  }
});

test("a remembered page that is gone (deleted in another tab, or never there) opens the first page, with no error and nothing stored changed", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await open(page);
  await rect(page, 100, 100);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(position(page)).toHaveText(/2 \/ 2/);
  const gone = await ed(page, (e) => e.getCurrentPageId() as string);
  await whiteboardSaved(page);

  // Another tab deletes page 2 while this one is on it.
  const other = await context.newPage();
  await open(other);
  await expect.poll(() => ed(other, (e) => e.getPages().length)).toBe(2);
  await ed(other, (e, id: string) => void e.deletePage(id), gone);
  await expect.poll(() => ed(page, (e) => e.getPages().length)).toBe(1);
  await whiteboardSaved(other);
  await other.close();
  const stored = await ed(page, (e) => JSON.stringify(e.store.serialize("document")));

  for (const remembered of [gone, "page:never-there"]) {
    // This tab still remembers the gone page (as one closed before the
    // delete reached it would).
    await page.evaluate((id) => sessionStorage.setItem("gauntlet:whiteboard:page", id), remembered);
    await page.reload();
    await page.waitForFunction(() => "editor" in window);
    await expect(page.getByTestId("sheet")).toBeVisible();
    await expect.poll(() => shown(page)).toBe("1 / 1");
    expect(await shapeIds(page)).toHaveLength(1);
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
    // The first page is remembered now; the whiteboard still works.
    const first = await ed(page, (e) => e.getCurrentPageId() as string);
    expect(await page.evaluate(() => sessionStorage.getItem("gauntlet:whiteboard:page"))).toBe(first);
    await rect(page, 400, 300);
    expect(await shapeIds(page)).toHaveLength(2);
    await page.keyboard.press("Control+z");
    expect(await shapeIds(page)).toHaveLength(1);
    await whiteboardSaved(page);
    expect(await ed(page, (e) => JSON.stringify(e.store.serialize("document")))).toBe(stored);
  }
  expect(errors).toEqual([]);
});

test("no Present and no page menu at the top left; bottom right shows only ‹ N / M ›, never the page's name", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("button", { name: /present/i })).toHaveCount(0);
  await expect(page.locator(".tlui-layout [data-testid='page-menu.button']")).toHaveCount(0);
  await expect(page.getByTestId("main-menu.button")).toBeVisible();
  const group = page.getByRole("group", { name: "Pages" });
  const seen = () => group.evaluate((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim());
  await expect.poll(seen).toBe("‹ 1 / 1 ›");
  // Renamed pages: still only the position.
  await ed(page, (e) => e.renamePage(e.getCurrentPageId(), "My long page name"));
  await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(seen).toBe("‹ 2 / 2 ›");
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect.poll(seen).toBe("‹ 1 / 2 ›");
  expect(await ed(page, (e) => ({ focus: e.getInstanceState().isFocusMode, readonly: e.getIsReadonly() }))).toEqual({ focus: false, readonly: false });
});

/** The page controls' and the watermark's boxes (null: no watermark shown). */
async function controlsAndMark(page: Page) {
  const group = (await page.getByRole("group", { name: "Pages" }).boundingBox())!;
  const mark = await page.evaluate(() => {
    const el = document.querySelector(".tl-watermark_SEE-LICENSE");
    const r = el?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  });
  return { group, mark };
}

test("the page controls sit on the watermark's row, directly to its left, bottom-aligned, never over it; with no watermark, in the corner", async ({ page }) => {
  await open(page);
  const vp = page.viewportSize()!;
  // With a watermark (localhost without a key; the live hobby key).
  await expect(page.locator(".tl-watermark_SEE-LICENSE")).toBeVisible({ timeout: 10_000 });
  for (const size of [vp, { width: 1100, height: 700 }, { width: 700, height: 500 }]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () => {
        const { group, mark } = await controlsAndMark(page);
        if (!mark) return "no watermark";
        const overlap = group.x < mark.x + mark.width && mark.x < group.x + group.width && group.y < mark.y + mark.height && mark.y < group.y + group.height;
        if (overlap) return "overlaps";
        if (Math.abs(group.y + group.height - (mark.y + mark.height)) > 1) return `bottoms differ ${group.y + group.height} / ${mark.y + mark.height}`;
        const gap = mark.x - (group.x + group.width);
        if (gap < 0 || gap > 16) return `not directly left (gap ${gap})`;
        return "beside";
      })
      .toBe("beside");
  }
  await page.setViewportSize(vp);
  // With no watermark (the evaluation key on previews shows none): the corner.
  await page.addStyleTag({ content: ".tl-watermark_SEE-LICENSE { display: none !important; }" });
  await expect
    .poll(async () => {
      const { group } = await controlsAndMark(page);
      return [Math.round(vp.width - (group.x + group.width)), Math.round(vp.height - (group.y + group.height))];
    })
    .toEqual([12, 12]);
});

/** Opens the page list from "N / M". */
async function openPageList(page: Page) {
  if (await page.getByTestId("page-menu.list").isVisible()) return;
  await position(page).click();
  await expect(page.getByTestId("page-menu.list")).toBeVisible();
}
const listed = (page: Page) =>
  page.getByTestId("page-menu.item").evaluateAll((els) =>
    els
      .map((el) => ({ y: el.getBoundingClientRect().y, name: (el as HTMLElement).innerText.trim() }))
      .sort((a, b) => a.y - b.y)
      .map((x) => x.name),
  );
const pageNames = (page: Page) => ed(page, (e) => e.getPages().map((p: any) => p.name) as string[]);
const pageItem = (page: Page, name: string) => page.getByTestId("page-menu.item").filter({ hasText: new RegExp(`^${name}$`) });

test("clicking N / M opens the page list above the controls, and everything the old top-left menu did works: jump, rename, reorder, duplicate, delete, add", async ({ page }) => {
  await open(page);
  await ed(page, (e) => {
    e.renamePage(e.getCurrentPageId(), "A");
    for (const n of ["B", "C"]) e.createPage({ name: n });
  });
  await openPageList(page);
  // Opens above "‹ N / M ›", fully on screen.
  const list = (await page.locator(".tlui-popover__content").filter({ has: page.getByTestId("page-menu.list") }).boundingBox())!;
  const group = (await page.getByRole("group", { name: "Pages" }).boundingBox())!;
  expect(list.y + list.height).toBeLessThanOrEqual(group.y + 1);
  expect(list.y).toBeGreaterThanOrEqual(0);
  expect(list.x + list.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await listed(page)).toEqual(["A", "B", "C"]);

  // Jump.
  await pageItem(page, "C").locator(".tlui-page-menu__item__button").click();
  await expect.poll(() => shown(page)).toBe("3 / 3");

  // Rename: double-click, type, Enter.
  await openPageList(page);
  await pageItem(page, "B").locator(".tlui-page-menu__item__button").dblclick();
  // Typed only once the name field has the focus (on a busy machine it
  // comes a moment after the click: the first letter was lost once).
  await expect(page.locator("input:focus")).toHaveCount(1);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Bee");
  await page.keyboard.press("Enter");
  await expect.poll(() => pageNames(page)).toEqual(["A", "Bee", "C"]);

  // The item's own menu: Rename, Move up/down, Duplicate, Delete.
  const itemMenu = async (name: string, entry: string) => {
    await openPageList(page);
    const item = pageItem(page, name);
    await item.hover();
    await item.getByTestId("page-menu.item-submenu").click();
    await page.getByRole("menuitem", { name: entry, exact: true }).click();
  };
  await itemMenu("A", "Rename");
  await expect(page.locator("input:focus")).toHaveCount(1);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Ay");
  await page.keyboard.press("Enter");
  await expect.poll(() => pageNames(page)).toEqual(["Ay", "Bee", "C"]);
  await itemMenu("Ay", "Move down");
  await expect.poll(() => pageNames(page)).toEqual(["Bee", "Ay", "C"]);
  await itemMenu("C", "Move up");
  await expect.poll(() => pageNames(page)).toEqual(["Bee", "C", "Ay"]);

  // Reorder by dragging a row: "Ay" to the top.
  await openPageList(page);
  const from = (await pageItem(page, "Ay").boundingBox())!;
  const to = (await pageItem(page, "Bee").boundingBox())!;
  await page.mouse.move(from.x + 40, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, to.y + 4, { steps: 12 });
  await page.mouse.move(from.x + 40, to.y + 2, { steps: 2 });
  await page.mouse.up();
  await expect.poll(() => pageNames(page)).toEqual(["Ay", "Bee", "C"]);

  await itemMenu("C", "Duplicate");
  await expect.poll(async () => (await pageNames(page)).length).toBe(4);
  await itemMenu("Bee", "Delete");
  await expect.poll(() => pageNames(page)).not.toContain("Bee");
  expect(await pageNames(page)).toHaveLength(3);

  // Add.
  await openPageList(page);
  await page.getByTestId("page-menu.create").click();
  await expect.poll(async () => (await pageNames(page)).length).toBe(4);
  await page.keyboard.press("Enter");
  await expect.poll(() => shown(page)).toBe("4 / 4");

  // Escape closes the list; the whiteboard has the keys again.
  await openPageList(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("page-menu.list")).toBeHidden();
  await page.keyboard.press("2");
  expect(await tool(page)).toBe("geo");
});

test("keys: ← and → go to the previous/next page when nothing is selected and nothing is edited; → on the last page does nothing; with a selection the arrows nudge it", async ({ page }) => {
  await open(page);
  // The on-screen › on the last page still makes a page.
  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => shown(page)).toBe("3 / 3");
  await page.keyboard.press("ArrowRight"); // last page: nothing, never a new page
  await page.waitForTimeout(200);
  expect(await ed(page, (e) => e.getPages().length)).toBe(3);
  await expect.poll(() => shown(page)).toBe("3 / 3");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => shown(page)).toBe("2 / 3");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => shown(page)).toBe("1 / 3");
  await page.keyboard.press("ArrowLeft"); // first page: nothing
  await expect.poll(() => shown(page)).toBe("1 / 3");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => shown(page)).toBe("2 / 3");

  // Something selected: the arrows nudge it, the page stays.
  const id = await rect(page, 300, 300);
  await ed(page, (e, id: string) => void e.select(id), id);
  const before = await boundsOf(page, id);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await boundsOf(page, id)).x).toBeLessThan(before.x);
  await expect.poll(() => shown(page)).toBe("2 / 3");

  // Text being edited: the arrows move the caret, not the page.
  await page.keyboard.press("Escape");
  await page.keyboard.press("8");
  const p = await screen(page, { x: 800, y: 500 });
  await page.mouse.click(p.x, p.y);
  await page.keyboard.type("abc");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => shown(page)).toBe("2 / 3");
  await page.keyboard.press("Escape");
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
  // One click each, as with Ctrl+Z (selection changes aren't steps).
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => shapeIds(page)).not.toContain(a);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => shapeIds(page)).toContain(a);
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

// ---------------------------------------------------------------------------
// Phase 2.5 (docs/PHASE-2.5.md)

test("zoom buttons and Ctrl+/Ctrl- go in steps of 10% up to 800%; at 100% on a window-sized page, - does nothing", async ({ page }) => {
  await open(page);
  const pct = page.getByTestId("zoom-percent");
  await expect(pct).toHaveText("100%");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(pct).toHaveText("100%");
  await page.keyboard.press("Control+Minus");
  await expect(pct).toHaveText("100%");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(pct).toHaveText("110%");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(pct).toHaveText("120%");
  await page.keyboard.press("Control+Equal");
  await expect(pct).toHaveText("130%");
  await page.keyboard.press("Control+Minus");
  await expect(pct).toHaveText("120%");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(pct).toHaveText("100%");
  for (let i = 0; i < 75; i++) await page.keyboard.press("Control+Equal");
  await expect(pct).toHaveText("800%");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(pct).toHaveText("790%");
});

test("no Laser, Note or Frame: not on the toolbar, not in its overflow menu, and K/N/F do nothing; Highlighter stays", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 }); // narrow, so the overflow menu is there
  await open(page);
  for (const id of ["laser", "note", "frame"]) {
    await expect(page.getByTestId(`tools.${id}`)).toHaveCount(0);
  }
  await page.getByTestId("tools.more-button").click();
  for (const id of ["laser", "note", "frame"]) await expect(page.getByTestId(`tools.more.${id}`)).toHaveCount(0);
  await expect(page.locator("[data-testid=\"tools.more.highlight\"]:visible, [data-testid=\"tools.highlight\"]:visible")).not.toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  for (const key of ["k", "n", "f"]) {
    await page.keyboard.press(key);
    expect(await tool(page)).toBe("select");
  }
  // A wide window has every tool on the row: no more removed ones there.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator("[data-testid=\"tools.highlight\"]:visible")).toHaveCount(1);
  for (const id of ["laser", "note", "frame"]) await expect(page.getByTestId(`tools.${id}`)).toHaveCount(0);
});

test("main menu Backups opens /backup/ in a new tab; the whiteboard stays", async ({ page, context }) => {
  await open(page);
  const url = page.url();
  await page.getByTestId("main-menu.button").click();
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("menuitem", { name: "Backups" }).click()]);
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname).toBe("/backup/");
  expect(page.url()).toBe(url);
  await expect(page.getByTestId("sheet")).toBeVisible();
});

test("a window with no size (0 x 0, as in an embedded pane mid-layout) doesn't crash the whiteboard; it works once it has a size", async ({ page }) => {
  // Records errors in every frame, from the first script on.
  await page.addInitScript(() => {
    const errs: string[] = ((window as any).__errs = []);
    addEventListener("error", (e) => errs.push(e.message));
    addEventListener("unhandledrejection", (e) => errs.push(String(e.reason)));
    const ce = console.error;
    console.error = (...a: unknown[]) => (errs.push(a.map(String).join(" ")), ce(...a));
  });
  await page.goto("/backup/");
  await page.evaluate(() => {
    const f = document.createElement("iframe");
    f.id = "wb";
    f.style.cssText = "width:0;height:0;border:0";
    f.src = "/";
    document.body.append(f);
  });
  await expect.poll(() => page.frames().length).toBe(2);
  const fr = page.frames().find((f) => f !== page.mainFrame())!;
  await fr.waitForFunction(() => "editor" in window, null, { timeout: 30_000 });
  expect(await fr.evaluate(() => [innerWidth, innerHeight])).toEqual([0, 0]);
  // Everything that sizes the page, while there is no size.
  await fr.evaluate(() => {
    const e = (window as any).editor;
    e.zoomIn();
    e.zoomOut();
    for (const label of ["Next page", "Previous page", "Zoom in", "Zoom out"]) document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
    document.querySelector<HTMLButtonElement>('[data-testid="zoom-percent"]')?.click();
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => (document.getElementById("wb")!.style.cssText = "width:800px;height:600px;border:0"));
  await expect.poll(() => fr.evaluate(() => (window as any).editor.getViewportScreenBounds().w)).toBe(800);
  const cam = await fr.evaluate(() => (window as any).editor.getCamera());
  for (const k of ["x", "y", "z"]) expect(Number.isFinite(cam[k])).toBe(true);
  await expect(fr.getByTestId("sheet")).toBeVisible();
  expect(await fr.evaluate(() => (window as any).__errs)).toEqual([]);
});
