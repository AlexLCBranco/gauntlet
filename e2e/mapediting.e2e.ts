import { expect, test, type Page } from "@playwright/test";

import { box } from "./helpers";

/**
 * Editing a map: the whole page is the map's space, and it's obvious you're
 * editing one (hand-test round item 7, owner 2026-10-21). Fresh browser
 * profile per test; every map is made here ("+ New map").
 */

test.use({ viewport: { width: 1600, height: 1000 } });

type MapShape = { id: string; x: number; y: number; mapId: string; w: number; h: number; scale: number };
type Rect = { x: number; y: number; width: number; height: number };

const mapShapes = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "linkkit-map")
      .map((s: any) => ({ id: s.id, x: s.x, y: s.y, ...s.props })),
  ) as Promise<MapShape[]>;
const editingId = (page: Page) => page.evaluate(() => (window as any).editor.getEditingShapeId() as string | null);
const widget = (page: Page, shapeId: string) => page.locator(`[id="${shapeId}"] [data-linkkit-map]`);
const editingMap = (page: Page) => page.locator('[data-linkkit-map][data-editing="true"] [data-map-view][data-ready]');
const boxOf = (page: Page, name: string) => page.locator("[data-linkkit-map] [data-box-id]").filter({ hasText: new RegExp(`^${name}$`) });
const boxCount = (page: Page) => page.locator("[data-linkkit-map] [data-box-id]").count();
const field = (page: Page) => page.getByRole("textbox", { name: "Box name" });
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
/** Escape until editing ends (the first may only let go of a box Linkkit
    has selected, as in Linkkit). */
async function escapeEditing(page: Page) {
  for (let i = 0; i < 3 && (await editingId(page)); i++) await page.keyboard.press("Escape");
  await expect.poll(() => editingId(page)).toBeNull();
}
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** "+ New map", name kept; waits until it is drawn. */
async function newMap(page: Page): Promise<MapShape> {
  await page.getByTestId("tools.map").click();
  await page.getByTestId("new-map").click();
  await expect(page.getByTestId("map-name-field")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await mapShapes(page))[0]?.scale ?? 0).toBeGreaterThan(0);
  return (await mapShapes(page))[0];
}

async function startEditing(page: Page, shapeId: string) {
  // Drawn as a picture again first (just after editing ends it is redrawn).
  await expect(page.locator(`[id="${shapeId}"] [data-linkkit-map][data-editing="false"] [data-map-view][data-ready]`)).toBeVisible();
  const b = await box(widget(page, shapeId));
  // Clicks within tldraw's multi-click time of the last ones would count
  // as a third and fourth click, not a double-click.
  await page.waitForTimeout(500);
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await expect(editingMap(page)).toBeVisible();
  expect(await editingId(page)).toBe(shapeId);
}

/** Double-click at (x, y) on the window, then name the new box. */
async function addBox(page: Page, at: { x: number; y: number }, name: string) {
  await page.mouse.dblclick(at.x, at.y);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(field(page)).toHaveCount(0);
  await expect(boxOf(page, name)).toBeVisible();
}

/** A map being edited, with box "A" in it. */
async function mapWithA(page: Page) {
  await openWhiteboard(page);
  const made = await newMap(page);
  await startEditing(page, made.id);
  const w = await box(widget(page, made.id));
  await addBox(page, centre(w), "A");
  return made;
}

