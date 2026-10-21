import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { box, seedBoard, seedMap, whiteboardSaved } from "./helpers";

/**
 * Linkkit maps as whiteboard widgets (phase 3, src/maps/). Fresh, empty
 * browser profile per test; everything is done with the mouse and
 * keyboard, `window.editor` and localStorage are only read to check (and,
 * where marked, to set up what a person can't make by hand).
 */

type MapShape = { id: string; x: number; y: number; mapId: string; w: number; h: number; scale: number; cropX: number; cropY: number };
type StoredNode = { id: string; name: string; x: number; y: number };
type StoredMap = { id: string; name: string; nodes: Record<string, StoredNode>; links: Record<string, { from: string; to: string }>; trash: unknown[] };

const mapShapes = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "linkkit-map")
      .map((s: any) => ({ id: s.id, x: s.x, y: s.y, ...s.props })),
  ) as Promise<MapShape[]>;

const stored = (page: Page, mapId: string) =>
  page.evaluate((id) => {
    const raw = localStorage.getItem(`linkkit:map:${id}`);
    return raw ? ((JSON.parse(raw) as { map: unknown }).map as StoredMap) : null;
  }, mapId);

const names = async (page: Page, mapId: string) => Object.values((await stored(page, mapId))?.nodes ?? {}).map((n) => n.name).sort();

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Map button -> "+ New map"; the name is kept (Enter); waits until the
    widget is drawn. Its shape. */
async function newMap(page: Page): Promise<MapShape> {
  const before = (await mapShapes(page)).map((s) => s.id);
  await page.getByTestId("tools.map").click();
  await page.getByTestId("new-map").click();
  await expect(page.getByTestId("map-picker")).toHaveCount(0);
  await expect(page.getByTestId("map-name-field")).toBeFocused();
  await page.keyboard.press("Enter");
  let made: MapShape | undefined;
  await expect
    .poll(async () => {
      made = (await mapShapes(page)).find((s) => !before.includes(s.id));
      return made?.scale ?? 0;
    })
    .toBeGreaterThan(0);
  return made!;
}

/** The widget's map, as drawn. */
const widget = (page: Page, shapeId: string) => page.locator(`[id="${shapeId}"] [data-linkkit-map]`);
const editingMap = (page: Page) => page.locator('[data-linkkit-map][data-editing="true"] [data-map-view][data-ready]');

/** Double-clicks the widget's middle: editing starts. */
async function startEditing(page: Page, shapeId: string) {
  const b = await box(widget(page, shapeId));
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await expect(editingMap(page)).toBeVisible();
  expect(await page.evaluate(() => (window as any).editor.getEditingShapeId())).toBe(shapeId);
}

/** A box added by double-clicking the map's paper at (x, y) (window
    pixels), named `name`. */
async function addBox(page: Page, x: number, y: number, name: string) {
  await page.mouse.dblclick(x, y);
  const field = page.getByRole("textbox", { name: "Box name" });
  await expect(field).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
}

/** A point on the first arrow's line, `at` of the way along (window
    pixels): not on its label, which sits in the middle. */
const pointOnLine = (page: Page, at: number) =>
  page.evaluate((at) => {
    const path = document.querySelector<SVGPathElement>("[data-linkkit-map] .react-flow__edge path")!;
    const p = path.getPointAtLength(path.getTotalLength() * at);
    const m = path.getScreenCTM()!;
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  }, at);

const boxOf = (page: Page, mapId: string, name: string) =>
  page.locator(`[data-linkkit-map] [data-box-id]`).filter({ hasText: new RegExp(`^${name}$`) });

