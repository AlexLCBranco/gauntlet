import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { box, seedBoard, seedMap } from "./helpers";

/**
 * Map fixes from the owner's hand test (2026-10-22):
 * 1. While a map is edited, the rest of the page is dimmed as one layer: a
 *    filled box still hides what is under it (only its brightness changes).
 * 2. The editing label says what adds a box under the map's rules, and a
 *    double-click with tree rules on says why not, inside the map or out.
 * 3. A box's dot dragged far past the map's edge: the dashed line follows,
 *    and letting go on bare page adds a child.
 * 4. A board's Map and Both views show the whole map, unclipped.
 * Fresh browser profile per test; boards and maps are made here.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

type Rect = { x: number; y: number; width: number; height: number };
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const inside = (r: Rect, w: Rect, slack = 1) => r.x >= w.x - slack && r.y >= w.y - slack && r.x + r.width <= w.x + w.width + slack && r.y + r.height <= w.y + w.height + slack;

/** The first ancestor that cuts this element off (its overflow or a
    clip-path, with the element reaching past it), or null: drawn whole. */
const clippedBy = (l: import("@playwright/test").Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflow === "visible" && cs.clipPath === "none") continue;
      const b = a.getBoundingClientRect();
      const margin = cs.overflow === "clip" ? parseFloat(cs.overflowClipMargin) || 0 : 0;
      if (r.x < b.x - margin - 1 || r.y < b.y - margin - 1 || r.right > b.right + margin + 1 || r.bottom > b.bottom + margin + 1) return `${a.tagName}.${a.className}`;
    }
    return null;
  });

const PAPER_REFUSAL = "With tree rules on, every box needs a parent: use a box’s + button, or drag its dot onto the paper.";

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}
const editingId = (page: Page) => page.evaluate(() => (window as any).editor.getEditingShapeId() as string | null);
const boxOf = (page: Page, name: string) => page.locator("[data-linkkit-map] [data-box-id]").filter({ hasText: new RegExp(`^${name}$`) });
const field = (page: Page) => page.getByRole("textbox", { name: "Box name" });

/** Map `mapId` placed from the Map picker, moved so its top-left is at
    page point `at` (camera at 100%, page corner at the window's): its id. */
async function placeMap(page: Page, mapId: string, at: { x: number; y: number }): Promise<string> {
  await page.getByTestId("tools.map").click();
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  await expect(page.locator('[data-linkkit-map][data-editing="false"] [data-map-view][data-ready]').first()).toBeVisible();
  await page.keyboard.press("Escape");
  return page.evaluate((at) => {
    const e = (window as any).editor;
    const s = e.getCurrentPageShapes().find((s: any) => s.type === "linkkit-map");
    e.updateShape({ id: s.id, type: "linkkit-map", x: at.x, y: at.y });
    e.setCamera({ x: 0, y: 0, z: 1 });
    e.selectNone();
    return s.id as string;
  }, at);
}

async function startEditing(page: Page, shapeId: string) {
  await expect(page.locator(`[id="${shapeId}"] [data-linkkit-map][data-editing="false"] [data-map-view][data-ready]`)).toBeVisible();
  const b = await box(page.locator(`[id="${shapeId}"] [data-linkkit-map]`));
  // Clicks within tldraw's multi-click time of the last ones would count
  // as a third and fourth click.
  await page.waitForTimeout(500);
  // On the map's own margin, beside its first box: not on a box.
  await page.mouse.dblclick(b.x + 5, b.y + b.height / 2);
  await expect(page.locator('[data-linkkit-map][data-editing="true"] [data-map-view][data-ready]')).toBeVisible();
  await expect.poll(() => editingId(page)).toBe(shapeId);
  // A double-click on the paper of a tree says why not: let that go.
  await page.mouse.move(b.x - 40, b.y - 40);
}

async function escapeEditing(page: Page) {
  for (let i = 0; i < 3 && (await editingId(page)); i++) await page.keyboard.press("Escape");
  await expect.poll(() => editingId(page)).toBeNull();
}

/** Brightness spread and mean over a region of the window, from a real
    screenshot (decoded by the browser). */
async function pixels(page: Page, r: Rect) {
  const png = await page.screenshot({ clip: r });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let min = 255;
    let max = 0;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      min = Math.min(min, l);
      max = Math.max(max, l);
      sum += l;
    }
    return { min, max, mean: sum / (d.length / 4) };
  }, png.toString("base64"));
}