test("while editing, a double-click far outside the widget (any side of the page) adds a box there, the widget grows to it, the other boxes don't move; undo too", async ({ page }) => {
  const made = await mapWithA(page);
  const a = await box(boxOf(page, "A"));
  // Far left and up (past the map's own page corner), then far right and down.
  const spots = [
    // (Clear of the style panel, top left, which shows while it's selected.)
    { name: "Left", at: { x: 420, y: 160 } },
    { name: "Right", at: { x: 1450, y: 860 } },
  ];
  for (const { name, at } of spots) {
    await addBox(page, at, name);
    const b = await box(boxOf(page, name));
    expect(Math.abs(centre(b).x - at.x), `${name} x`).toBeLessThan(3);
    expect(Math.abs(centre(b).y - at.y), `${name} y`).toBeLessThan(3);
    expect(await editingId(page), "still editing").toBe(made.id);
    // A stayed exactly where it was.
    const a2 = await box(boxOf(page, "A"));
    expect(Math.abs(a2.x - a.x) + Math.abs(a2.y - a.y), "A didn't move").toBeLessThan(1.5);
    // The widget holds every box.
    const w = await box(page.locator(`[id="${made.id}"] [data-map-view]`));
    for (const n of ["A", name]) {
      const r = await box(boxOf(page, n));
      expect(r.x >= w.x - 1 && r.y >= w.y - 1 && r.x + r.width <= w.x + w.width + 1 && r.y + r.height <= w.y + w.height + 1, `${n} inside the widget`).toBe(true);
    }
  }
  // Undo back past the far-left box (the one that moved everything): A stays put.
  for (let i = 0; i < 2 && (await boxOf(page, "Left").count()); i++) {
    await page.keyboard.press("Control+z");
    if (await boxOf(page, "Left").count()) await page.keyboard.press("Control+z");
  }
  await expect(boxOf(page, "Left")).toHaveCount(0);
  const a3 = await box(boxOf(page, "A"));
  expect(Math.abs(a3.x - a.x) + Math.abs(a3.y - a.y), "A didn't move on undo").toBeLessThan(1.5);
});

test("a double-click right next to a box puts the new box beside it, never over it", async ({ page }) => {
  await mapWithA(page);
  const a = await box(boxOf(page, "A"));
  // Just past A's right edge (and its connect dot there).
  await addBox(page, { x: a.x + a.width + 16, y: a.y + a.height / 2 }, "Near");
  const n = await box(boxOf(page, "Near"));
  expect(overlap(a, n)).toBe(false);
});