test("+ New map: a real Linkkit map, named in place, placed in the middle of the view, selected, one undo", async ({ page }) => {
  await openWhiteboard(page);
  await page.getByTestId("tools.map").click();
  await page.getByTestId("new-map").click();
  const field = page.getByTestId("map-name-field");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Untitled map");
  await page.keyboard.type("Plans");
  await page.keyboard.press("Enter");
  const [made] = await mapShapes(page);
  expect(made).toBeTruthy();
  await expect.poll(async () => (await stored(page, made.mapId))?.name).toBe("Plans");
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([made.id]);
  // In the middle of the view (give or take the name label: a field while
  // typed, a little taller).
  const shape = (await mapShapes(page))[0];
  const view = await page.evaluate(() => {
    const v = (window as any).editor.getViewportPageBounds();
    return { x: v.midX, y: v.midY };
  });
  expect(Math.abs(shape.x + shape.w / 2 - view.x)).toBeLessThan(2);
  expect(Math.abs(shape.y + shape.h / 2 - view.y)).toBeLessThan(5);
  // Listed in Linkkit.
  const registry = await page.evaluate(() => JSON.parse(localStorage.getItem("linkkit:registry")!) as { maps: { id: string; name: string }[] });
  expect(registry.maps.map((m) => m.id)).toContain(made.mapId);

  // One Ctrl+Z takes the widget off. The map was renamed, so it stays.
  await page.keyboard.press("Control+z");
  await expect.poll(() => mapShapes(page)).toHaveLength(0);
  expect(await stored(page, made.mapId)).not.toBeNull();
});

test("edit in place: add, rename, move and delete boxes, draw and delete an arrow; each shows in /linkkit", async ({ page, context }) => {
  await openWhiteboard(page);
  const made = await newMap(page);
  await startEditing(page, made.id);
  const area = await box(widget(page, made.id));
  await addBox(page, area.x + 80, area.y + 60, "Alpha");
  await addBox(page, area.x + 240, area.y + 110, "Beta");
  await expect.poll(() => names(page, made.mapId)).toEqual(["Alpha", "Beta"]);

  // Rename: a double-click on a box.
  const alpha = boxOf(page, made.mapId, "Alpha");
  const a = await box(alpha);
  await page.mouse.dblclick(a.x + a.width / 2, a.y + a.height / 2);
  await expect(page.getByRole("textbox", { name: "Box name" })).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Gamma");
  await page.keyboard.press("Enter");
  await expect.poll(() => names(page, made.mapId)).toEqual(["Beta", "Gamma"]);

  // Move: drag Beta. The widget's map follows the pointer at its scale.
  const beta = boxOf(page, made.mapId, "Beta");
  const before = Object.values((await stored(page, made.mapId))!.nodes).find((n) => n.name === "Beta")!;
  const b = await box(beta);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 20, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const scale = (await mapShapes(page))[0].scale * (await page.evaluate(() => (window as any).editor.getZoomLevel()));
  await expect
    .poll(async () => {
      const after = Object.values((await stored(page, made.mapId))!.nodes).find((n) => n.name === "Beta")!;
      return [Math.round(after.x - before.x), Math.round(after.y - before.y)];
    })
    .toEqual([Math.round(60 / scale), Math.round(40 / scale)]);
  // The widget never moved for it.
  expect((await mapShapes(page))[0].id).toBe(made.id);

  // An arrow: from Gamma's dot to Beta.
  const gamma = boxOf(page, made.mapId, "Gamma");
  await gamma.hover();
  const dot = gamma.locator('[title="Drag to another box to connect"]');
  const d = await box(dot);
  const t = await box(beta);
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Object.keys((await stored(page, made.mapId))!.links).length).toBe(1);

  // In /linkkit, as it is now.
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await expect(lk.locator("[data-box-id]").filter({ hasText: /^Gamma$/ })).toBeVisible();
  await expect(lk.locator("[data-box-id]").filter({ hasText: /^Beta$/ })).toBeVisible();
  await lk.close();

  // Delete the arrow (picked by a click on its line, then Delete), then
  // Beta (picked, Delete): into Linkkit's own trash.
  await page.bringToFront();
  const l = await pointOnLine(page, 0.25);
  await page.mouse.click(l.x, l.y);
  await page.keyboard.press("Delete");
  await expect.poll(async () => Object.keys((await stored(page, made.mapId))!.links).length).toBe(0);
  const b2 = await box(beta);
  await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.keyboard.press("Delete");
  await expect.poll(() => names(page, made.mapId)).toEqual(["Gamma"]);
  expect((await stored(page, made.mapId))!.trash.length).toBeGreaterThan(0);
  // Still a widget, still editing.
  expect(await mapShapes(page)).toHaveLength(1);

  // Escape lets go of nothing more and ends editing.
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => (window as any).editor.getEditingShapeId())).toBeNull();
  await whiteboardSaved(page);
});