test("bug 1: while a map is edited, a filled box over a picture still hides it (one dim layer, not each item's opacity); the map stays bright; leaving restores", async ({ page, context }) => {
  const mapId = await seedMap(context, "Edited");
  await openWhiteboard(page);
  // A high-contrast picture (black and white stripes) and an opaque black box over part of it.
  const ids = await page.evaluate(() => {
    const e = (window as any).editor;
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 300;
    const g = c.getContext("2d")!;
    for (let x = 0; x < 400; x += 20) {
      g.fillStyle = (x / 20) % 2 ? "#ffffff" : "#000000";
      g.fillRect(x, 0, 20, 300);
    }
    const assetId = "asset:stripes";
    e.createAssets([{ id: assetId, type: "image", typeName: "asset", props: { name: "s.png", src: c.toDataURL("image/png"), w: 400, h: 300, mimeType: "image/png", isAnimated: false }, meta: {} }]);
    e.createShape({ type: "image", x: 100, y: 300, props: { assetId, w: 400, h: 300 } });
    e.createShape({ type: "geo", x: 150, y: 350, props: { w: 200, h: 120, fill: "solid", color: "black" } });
    const shapes = e.getCurrentPageShapes();
    return { image: shapes.find((s: any) => s.type === "image").id as string, geo: shapes.find((s: any) => s.type === "geo").id as string };
  });
  const map = await placeMap(page, mapId, { x: 800, y: 300 });
  await page.evaluate(() => void (window as any).editor.setCamera({ x: 0, y: 0, z: 1 }));
  // The box's inside, away from its stroke; a bare strip of the picture beside it.
  const boxArea = { x: 170, y: 370, width: 160, height: 80 };
  const bare = { x: 420, y: 370, width: 60, height: 80 };
  const mapBox = await box(boxOf(page, "Edited"));
  const mapPatch = { x: mapBox.x + 4, y: mapBox.y + 4, width: 8, height: 8 };
  const before = { box: await pixels(page, boxArea), bare: await pixels(page, bare), map: await pixels(page, mapPatch) };
  expect(before.box.max - before.box.min, "the box hides the stripes").toBeLessThan(8);
  expect(before.bare.max - before.bare.min, "the stripes show beside it").toBeGreaterThan(150);

  await startEditing(page, map);
  const during = { box: await pixels(page, boxArea), bare: await pixels(page, bare), map: await pixels(page, mapPatch) };
  expect(during.box.max - during.box.min, "still hides the stripes while dimmed").toBeLessThan(8);
  expect(Math.abs(during.box.mean - before.box.mean), "the box is dimmed (its brightness changed)").toBeGreaterThan(10);
  expect(during.bare.max - during.bare.min, "the picture is dimmed: less contrast").toBeLessThan((before.bare.max - before.bare.min) * 0.5);
  expect(Math.abs(during.map.mean - before.map.mean), "the edited map is not dimmed").toBeLessThan(6);
  const opacities = await page.evaluate((ids) => [ids.image, ids.geo].map((id) => Number(getComputedStyle(document.querySelector(`.tl-shape[data-shape-id="${id}"]`)!).opacity)), ids);
  expect(opacities, "no item outside the map below opacity 1").toEqual([1, 1]);
  // The label and the map's own toolbar stay bright: over the dim layer.
  await expect(page.getByTestId("map-editing-bar")).toBeVisible();

  await escapeEditing(page);
  await expect(page.getByTestId("map-editing-dim")).toHaveCount(0);
  const after = { box: await pixels(page, boxArea), bare: await pixels(page, bare) };
  expect(Math.abs(after.box.mean - before.box.mean)).toBeLessThan(3);
  expect(after.bare.max - after.bare.min).toBeGreaterThan(150);
});

