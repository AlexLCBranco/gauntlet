import { expect, test, type Page } from "./test";

/**
 * Page edges and packed layouts (owner, Edges round item 1). A page laid
 * out like the owner's 4 Nov page: four columns packed edge to edge, flush
 * against all four page edges, the top row under the toolbar, a Slate
 * widget on the left, pictures on the right, text lines at the bottom.
 * Every item is grabbed 3 px inside its border (the outer half of a border
 * flush with the window is off screen; inside, a neighbour touches it) on
 * every side and corner it has, selected and not, and must resize; box
 * select and lasso take the items flush against the edges; holding C
 * starts a box on an item. At 100%, 200%, 50% and in a window smaller than
 * the page. `window.editor` builds the page (set up) and reads results.
 */

type B = { x: number; y: number; w: number; h: number };
type Item = { id: string; type: string };

const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) =>
  page.evaluate(({ src, arg }) => { const e = (window as any).editor; const r = new Function("e", "a", `return (${src})(e, a)`)(e, arg); return r === e ? undefined : r; }, { src: fn.toString(), arg }) as Promise<T>;

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** The packed page on a W × H page (its own size at 100%): the Slate down
    the left quarter (text under it), a column of 3 pictures, a column of 2,
    a column of 4 pictures on the right, two text lines across the bottom,
    a short text line at the top beside the toolbar. No gaps; every outer
    item touches the page's edge. */
async function packedPage(page: Page, W: number, H: number): Promise<Item[]> {
  await page.getByTestId("tools.slate").click();
  await expect.poll(() => ed(page, (e) => e.getCurrentPageShapes().filter((s: any) => s.type === "calendarkit-slate" && s.props.scale > 0 && s.props.cols > 0).length)).toBe(1);
  return ed(page, (e, { W, H, PNG }) => {
    const c = W / 4;
    const textH = 44;
    const slate = e.getCurrentPageShapes().find((s: any) => s.type === "calendarkit-slate");
    const z = slate.props.scale;
    const natural = { w: slate.props.w / z, h: slate.props.h / z };
    const s = Math.min(c / natural.w, (H - textH) / natural.h);
    e.updateShape({ id: slate.id, type: slate.type, x: 0, y: 0, props: { scale: s, w: natural.w * s, h: natural.h * s } });
    const slateH = natural.h * s;
    e.createAssets([{ id: "asset:edgepic", type: "image", typeName: "asset", props: { name: "p.png", src: PNG, w: 100, h: 100, mimeType: "image/png", isAnimated: false }, meta: {} }]);
    const pics: any[] = [];
    const col = (x: number, w: number, y0: number, y1: number, n: number) => {
      const h = (y1 - y0) / n;
      for (let i = 0; i < n; i++) pics.push({ type: "image", x, y: y0 + i * h, props: { assetId: "asset:edgepic", w, h } });
    };
    // Text: fixed width, so it ends where its column does.
    const text = (x: number, y: number, w: number, t: string) => ({ type: "text", x, y, props: { autoSize: false, w, richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] } } });
    col(c, c, 0, H - textH, 3);
    col(2 * c, c, 0, H - textH, 2);
    col(3 * c, c, textH, H, 4);
    e.createShapes([...pics, text(0, slateH, c, "under the slate"), text(c, H - textH, 2 * c, "bottom line across two columns"), text(3 * c, 0, c, "top line beside the toolbar")]);
    // Text heights follow their font: line each text box up by moving it to
    // its row (its height is its own).
    for (const t of e.getCurrentPageShapes().filter((s: any) => s.type === "text")) {
      const b = e.getShapePageBounds(t.id);
      if (t.y >= H - textH - 1 && t.x > 0) e.updateShape({ id: t.id, type: "text", y: H - b.h });
    }
    e.selectNone();
    return e.getCurrentPageShapes().map((s: any) => ({ id: s.id, type: s.type }));
  }, { W, H, PNG });
}

const pageBox = (page: Page, id: string) => ed(page, (e, id: string) => { const b = e.getShapePageBounds(id); return { x: b.x, y: b.y, w: b.w, h: b.h }; }, id) as Promise<B>;
const screenBox = (page: Page, id: string) =>
  ed(page, (e, id: string) => {
    const b = e.getShapePageBounds(id);
    const a = e.pageToScreen({ x: b.x, y: b.y });
    const c = e.pageToScreen({ x: b.maxX, y: b.maxY });
    return { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y };
  }, id) as Promise<B>;