/** Every stored byte of Linkkit's and Boardkit's. */
const appBytes = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("linkkit:") || k.startsWith("boardkit:")) out[k] = localStorage.getItem(k)!;
    }
    return out;
  });

/** Map button -> an existing map; waits until it is drawn. Its shape. */
async function placeMap(page: Page, mapId: string): Promise<MapShape> {
  await page.getByTestId("tools.map").click();
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  await expect(page.getByTestId("map-picker")).toHaveCount(0);
  let made: MapShape | undefined;
  await expect
    .poll(async () => {
      made = (await mapShapes(page)).find((s) => s.mapId === mapId);
      return made?.scale ?? 0;
    })
    .toBeGreaterThan(0);
  await expect(page.locator(`[id="${made!.id}"] [data-map-view][data-ready]`)).toBeVisible();
  return (await mapShapes(page)).find((s) => s.mapId === mapId)!;
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.mouse.up();
}

const pt = (page: Page, x: number, y: number) => page.evaluate((p) => (window as any).editor.pageToScreen(p), { x, y }) as Promise<{ x: number; y: number }>;

test("an existing map placed from the Map picker shows its boxes, and placing it writes nothing", async ({ page, context }) => {
  const mapId = await seedMap(context, "Seeded start");
  await openWhiteboard(page);
  const bytes = await appBytes(page);
  const s = await placeMap(page, mapId);
  await expect(widget(page, s.id).locator("[data-box-id]").filter({ hasText: "Seeded start" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([s.id]);
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(page.locator(`[id="${s.id}"] [data-map-view][data-ready]`)).toBeVisible();
  expect(await appBytes(page)).toEqual(bytes);
});

test("a corner drag scales the whole map like a picture, and undo puts it back", async ({ page, context }) => {
  const mapId = await seedMap(context, "Scaled start");
  await openWhiteboard(page);
  const before = await placeMap(page, mapId);
  const start = widget(page, before.id).locator("[data-box-id]").first();
  const boxBefore = await box(start);
  const a = await pt(page, before.x + before.w, before.y + before.h);
  await drag(page, a, { x: a.x - before.w * 0.4, y: a.y - before.h * 0.4 });
  const after = (await mapShapes(page))[0];
  expect(after.scale).toBeLessThan(before.scale * 0.8);
  expect(after.w / after.h).toBeCloseTo(before.w / before.h, 2);
  const boxAfter = await box(start);
  expect(boxAfter.width / boxBefore.width).toBeCloseTo(after.scale / before.scale, 1);
  expect(after.x).toBeCloseTo(before.x, 0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await mapShapes(page))[0].scale).toBeCloseTo(before.scale, 5);
});

test("live: an edit in /linkkit shows on the whiteboard at once, no reload", async ({ page, context }) => {
  const mapId = await seedMap(context, "Before");
  await openWhiteboard(page);
  const s = await placeMap(page, mapId);
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  const startBox = lk.locator("[data-box-id]").filter({ hasText: /^Before$/ });
  await startBox.dblclick();
  await lk.keyboard.press("Control+a");
  await lk.keyboard.type("After");
  await lk.keyboard.press("Enter");
  await expect(widget(page, s.id).locator("[data-box-id]").filter({ hasText: /^After$/ })).toBeVisible({ timeout: 10_000 });
  await lk.close();
});

test("box select and lasso pick the map like any other shape", async ({ page, context }) => {
  const mapId = await seedMap(context, "Picked");
  await openWhiteboard(page);
  const s = await placeMap(page, mapId);
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  await page.keyboard.press("v");
  await drag(page, await pt(page, s.x - 20, s.y - 20), await pt(page, s.x + s.w + 20, s.y + s.h + 20));
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([s.id]);

  await page.evaluate(() => void (window as any).editor.selectNone());
  await page.keyboard.press("w");
  const loop = [
    await pt(page, s.x - 20, s.y - 20),
    await pt(page, s.x + s.w + 20, s.y - 20),
    await pt(page, s.x + s.w + 20, s.y + s.h + 20),
    await pt(page, s.x - 20, s.y + s.h + 20),
    await pt(page, s.x - 20, s.y - 10),
  ];
  await page.mouse.move(loop[0].x, loop[0].y);
  await page.mouse.down();
  for (const p of loop.slice(1)) await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([s.id]);
});

test("the edge wall: a map dragged far past the page's right edge stays on the page every step; Ctrl+Z puts it back", async ({ page, context }) => {
  const mapId = await seedMap(context, "Walled");
  await openWhiteboard(page);
  const s = await placeMap(page, mapId);
  const c = await pt(page, s.x + s.w / 2, s.y + s.h / 2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(c.x + i * 80, c.y);
    const ok = await page.evaluate((id) => {
      const e = (window as any).editor;
      const p = e.getCameraOptions().constraints.bounds;
      const b = e.getShapePageBounds(id);
      return b.x >= p.x - 0.01 && b.maxX <= p.x + p.w + 0.01;
    }, s.id);
    expect(ok).toBe(true);
  }
  await page.mouse.up();
  const moved = (await mapShapes(page))[0];
  expect(moved.x).toBeGreaterThan(s.x);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await mapShapes(page))[0].x).toBeCloseTo(s.x, 3);
});