test("bug 2: the label says what adds a box: tree rules on, a box's + or its dot; off, a double-click; with tree rules on a double-click inside or outside the map says why not", async ({ page, context }) => {
  const treeId = await seedMap(context, "Tree");
  await openWhiteboard(page);
  const tree = await placeMap(page, treeId, { x: 600, y: 300 });
  await startEditing(page, tree);
  const bar = page.getByTestId("map-editing-bar");
  await expect(bar).toHaveText("Editing map “Tree” — use a box’s + or drag its dot to add a box · Esc to finish");
  const count = await page.locator("[data-linkkit-map] [data-box-id]").count();
  const w = await box(page.locator(`[id="${tree}"] [data-map-view]`));
  const spots = {
    "inside the map (its margin)": { x: w.x + 5, y: w.y + w.height / 2 },
    "outside it, right": { x: w.x + w.width + 300, y: w.y + 200 },
    "outside it, left": { x: w.x - 300, y: w.y + 100 },
  };
  for (const [where, at] of Object.entries(spots)) {
    await page.waitForTimeout(600);
    await page.mouse.dblclick(at.x, at.y);
    const hint = page.getByRole("status").filter({ hasText: PAPER_REFUSAL });
    await expect(hint, where).toBeVisible();
    const h = await box(hint);
    // Shown where it was tried, and really drawn there (not cut off).
    expect(Math.hypot(h.x - at.x, h.y - at.y), `${where}: near the click`).toBeLessThan(200);
    expect(await clippedBy(hint), `${where}: not cut off`).toBeNull();
    expect(await page.locator("[data-linkkit-map] [data-box-id]").count(), `${where}: no box added`).toBe(count);
    expect(await editingId(page), `${where}: still editing`).toBe(tree);
  }
  await escapeEditing(page);

  // Tree rules off ("+ New map"): the double-click text, and it works there.
  await page.getByTestId("tools.map").click();
  await page.getByTestId("new-map").click();
  await expect(page.getByTestId("map-name-field")).toBeFocused();
  await page.keyboard.type("Loose");
  await page.keyboard.press("Enter");
  const loose = await page.evaluate(() => {
    const e = (window as any).editor;
    return e.getCurrentPageShapes().filter((s: any) => s.type === "linkkit-map").map((s: any) => s.id).find((id: string) => id !== e.getEditingShapeId() && true);
  });
  const looseId = (await page.evaluate((tree) => (window as any).editor.getCurrentPageShapes().find((s: any) => s.type === "linkkit-map" && s.id !== tree).id as string, tree)) ?? loose;
  await expect(page.locator(`[id="${looseId}"] [data-map-view][data-ready]`)).toBeVisible();
  await page.evaluate(() => void (window as any).editor.selectNone());
  const lw = await box(page.locator(`[id="${looseId}"] [data-map-view]`));
  await page.waitForTimeout(500);
  await page.mouse.dblclick(lw.x + lw.width / 2, lw.y + lw.height / 2);
  await expect.poll(() => editingId(page)).toBe(looseId);
  await expect(bar).toHaveText("Editing map “Loose” — double-click anywhere to add a box · Esc to finish");
  await page.waitForTimeout(600);
  await page.mouse.dblclick(lw.x + lw.width + 250, lw.y + 150);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("Works");
  await page.keyboard.press("Enter");
  await expect(boxOf(page, "Works")).toBeVisible();
});

/** Drags the dot of box `from` to `to`, checking the dashed line reaches
    the pointer there, on screen; lets go there. */
async function dragDot(page: Page, from: string, to: { x: number; y: number }, where: string) {
  const b = await box(boxOf(page, from));
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
  const dot = boxOf(page, from).locator('span[title="Drag to another box to connect"]');
  const d = await box(dot);
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 3 });
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) await page.mouse.move(d.x + ((to.x - d.x) * i) / steps, d.y + ((to.y - d.y) * i) / steps);
  // The arrowhead is at the pointer, and drawn there (its colour on screen).
  const head = await page.evaluate(({ x, y }) => {
    const path = [...document.querySelectorAll("[data-linkkit-map] svg path")].find((p) => getComputedStyle(p).fill !== "none" && p.closest("svg")?.getAttribute("aria-hidden") === "true");
    if (!path) return null;
    const r = path.getBoundingClientRect();
    return { near: Math.hypot(r.x + r.width / 2 - x, r.y + r.height / 2 - y), fill: getComputedStyle(path).fill, r: { x: r.x, y: r.y, width: Math.max(4, r.width), height: Math.max(4, r.height) } };
  }, to);
  expect(head, `${where}: a dashed line is drawn`).not.toBeNull();
  expect(head!.near, `${where}: it reaches the pointer`).toBeLessThan(25);
  const png = await page.screenshot({ clip: head!.r });
  const drawn = await page.evaluate(
    async ({ b64, fill }) => {
      const [r, g, bl] = fill.match(/\d+/g)!.map(Number);
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - bl) < 60) return true;
      return false;
    },
    { b64: png.toString("base64"), fill: head!.fill },
  );
  expect(drawn, `${where}: the arrowhead shows on screen (not cut off)`).toBe(true);
  await page.mouse.up();
}