type Handle = "top_left" | "top" | "top_right" | "right" | "bottom_right" | "bottom" | "bottom_left" | "left";
const SIDES: Record<Handle, [number, number]> = { top_left: [0, 0], top: [0.5, 0], top_right: [1, 0], right: [1, 0.5], bottom_right: [1, 1], bottom: [0.5, 1], bottom_left: [0, 1], left: [0, 0.5] };

/** The handles an item has when selected (text: left and right, and its
    corners), as tldraw offers them. */
const handlesOf = (type: string): Handle[] => (type === "text" ? ["left", "right"] : (Object.keys(SIDES) as Handle[]));

/** The watermark's rect on screen, if shown. */
const watermark = (page: Page) => page.evaluate(() => { const r = document.querySelector(".tl-watermark_SEE-LICENSE")?.getBoundingClientRect(); return r && r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; });

/** A point 3 px inside the item's border at handle `h` (its middle for a
    side), stepped above the watermark if it falls on it (the hobby
    license keeps it on top; the handle steps away from it). Null when it
    isn't on screen. */
function grabPoint(b: B, h: Handle, vw: number, vh: number, wm: B | null) {
  const [fx, fy] = SIDES[h];
  const IN = 3;
  let x = fx === 0 ? b.x + IN : fx === 1 ? b.x + b.w - IN : b.x + b.w / 2;
  let y = fy === 0 ? b.y + IN : fy === 1 ? b.y + b.h - IN : b.y + b.h / 2;
  // A side's middle off screen: the visible middle of it.
  if (fx === 0.5) x = (Math.max(b.x, 0) + Math.min(b.x + b.w, vw)) / 2;
  if (fy === 0.5) y = (Math.max(b.y, 0) + Math.min(b.y + b.h, vh)) / 2;
  if (wm && x >= wm.x && x <= wm.x + wm.w && y >= wm.y && y <= wm.y + wm.h) y = wm.y - IN;
  if (x < 0 || y < 0 || x > vw - 1 || y > vh - 1) return null;
  return { x: Math.min(x, vw - 1), y: Math.min(y, vh - 1) };
}

/** Grabs `item` at handle `h` 3 px inside its border and drags 24 px
    towards its middle; the item must have been resized from that handle
    (the opposite side or corner stays, the grabbed one moves in), not
    moved. Then puts it back as it was (set up). */
async function resizeFrom(page: Page, item: Item, h: Handle, selected: boolean, vw: number, vh: number) {
  const before = await pageBox(page, item.id);
  const sb = await screenBox(page, item.id);
  const p = grabPoint(sb, h, vw, vh, await watermark(page));
  if (!p) return false;
  const snap = await ed(page, (e, id: string) => JSON.stringify(e.getShape(id)), item.id);
  if (selected) await ed(page, (e, id: string) => e.select(id), item.id);
  else await ed(page, (e) => e.selectNone());
  await page.mouse.move(p.x + 1, p.y + 1);
  await page.mouse.move(p.x, p.y, { steps: 2 });
  const [fx, fy] = SIDES[h];
  const dx = fx === 0 ? 24 : fx === 1 ? -24 : 0;
  const dy = fy === 0 ? 24 : fy === 1 ? -24 : 0;
  const under = await page.evaluate((p) => document.elementsFromPoint(p.x, p.y).slice(0, 3).map((el) => el.className.toString().slice(0, 40)).join(" < "), p);
  const hov = await ed(page, (e, p: { x: number; y: number }) => { const q = e.screenToPage(p); const o = e.overlays.getOverlayAtPoint(q); return JSON.stringify({ q: [Math.round(q.x), Math.round(q.y)], cur: e.inputs.getCurrentPagePoint().toJson?.() ?? null, o: o?.props ?? null, hov: e.overlays.getHoveredOverlayId() }); }, p);
  await page.mouse.down();
  const path = await ed(page, (e) => e.getPath());
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 6 });
  // tldraw handles pointer moves once a frame: let the last one land first.
  await page.waitForTimeout(50);
  await page.mouse.up();
  const after = await pageBox(page, item.id);
  const label = `${item.type} ${item.id.slice(-6)} ${h} (${selected ? "selected" : "not selected"}) at ${Math.round(p.x)},${Math.round(p.y)} over ${under} ${hov} ${path}`;
  const moved = (a: number, b: number) => Math.abs(a - b) > 3;
  // Resized: its size changed (a move keeps it).
  expect(moved(after.w, before.w) || moved(after.h, before.h), `${label}: resized, not moved (before ${JSON.stringify(before)}, after ${JSON.stringify(after)})`).toBe(true);
  // The opposite side stays where it was.
  if (fx === 0) expect(Math.abs(after.x + after.w - (before.x + before.w)), `${label}: right side stays`).toBeLessThan(1.5);
  if (fx === 1) expect(Math.abs(after.x - before.x), `${label}: left side stays`).toBeLessThan(1.5);
  if (fy === 0 && item.type !== "text") expect(Math.abs(after.y + after.h - (before.y + before.h)), `${label}: bottom stays`).toBeLessThan(1.5);
  if (fy === 1) expect(Math.abs(after.y - before.y), `${label}: top stays`).toBeLessThan(1.5);
  // Only that item changed: no neighbour was grabbed instead.
  await ed(page, (e, snap: string) => { const s = JSON.parse(snap); e.updateShape(s); e.selectNone(); }, snap);
  return true;
}