test("a bracket map shown on the whiteboard at several window sizes changes no stored byte", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await lk.getByRole("button", { name: /Switch map/ }).click();
  await lk.getByRole("menuitem", { name: "+ New" }).click();
  await lk.getByRole("menuitem", { name: "Bracket" }).click();
  await lk.getByRole("menuitem", { name: "8 players", exact: true }).click();
  await expect(lk.getByRole("textbox", { name: "Player name" })).toBeFocused();
  await lk.evaluate((text) => navigator.clipboard.writeText(text), ["Ann", "Bob", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal"].join("\n"));
  await lk.keyboard.press("Control+V");
  await expect(lk.locator("[data-player-row]").first()).toHaveText("Ann");
  await lk.keyboard.press("Escape");
  const mapId = await lk.evaluate(() => (JSON.parse(localStorage.getItem("linkkit:registry")!) as { maps: { id: string }[] }).maps.at(-1)!.id);
  await expect.poll(() => lk.evaluate((id) => (JSON.parse(localStorage.getItem(`linkkit:map:${id}`) ?? "{}") as any).map?.kind, mapId)).toBe("bracket");
  await lk.waitForTimeout(800);
  await lk.close();

  await openWhiteboard(page);
  const bytes = await appBytes(page);
  const s = await placeMap(page, mapId);
  await expect(widget(page, s.id).locator("[data-player-row]").first()).toHaveText("Ann");
  await whiteboardSaved(page);
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 900, height: 600 },
    { width: 640, height: 480 },
  ]) {
    await page.setViewportSize(size);
    await page.reload();
    await page.waitForFunction(() => "editor" in window);
    await expect(page.locator(`[id="${s.id}"] [data-map-view][data-ready]`)).toBeVisible();
    await page.waitForTimeout(500);
    expect(await appBytes(page), `at ${size.width}x${size.height}`).toEqual(bytes);
  }
});