test("Escape, a click on another item, or one click on empty page space ends editing and adds no box; a double-click there adds one and keeps editing", async ({ page }) => {
  const made = await mapWithA(page);
  // Another item on the page, away from the map.
  const rect = await page.evaluate(() => {
    const e = (window as any).editor;
    e.createShape({ type: "geo", x: 100, y: 700, props: { w: 160, h: 100, fill: "solid" } });
    return e.getCurrentPageShapes().find((s: any) => s.type === "geo").id as string;
  });
  const rectOnScreen = await page.evaluate((id) => {
    const e = (window as any).editor;
    const b = e.getShapePageBounds(id);
    return e.pageToScreen({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  }, rect);
  const count = await boxCount(page);

  await escapeEditing(page);
  expect(await boxCount(page)).toBe(count);

  await startEditing(page, made.id);
  await page.mouse.click(rectOnScreen.x, rectOnScreen.y);
  await expect.poll(() => editingId(page)).toBeNull();
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([rect]);

  await startEditing(page, made.id);
  await page.mouse.click(1300, 300);
  // Still editing during the double-click window, then not.
  expect(await editingId(page)).toBe(made.id);
  await expect.poll(() => editingId(page), { timeout: 3000 }).toBeNull();
  expect(await boxCount(page)).toBe(count);

  await startEditing(page, made.id);
  await addBox(page, { x: 1300, y: 300 }, "Dbl");
  await page.waitForTimeout(700);
  expect(await editingId(page)).toBe(made.id);
});

test("while editing: the label at the top says so, clear of the toolbar; everything else is dimmed; the map is outlined", async ({ page }) => {
  const made = await mapWithA(page);
  await escapeEditing(page);
  await page.evaluate(() => void (window as any).editor.createShape({ type: "geo", x: 100, y: 700, props: { w: 160, h: 100, fill: "solid" } }));
  await expect(page.getByTestId("map-editing-bar")).toHaveCount(0);
  await startEditing(page, made.id);
  const bar = page.getByTestId("map-editing-bar");
  // (Linkkit names an untitled map after its first box.)
  await expect(bar).toHaveText("Editing map “A” — double-click anywhere to add a box · Esc to finish");
  const b = await box(bar);
  const tools = await box(page.locator(".gauntlet-top-toolbar .tlui-main-toolbar__tools"));
  expect(b.y, "under the toolbar").toBeGreaterThanOrEqual(tools.y + tools.height);
  const geoOpacity = await page.evaluate(() => {
    const e = (window as any).editor;
    const id = e.getCurrentPageShapes().find((s: any) => s.type === "geo").id;
    return Number(getComputedStyle(document.querySelector(`.tl-shape[data-shape-id="${id}"]`)!).opacity);
  });
  expect(geoOpacity).toBeLessThan(0.5);
  const mapOpacity = await page.evaluate((id) => Number(getComputedStyle(document.querySelector(`.tl-shape[data-shape-id="${id}"]`)!).opacity), made.id);
  expect(mapOpacity).toBe(1);
  expect(await page.locator(`[id="${made.id}"] .gm-map`).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  // Editing ends: label gone, nothing dimmed.
  await escapeEditing(page);
  await expect(bar).toHaveCount(0);
  await expect(page.locator("style", { hasText: "opacity: 0.25" })).toHaveCount(0);
});

test("the map's name sits above the widget, never on it; an empty map is small with its hint centred; a map at the page's top-left corner works the same", async ({ page }) => {
  await openWhiteboard(page);
  const made = await newMap(page);
  // Name above the map (selected, so it shows), touching nothing.
  await page.evaluate((id) => void (window as any).editor.select(id), made.id);
  const nameBox = await box(page.locator(`[id="${made.id}"] .gm-name`));
  const mapBox = await box(page.locator(`[id="${made.id}"] [data-map-view]`));
  expect(nameBox.y + nameBox.height).toBeLessThanOrEqual(mapBox.y + 0.5);

  await startEditing(page, made.id);
  const hint = page.locator(`[id="${made.id}"]`).getByText("Double-click anywhere to add a box");
  await expect(hint).toBeVisible();
  const view = await box(page.locator(`[id="${made.id}"] [data-map-view]`));
  const text = await hint.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const b = r.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  expect(Math.abs(centre(text).x - centre(view).x)).toBeLessThan(2);
  expect(Math.abs(centre(text).y - centre(view).y)).toBeLessThan(2);
  // Small: just room for the hint.
  const scale = (await mapShapes(page))[0].scale;
  expect(view.width / scale).toBeLessThan(300);
  expect(view.height / scale).toBeLessThan(80);
  const nameWhileEditing = await box(page.locator(`[id="${made.id}"] .gm-name`));
  expect(nameWhileEditing.y + nameWhileEditing.height).toBeLessThanOrEqual(view.y + 0.5);

  // To the page's top-left corner: adding round it works the same.
  await escapeEditing(page);
  await page.evaluate((id) => {
    const e = (window as any).editor;
    e.updateShape({ id, type: "linkkit-map", x: 0, y: 0 });
    e.setCamera({ x: 0, y: 0, z: 1 });
  }, made.id);
  await startEditing(page, made.id);
  const corner = await box(page.locator(`[id="${made.id}"] [data-map-view]`));
  // (Below the style panel, which shows at the top left while it's selected.)
  const spots = { Below: { x: corner.x + 300, y: 420 }, Beside: { x: corner.x + corner.width + 300, y: corner.y + 60 } };
  for (const [name, at] of Object.entries(spots)) {
    await addBox(page, at, name);
    const r = await box(boxOf(page, name));
    expect(Math.abs(centre(r).x - at.x), name).toBeLessThan(3);
    expect(Math.abs(centre(r).y - at.y), name).toBeLessThan(3);
  }

  expect(await editingId(page)).toBe(made.id);
});

/** Rendered elements under `root` drawing a dot pattern (a radial-gradient background). */
const dotPatterns = (page: Page, root: string) =>
  page.evaluate((root) => {
    let n = 0;
    for (const scope of document.querySelectorAll(root))
      for (const el of [scope, ...scope.querySelectorAll("*")]) {
        if ((el as HTMLElement).getClientRects().length === 0) continue;
        if (getComputedStyle(el).backgroundImage.includes("radial-gradient")) n++;
      }
    return n;
  }, root);

test("no dot grid behind maps: on the whiteboard (shown and edited) and in /linkkit (hand-test round item 6)", async ({ page }) => {
  const made = await mapWithA(page);
  expect(await dotPatterns(page, `[id="${made.id}"]`), "edited").toBe(0);
  await escapeEditing(page);
  await expect(page.locator(`[id="${made.id}"] [data-linkkit-map][data-editing="false"] [data-map-view][data-ready]`)).toBeVisible();
  expect(await dotPatterns(page, `[id="${made.id}"]`), "shown").toBe(0);
  await page.goto("/linkkit/");
  await expect(page.locator("[data-map-view][data-ready]")).toBeVisible();
  expect(await dotPatterns(page, "body"), "/linkkit").toBe(0);
});