/** Every item, every handle, selected and not: the ones on screen. Items
    under a floating control (toolbar, page arrows, zoom) are tested
    selected only (owner, 1b: the controls give way to a selection). */
async function everyHandle(page: Page, items: Item[], vw: number, vh: number) {
  let done = 0;
  const controls = await page.evaluate(() =>
    [".gk-toolbar", ".gauntlet-pages", ".gauntlet-zoom-undo .gauntlet-island", ".tlui-menu-zone", ".gk-style-panel"].flatMap((s) => [...document.querySelectorAll(s)]).map((el) => { const r = el.getBoundingClientRect(); return { x: r.left - 2, y: r.top - 2, w: r.width + 4, h: r.height + 4 }; }),
  );
  const underControl = (p: { x: number; y: number }) => controls.some((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
  for (const item of items) {
    for (const h of handlesOf(item.type)) {
      const p = grabPoint(await screenBox(page, item.id), h, vw, vh, await watermark(page));
      if (!p) continue;
      if (await resizeFrom(page, item, h, true, vw, vh)) done++;
      if (!underControl(p) && (await resizeFrom(page, item, h, false, vw, vh))) done++;
    }
  }
  return done;
}

test.describe("packed page at the edges", () => {
  test.setTimeout(240_000);

  test("100%: every item resizes from every side and corner, 3 px inside its border, selected or not", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await open(page);
    const items = await packedPage(page, 1600, 1000);
    expect(items.length).toBe(13);
    expect(await everyHandle(page, items, 1600, 1000)).toBeGreaterThan(150);
  });

  test("200%: the items on screen resize from every visible side and corner", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await open(page);
    const items = await packedPage(page, 1600, 1000);
    await ed(page, (e) => e.setCamera({ x: 0, y: 0, z: 2 }));
    expect(await ed(page, (e) => e.getZoomLevel())).toBe(2);
    expect(await everyHandle(page, items, 1600, 1000)).toBeGreaterThan(20);
  });

  test("50% (a window half the page's size) and a window smaller than the page at 100%", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await open(page);
    const items = await packedPage(page, 1600, 1000);
    // Saved, then a window half as big: the whole page at 50%.
    await page.waitForTimeout(600);
    await page.setViewportSize({ width: 800, height: 500 });
    await expect.poll(() => ed(page, (e) => e.getViewportScreenBounds().w)).toBe(800);
    await ed(page, (e) => e.setCamera({ x: 0, y: 0, z: 0.5 }));
    await expect.poll(() => ed(page, (e) => e.getZoomLevel())).toBe(0.5);
    expect(await everyHandle(page, items, 800, 500)).toBeGreaterThan(60);
    // 100% in a 1100 × 700 window: the page's top-left part shows.
    await page.setViewportSize({ width: 1100, height: 700 });
    await ed(page, (e) => e.setCamera({ x: 0, y: 0, z: 1 }));
    await expect.poll(() => ed(page, (e) => e.getZoomLevel())).toBe(1);
    expect(await everyHandle(page, items, 1100, 700)).toBeGreaterThan(30);
  });

  test("box select and lasso take items flush against the page's edges; holding C starts a box on an item", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await open(page);
    const items = await packedPage(page, 1600, 1000);
    const sel = () => ed(page, (e) => (e.getSelectedShapeIds() as string[]).slice().sort());
    // The column of 3 pictures: the first touches the top edge; the Slate
    // the left and top. An empty spot made by removing the column's middle
    // picture.
    const pics = [];
    for (const it of items.filter((i) => i.type === "image")) pics.push({ ...it, b: await pageBox(page, it.id) });
    const col1 = pics.filter((p) => Math.abs(p.b.x - 400) < 1).sort((a, b) => a.b.y - b.b.y);
    await ed(page, (e, id: string) => e.deleteShape(id), col1[1]!.id);
    const slate = items.find((i) => i.type === "calendarkit-slate")!;
    // 20 px from the next column: nearer, that picture's edge would be grabbed.
    const hole = { x: 780, y: col1[1]!.b.y + col1[1]!.b.h / 2 };
    const under = items.find((i) => i.type === "text" && i.id !== slate.id)!;
    const underSlate = (await Promise.all(items.filter((i) => i.type === "text").map(async (i) => ({ i, b: await pageBox(page, i.id) })))).find((t) => t.b.x === 0)!.i;
    void under;
    const expected = [slate.id, underSlate.id].sort();
    const lassoed = [slate.id, underSlate.id, col1[0]!.id].sort();
    // From the hole to the window's top-left pixel: the Slate (flush left
    // and top), the text under it (flush left) and the top picture (flush
    // top) are wholly inside.
    await page.mouse.move(hole.x, hole.y);
    await page.mouse.down();
    await page.mouse.move(300, 200, { steps: 4 });
    await page.mouse.move(0, 0, { steps: 4 });
    await page.mouse.up();
    expect(await sel()).toEqual(expected);
    await ed(page, (e) => e.selectNone());

    // Lasso (W) from the hole round the same two, along the top and left edges.
    await page.keyboard.press("w");
    await page.mouse.move(hole.x, hole.y);
    await page.mouse.down();
    for (const [x, y] of [[805, hole.y], [805, 0], [400, 0], [0, 0], [0, hole.y], [hole.x, hole.y]] as const) await page.mouse.move(x, y, { steps: 6 });
    await page.mouse.up();
    expect(await sel()).toEqual(lassoed);
    await ed(page, (e) => e.selectNone());

    // Holding C, a press on the Slate starts a box (nothing moves): down
    // to the bottom edge, it takes only what is wholly inside, the third
    // picture of the column (flush with nothing but the box's past-edge).
    const third = col1[2]!;
    const slateBefore = await pageBox(page, slate.id);
    const start = { x: 390, y: Math.min(50, slateBefore.h - 10) };
    await page.mouse.move(start.x, start.y);
    await page.keyboard.down("c");
    await page.mouse.down();
    await page.mouse.move(start.x + 100, start.y + 100, { steps: 4 });
    await page.mouse.move(805, 999, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("c");
    expect(await pageBox(page, slate.id)).toEqual(slateBefore);
    expect(await sel()).toEqual([third.id]);
    // Without C the same press drags the Slate (tldraw's own).
    await ed(page, (e) => e.selectNone());
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y + 40, { steps: 4 });
    await page.mouse.up();
    expect((await pageBox(page, slate.id)).x).not.toBe(slateBefore.x);
  });

  test("the toolbar, page arrows and zoom dim while a selected item's handles lie under them, and let a press through to the handle; the Select tooltip shows the held C key", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await open(page);
    const items = await packedPage(page, 1600, 1000);
    const pics = [];
    for (const it of items.filter((i) => i.type === "image")) pics.push({ ...it, b: await pageBox(page, it.id) });
    // The top picture of the 2-picture column sits under the toolbar.
    const top = pics.filter((p) => Math.abs(p.b.x - 800) < 1).sort((a, b) => a.b.y - b.b.y)[0]!;
    const bar = page.getByTestId("toolbar");
    await expect(bar).not.toHaveAttribute("data-under-selection");
    await ed(page, (e, id: string) => e.select(id), top.id);
    await expect(bar).toHaveAttribute("data-under-selection");
    // Its top-left corner is under the toolbar? The middle of its top edge is.
    const tb = (await bar.boundingBox())!;
    const p = { x: 800 + 30, y: 10 }; // on the toolbar (it starts 6 px down), in the top edge's zone
    if (p.x < tb.x || p.x > tb.x + tb.width) p.x = tb.x + tb.width / 2;
    const before = await pageBox(page, top.id);
    await page.mouse.move(p.x, p.y + 20);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await expect(bar).toHaveAttribute("data-yield");
    await page.mouse.down();
    await page.mouse.move(p.x, p.y + 30, { steps: 5 });
    await page.mouse.up();
    const after = await pageBox(page, top.id);
    expect(after.y).toBeGreaterThan(before.y + 20);
    // Pointed at away from any handle, the toolbar works as always.
    await ed(page, (e) => e.selectNone());
    await expect(bar).not.toHaveAttribute("data-under-selection");
    await page.mouse.move(tb.x + 20, tb.y + 20);
    await expect(bar).not.toHaveAttribute("data-yield");
    expect(await page.getByTestId("tools.select").getAttribute("title")).toContain("Hold C");
  });
});