test("bug 3: a box's dot dragged far past the map's edge (above, below, left, right): the line follows, and letting go on bare page adds a child; inside the map's area too", async ({ page, context }) => {
  const mapId = await seedMap(context, "Root");
  await openWhiteboard(page);
  const map = await placeMap(page, mapId, { x: 650, y: 380 });
  await startEditing(page, map);
  const w = await box(page.locator(`[id="${map}"] [data-map-view]`));
  const spots: [string, { x: number; y: number }][] = [
    ["inside the map's area", { x: w.x + 4, y: w.y + w.height - 4 }],
    ["right", { x: w.x + w.width + 350, y: w.y + 20 }],
    ["below", { x: w.x + 40, y: w.y + w.height + 300 }],
    ["left", { x: w.x - 350, y: w.y + 40 }],
    ["above", { x: w.x + 60, y: Math.max(140, w.y - 230) }],
  ];
  let n = await page.locator(`[id="${map}"] [data-box-id]`).count();
  for (const [where, at] of spots) {
    await dragDot(page, "Root", at, where);
    await expect(field(page), `${where}: a new child, ready for its name`).toBeFocused();
    await page.keyboard.type(`C ${where}`);
    await page.keyboard.press("Enter");
    await expect(field(page)).toHaveCount(0);
    n += 1;
    await expect(page.locator(`[id="${map}"] [data-box-id]`)).toHaveCount(n);
    // A child of Root, in the tree (it settles into the tree's layout), and the map holds it.
    await expect.poll(async () => {
      const view = await box(page.locator(`[id="${map}"] [data-map-view]`));
      return inside(await box(boxOf(page, `C ${where}`)), view, 2);
    }, { message: `${where}: the map holds the new box` }).toBe(true);
    expect(await editingId(page)).toBe(map);
  }
  await expect.poll(() => page.evaluate((id) => {
    const m = JSON.parse(localStorage.getItem(`linkkit:map:${id}`) ?? "null")?.map;
    const nodes = Object.values(m?.nodes ?? {}) as { id: string; name: string }[];
    const root = nodes.find((x) => x.name === "Root");
    return Object.values(m?.links ?? {}).filter((l: any) => l.from === root?.id).length;
  }, mapId)).toBe(spots.length);
});