// ---- A board with a linked map: one widget, "List | Map | Both" ----------

/** A Linkkit tree named `name` with one list ("List A") holding one card
    ("Card 1"), linked to a new Boardkit board (Linkkit's "Link to
    Boardkit"): its map and board ids. */
async function seedLinked(context: BrowserContext, name: string): Promise<{ mapId: string; boardId: string }> {
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  const notNow = bk.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) await notNow.click();
  await expect(bk.getByRole("button", { name: "Switch board" })).toBeVisible();
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await expect(lk.locator("[data-ready]")).toBeVisible({ timeout: 30_000 });
  const menu = async (...path: string[]) => {
    await lk.getByRole("button", { name: /^Switch map/ }).click();
    for (const item of path) await lk.getByRole("menuitem", { name: new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
  };
  const field = lk.getByRole("textbox", { name: "Box name" });
  await menu("+ New", "Map with tree rules");
  await expect(field).toBeFocused();
  await lk.keyboard.type(name);
  await lk.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  const addChild = async (parent: string, child: string) => {
    const p = lk.locator("[data-box-id]").filter({ hasText: new RegExp(`^${parent}$`) });
    await p.hover();
    await p.getByRole("button", { name: "Add a child", exact: true }).click();
    await expect(field).toBeFocused();
    await lk.keyboard.type(child);
    await lk.keyboard.press("Enter");
    await expect(field).toHaveCount(0);
  };
  await addChild(name, "List A");
  await addChild("List A", "Card 1");
  await menu("This map", "Link to Boardkit…");
  await lk.getByRole("alertdialog").getByRole("button", { name: "Link", exact: true }).click();
  await expect(lk.getByText("Linked to Boardkit")).toBeVisible();
  const mapId = await lk.evaluate(() => localStorage.getItem("linkkit:active")!);
  const boardId = await lk.evaluate((id) => (JSON.parse(localStorage.getItem(`linkkit:map:${id}`)!) as { map: { linkedBoard: string } }).map.linkedBoard, mapId);
  await lk.waitForTimeout(800);
  await lk.close();
  await bk.close();
  return { mapId, boardId };
}

type BoardWidget = { id: string; x: number; y: number; w: number; h: number; scale: number; boardId: string; view?: string };
const boardShapes = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "boardkit-board")
      .map((s: any) => ({ id: s.id, x: s.x, y: s.y, ...s.props, view: s.meta?.view })),
  ) as Promise<BoardWidget[]>;

async function placeBoard(page: Page, boardId: string): Promise<BoardWidget> {
  const before = (await boardShapes(page)).map((s) => s.id);
  await page.getByTestId("tools.board").click();
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  let made: BoardWidget | undefined;
  await expect
    .poll(async () => {
      made = (await boardShapes(page)).find((s) => !before.includes(s.id));
      return made?.scale ?? 0;
    })
    .toBeGreaterThan(0);
  return made!;
}

const switchOf = (page: Page, shapeId: string) => page.locator(`[id="${shapeId}"] [data-testid="view-switch"]`);
const boardOf = (page: Page, shapeId: string) => page.locator(`[id="${shapeId}"] [data-boardkit-board]`);
const mapOf = (page: Page, shapeId: string) => page.locator(`[id="${shapeId}"] [data-linkkit-map]`);