/** A board widget placed from the picker, on a fresh board of Boardkit's own example. */
async function placeBoard(page: Page, boardId: string) {
  const before: string[] = await page.evaluate(() => (window as any).editor.getCurrentPageShapes().map((s: any) => s.id));
  await page.getByTestId("tools.board").click();
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  const made = () => page.evaluate((before) => (window as any).editor.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board" && !before.includes(s.id)) ?? null, before);
  await expect.poll(async () => (await made())?.props.scale ?? 0).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  return (await made()).id as string;
}

/** A second Boardkit board, empty (no lists): a copy of board `from`'s
    record without its lists and cards, added to Boardkit's list. Its id. */
async function seedEmptyBoard(context: BrowserContext, from: string) {
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  const id = await bk.evaluate((from) => {
    const id = `empty${Date.now()}`;
    const rec = JSON.parse(localStorage.getItem(`boardkit:board:${from}`)!);
    rec.board = { ...rec.board, lists: {}, cards: {}, listOrder: [], cardOrder: {}, trash: [], trashedLists: [] };
    localStorage.setItem(`boardkit:board:${id}`, JSON.stringify(rec));
    const list = JSON.parse(localStorage.getItem("boardkit:registry")!);
    localStorage.setItem("boardkit:registry", JSON.stringify({ ...list, boards: [...list.boards, { id, name: "Empty board" }] }));
    return id;
  }, from);
  await bk.close();
  return id;
}

async function checkMapViews(page: Page, shapeId: string, label: string) {
  const sw = page.locator(`[id="${shapeId}"] [data-testid="view-switch"]`);
  for (const view of ["map", "both"] as const) {
    // Nothing selected: the style panel (top left) would cover the switch.
    await page.evaluate(() => void (window as any).editor.selectNone());
    await page.mouse.move(5, 500);
    const b = await box(page.locator(`[id="${shapeId}"] .gb-scaled`));
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
    await sw.locator(`[data-view="${view}"]`).click({ timeout: 10_000 });
    await expect(sw.locator(`[data-view="${view}"]`)).toHaveAttribute("aria-pressed", "true");
    const boxes = page.locator(`[id="${shapeId}"] [data-linkkit-map] [data-box-id]`);
    await expect.poll(() => boxes.count()).toBeGreaterThan(0);
    await expect(page.locator(`[id="${shapeId}"] [data-map-view][data-ready]`)).toBeVisible();
    await page.waitForTimeout(300);
    // The board's area on screen, and the map's visible part (its view, cut by the board).
    const board = await page.evaluate((id) => {
      const e = (window as any).editor;
      const pb = e.getShapePageBounds(id);
      const a = e.pageToScreen({ x: pb.x, y: pb.y });
      const c = e.pageToScreen({ x: pb.maxX, y: pb.maxY });
      return { x: a.x, y: a.y, width: c.x - a.x, height: c.y - a.y };
    }, shapeId);
    const view_ = await box(page.locator(`[id="${shapeId}"] [data-map-view]`));
    const all = await boxes.evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, name: el.textContent };
    }));
    for (const r of all) {
      expect(inside(r, view_, 1), `${label}, ${view}: “${r.name}” inside the map's view`).toBe(true);
      expect(inside(r, board, 1), `${label}, ${view}: “${r.name}” inside the board`).toBe(true);
    }
    // Boxes don't sit on one spot (a laid-out tree).
    if (all.length > 1) expect(new Set(all.map((r) => `${Math.round(r.x)},${Math.round(r.y)}`)).size, `${label}, ${view}: laid out`).toBeGreaterThan(1);
  }
}

async function addMapView(page: Page, shapeId: string) {
  const b = await box(page.locator(`[id="${shapeId}"] [data-boardkit-board]`));
  await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 4 });
  const add = page.locator(`[id="${shapeId}"] [data-testid="add-map-view"]`);
  await expect(add).toBeVisible();
  const a = await box(add);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 6 });
  await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
  await expect(page.locator(`[id="${shapeId}"] [data-testid="view-switch"]`)).toHaveCount(1);
}

test("bug 4: a board's Map and Both views show the whole map, every box inside the board: a new several-level map and a new one-box map", async ({ page, context }) => {
  const full = await seedBoard(context);
  const empty = await seedEmptyBoard(context, full);
  await openWhiteboard(page);
  const a = await placeBoard(page, full);
  await page.evaluate((id) => void (window as any).editor.updateShape({ id, type: "boardkit-board", x: 260, y: 160 }), a);
  await addMapView(page, a);
  await checkMapViews(page, a, "several levels");
  const b = await placeBoard(page, empty);
  await page.evaluate((id) => void (window as any).editor.updateShape({ id, type: "boardkit-board", x: 1000, y: 120 }), b);
  await addMapView(page, b);
  await checkMapViews(page, b, "one box");
  // Dragging the board's corner still scales it as a whole (inward: in
  // Both view it is already as big as the page allows, fit.ts).
  const before = await page.evaluate((id) => (window as any).editor.getShape(id).props.scale as number, a);
  await page.evaluate((id) => void (window as any).editor.select(id), a);
  const r = await page.evaluate((id) => {
    const e = (window as any).editor;
    const pb = e.getShapePageBounds(id);
    const p = e.pageToScreen({ x: pb.x, y: pb.y });
    const q = e.pageToScreen({ x: pb.maxX, y: pb.maxY });
    return { x: p.x, y: p.y, width: q.x - p.x, height: q.y - p.y };
  }, a);
  // (Its top-left corner: the right one is past the window's edge.)
  await page.mouse.move(r.x, r.y, { steps: 3 });
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(r.x + 12 * i, r.y + 8 * i);
  await page.mouse.up();
  await expect.poll(() => page.evaluate((id) => (window as any).editor.getShape(id).props.scale as number, a)).toBeLessThan(before * 0.95);
  await page.evaluate((id) => {
    const e = (window as any).editor;
    e.selectNone();
    e.updateShape({ id, type: "boardkit-board", x: 260, y: 160 });
  }, a);
  await checkMapViews(page, a, "several levels, scaled down");
});