test("the switch shows on a board with a linked map only, on hover or selection; Map and Both show the map; stored per widget, kept on reload", async ({ page, context }) => {
  const { boardId } = await seedLinked(context, "Linked tree");
  const plain = await seedBoard(context);
  await openWhiteboard(page);
  const linked = await placeBoard(page, boardId);
  // Selected: the switch shows, List pressed.
  await expect(switchOf(page, linked.id)).toBeVisible();
  await expect(switchOf(page, linked.id).locator('[data-view="list"]')).toHaveAttribute("aria-pressed", "true");
  await expect(boardOf(page, linked.id)).toBeVisible();
  await expect(mapOf(page, linked.id)).toHaveCount(0);

  // A board without a linked map has none; nor has a map on its own.
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  const other = await placeBoard(page, plain);
  await expect(page.locator(`[id="${other.id}"] [data-testid="view-switch"]`)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());

  // Not selected, pointer away: hidden. Pointer over it: shown.
  await page.mouse.move(5, 300);
  await expect(switchOf(page, linked.id)).toBeHidden();
  const b = await box(boardOf(page, linked.id));
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect(switchOf(page, linked.id)).toBeVisible();

  // Map: only the map, its tree's boxes.
  await switchOf(page, linked.id).locator('[data-view="map"]').click();
  await expect(mapOf(page, linked.id).locator("[data-map-view][data-ready]")).toBeVisible();
  await expect(boardOf(page, linked.id)).toHaveCount(0);
  await expect(mapOf(page, linked.id).locator("[data-box-id]").filter({ hasText: /^Card 1$/ })).toBeVisible();
  expect((await boardShapes(page)).find((s) => s.id === linked.id)!.view).toBe("map");

  // Both: side by side, list left of the map, in one widget box.
  await switchOf(page, linked.id).locator('[data-view="both"]').click();
  await expect(boardOf(page, linked.id)).toBeVisible();
  await expect(mapOf(page, linked.id).locator("[data-map-view][data-ready]")).toBeVisible();
  const list = await box(boardOf(page, linked.id));
  const map = await box(mapOf(page, linked.id));
  expect(map.x).toBeGreaterThan(list.x + list.width);
  const w = (await boardShapes(page)).find((s) => s.id === linked.id)!;
  const shown = await pt(page, w.x + w.w, w.y + w.h);
  expect(map.x + map.width).toBeLessThanOrEqual(shown.x + 1);

  // Per widget: a second widget of the same board keeps its own (List).
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  const second = await placeBoard(page, boardId);
  expect(second.view).toBeUndefined();
  await expect(switchOf(page, second.id).locator('[data-view="list"]')).toHaveAttribute("aria-pressed", "true");

  // Undo takes a view change back; redo again.
  await page.keyboard.press("Control+z"); // the second widget
  await page.keyboard.press("Control+z"); // Both -> Map
  await expect.poll(async () => (await boardShapes(page)).find((s) => s.id === linked.id)?.view).toBe("map");
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await boardShapes(page)).find((s) => s.id === linked.id)?.view).toBe("both");

  // Survives a reload.
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(mapOf(page, linked.id).locator("[data-map-view][data-ready]")).toBeVisible();
  await expect(boardOf(page, linked.id)).toBeVisible();
  expect((await boardShapes(page)).find((s) => s.id === linked.id)!.view).toBe("both");
});

test("Both: an edit in the list shows in the map at once, and one in the map shows in the list", async ({ page, context }) => {
  const { boardId, mapId } = await seedLinked(context, "Shared tree");
  await openWhiteboard(page);
  const w = await placeBoard(page, boardId);
  await switchOf(page, w.id).locator('[data-view="both"]').click();
  await expect(mapOf(page, w.id).locator("[data-map-view][data-ready]")).toBeVisible();

  // The list half: rename "Card 1" (double-click its title).
  const card = boardOf(page, w.id).locator("article[data-card-id]").filter({ hasText: "Card 1" });
  const c = await box(card);
  await page.mouse.dblclick(c.x + c.width / 2, c.y + c.height / 2);
  await expect(page.locator('[data-boardkit-board][data-editing="true"]')).toBeVisible();
  await expect(page.locator("textarea, input").and(page.locator(":focus"))).toHaveCount(1);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Card one");
  await page.keyboard.press("Enter");
  await expect(mapOf(page, w.id).locator("[data-box-id]").filter({ hasText: /^Card one$/ })).toBeVisible({ timeout: 5_000 });

  // The map half: a press there edits it; rename "List A" there.
  const listBox = mapOf(page, w.id).locator("[data-box-id]").filter({ hasText: /^List A$/ });
  const l = await box(listBox);
  await page.mouse.click(l.x + l.width / 2, l.y + l.height / 2);
  await expect(page.locator('[data-linkkit-map][data-editing="true"] [data-map-view][data-ready]')).toBeVisible();
  const l2 = await box(mapOf(page, w.id).locator("[data-box-id]").filter({ hasText: /^List A$/ }));
  await page.mouse.dblclick(l2.x + l2.width / 2, l2.y + l2.height / 2);
  await expect(page.getByRole("textbox", { name: "Box name" })).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("List B");
  await page.keyboard.press("Enter");
  await expect(boardOf(page, w.id).locator("h2").filter({ hasText: "List B" })).toBeVisible({ timeout: 5_000 });

  // Both stored: the board's list and the map's box.
  await expect
    .poll(() => page.evaluate((id) => JSON.stringify(JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!)), boardId))
    .toContain("List B");
  await expect.poll(() => names(page, mapId)).toContain("List B");
  await page.keyboard.press("Escape");
});

// ---- One undo for the page, maps included (step 4) ------------------------

/** A box of the map widget `shapeId`, renamed in place by a double-click
    (which also starts editing), then Escape until the map is no longer
    edited. */
async function renameMapBox(page: Page, shapeId: string, from: string, to: string) {
  const b = await box(widget(page, shapeId).locator("[data-box-id]").filter({ hasText: new RegExp(`^${from}$`) }));
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  const field = page.getByRole("textbox", { name: "Box name" });
  await expect(field).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type(to);
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  for (let i = 0; i < 4 && (await page.evaluate(() => (window as any).editor.getEditingShapeId())); i++) await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => (window as any).editor.getEditingShapeId())).toBeNull();
}

test("one undo for the page: a whiteboard move, a card edit and a map edit are undone and redone in exact order", async ({ page, context }) => {
  const mapId = await seedMap(context, "Undo start");
  const boardId = await seedBoard(context);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openWhiteboard(page);

  // A rectangle, a board and the map, apart.
  await page.keyboard.press("2");
  await drag(page, { x: 200, y: 150 }, { x: 300, y: 220 });
  await page.keyboard.press("Escape");
  const rectId = await page.evaluate(() => (window as any).editor.getCurrentPageShapes().find((s: any) => s.type === "geo").id as string);
  const b = await placeBoard(page, boardId);
  await page.keyboard.press("Escape");
  const m = await placeMap(page, mapId);
  // Out of the board's way: dragged down (an earlier step of its own).
  const mc = await pt(page, m.x + m.w / 2, m.y + m.h / 2);
  await drag(page, mc, { x: mc.x, y: Math.min(960, mc.y + b.h + 80) });
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());

  const rec = () => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), boardId);
  const r0 = await rec();
  const cardId = r0.board.cardOrder[r0.board.listOrder[0]][0];
  const oldTitle = r0.board.cards[cardId].title as string;
  const rectAt = () => page.evaluate((id) => Math.round((window as any).editor.getShape(id).x), rectId);

  // 1. Move the rectangle.
  const x0 = await rectAt();
  const rc = await pt(page, 250, 185);
  await page.evaluate((id) => void (window as any).editor.select(id), rectId);
  await drag(page, rc, { x: rc.x + 120, y: rc.y });
  await page.keyboard.press("Escape");
  const x1 = await rectAt();
  expect(x1).toBeGreaterThan(x0);
  // 2. Rename a card on the board.
  const t = await box(page.locator(`[id="${b.id}"] article[data-card-id="${cardId}"] [data-card-title]`));
  await page.mouse.dblclick(t.x + 10, t.y + t.height / 2);
  await expect(page.locator('[data-boardkit-board][data-editing="true"]')).toHaveCount(1);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("ZZ card renamed");
  await page.keyboard.press("Enter");
  for (let i = 0; i < 3 && (await page.locator('[data-boardkit-board][data-editing="true"]').count()) > 0; i++) await page.keyboard.press("Escape");
  await expect.poll(async () => (await rec()).board.cards[cardId].title).toBe("ZZ card renamed");
  // 3. Rename the map's box.
  await renameMapBox(page, m.id, "Undo start", "ZZ box renamed");
  await expect.poll(() => names(page, mapId)).toEqual(["ZZ box renamed"]);

  const state = async () => ({ x: await rectAt(), card: (await rec()).board.cards[cardId].title, box: (await names(page, mapId))[0] });
  const expectState = (x: number, card: string, boxName: string) => expect.poll(state).toEqual({ x, card, box: boxName });

  // Undo: the map, then the card, then the move (keys and the button).
  await page.keyboard.press("Control+z");
  await expectState(x1, "ZZ card renamed", "Undo start");
  await expect(widget(page, m.id).locator("[data-box-id]").filter({ hasText: /^Undo start$/ })).toBeVisible();
  await page.keyboard.press("Control+z");
  await expectState(x1, oldTitle, "Undo start");
  await page.getByRole("button", { name: "Undo" }).click();
  await expectState(x0, oldTitle, "Undo start");
  // Redo in the same order: the move, the card, the map.
  await page.keyboard.press("Control+y");
  await expectState(x1, oldTitle, "Undo start");
  await page.getByRole("button", { name: "Redo" }).click();
  await expectState(x1, "ZZ card renamed", "Undo start");
  await page.keyboard.press("Control+Shift+z");
  await expectState(x1, "ZZ card renamed", "ZZ box renamed");
  await expect(widget(page, m.id).locator("[data-box-id]").filter({ hasText: /^ZZ box renamed$/ })).toBeVisible();
});

// ---- Failed map saves (step 5) --------------------------------------------

test("a map edit on the whiteboard that can't be saved (storage full) shows the banner and a Leave-site prompt; with room again, Try again saves it", async ({ page, context }) => {
  const mapId = await seedMap(context, "Saved later");
  await openWhiteboard(page);
  const m = await placeMap(page, mapId);
  await page.keyboard.press("Escape");
  const filled = await page.evaluate(() => {
    const keys: string[] = [];
    for (const size of [1 << 20, 1 << 16, 1 << 10, 64, 1]) {
      const chunk = "x".repeat(size);
      for (;;) {
        const key = `e2e:fill:${keys.length}`;
        try {
          localStorage.setItem(key, chunk);
          keys.push(key);
        } catch {
          break;
        }
      }
    }
    return keys;
  });
  expect(filled.length).toBeGreaterThan(0);
  const banner = page.locator("[data-map-save-failed]");
  await expect(banner).toHaveCount(0);
  // A much longer name: a write that replaces a key only needs room for
  // what it adds.
  const long = "ZZ saved later " + "x".repeat(400);
  const b = await box(widget(page, m.id).locator("[data-box-id]").first());
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByRole("textbox", { name: "Box name" })).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(long);
  await page.keyboard.press("Enter");
  await expect(banner).toBeVisible({ timeout: 5_000 });
  await expect(banner).toContainText("Map changes aren't being saved");
  expect(await names(page, mapId)).not.toContain(long);
  // Closing the tab asks first.
  const asked = new Promise<string>((resolve) => page.once("dialog", (d) => (resolve(d.type()), void d.dismiss())));
  await page.close({ runBeforeUnload: true });
  expect(await asked).toBe("beforeunload");
  expect(page.isClosed()).toBe(false);
  // Room again: Try again stores the edit, and the banner goes.
  await page.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), filled);
  await banner.getByRole("button", { name: "Try again" }).click();
  await expect(banner).toHaveCount(0);
  await expect.poll(() => names(page, mapId)).toEqual([long]);
});
