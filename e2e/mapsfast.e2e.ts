import { mkdirSync } from "node:fs";

import { expect, test, type Locator, type Page } from "./test";

import { box } from "./helpers";

/**
 * Making a map fast, on the whiteboard (Linkkit's speed round wired in,
 * owner 2026-11-13): a new map goes straight to typing, a double-click on
 * an empty map adds its first box, a box's dot dropped on bare whiteboard
 * adds a linked box, and Linkkit's +, Enter chain, border-drag arrows and
 * list paste work in a map being edited. Fresh browser profile per test;
 * every map is made here.
 *
 * Each test leaves a 1400 x 900 screenshot of what it checks in
 * screenshots/maps-round/<item>-<SHOT>.png (SHOT=before on the code before
 * the fix; "after" otherwise).
 */

const SHOTS = "screenshots/maps-round";
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, item: string) => page.screenshot({ path: `${SHOTS}/${item}-${process.env.SHOT ?? "after"}.png` });

test.use({ viewport: { width: 1400, height: 900 } });

type MapShape = { id: string; x: number; y: number; mapId: string; w: number; h: number; scale: number };
type Rect = { x: number; y: number; width: number; height: number };

const mapShapes = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "linkkit-map")
      .map((s: any) => ({ id: s.id, x: s.x, y: s.y, ...s.props })),
  ) as Promise<MapShape[]>;
/** Every whiteboard item that isn't a map widget (a text shape a paste made, say). */
const otherShapes = (page: Page) => page.evaluate(() => (window as any).editor.getCurrentPageShapes().filter((s: any) => s.type !== "linkkit-map").map((s: any) => s.type as string));
const editingId = (page: Page) => page.evaluate(() => (window as any).editor.getEditingShapeId() as string | null);
const toolId = (page: Page) => page.evaluate(() => (window as any).editor.getCurrentToolId() as string);
const widget = (page: Page, shapeId: string) => page.locator(`[id="${shapeId}"] [data-linkkit-map]`);
const boxes = (page: Page) => page.locator("[data-linkkit-map] [data-box-id]");
const boxOf = (page: Page, name: string) => boxes(page).filter({ hasText: new RegExp(`^${name}$`) });
const arrows = (page: Page) => page.locator("[data-linkkit-map] .react-flow__edge");
const field = (page: Page) => page.getByRole("textbox", { name: "Box name" });
const dot = (b: Locator) => b.locator("[title='Drag to another box to connect']");
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const storedName = (page: Page, mapId: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem("linkkit:registry") ?? '{"maps":[]}') as { maps: { id: string; name: string }[] }).maps.find((m) => m.id === id)?.name ?? null, mapId);

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Map button, `name` typed, Enter. The new widget's shape. */
async function newMap(page: Page, name: string): Promise<MapShape> {
  await page.getByTestId("tools.map").click();
  await expect(page.getByTestId("map-name-field")).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await mapShapes(page))[0]?.scale ?? 0).toBeGreaterThan(0);
  return (await mapShapes(page))[0];
}

/** Escape until editing ends. */
async function escapeEditing(page: Page) {
  for (let i = 0; i < 4 && (await editingId(page)); i++) await page.keyboard.press("Escape");
  await expect.poll(() => editingId(page)).toBeNull();
}

/** A new plain map being edited, its first box named "A" (item 2's flow). */
async function mapWithA(page: Page): Promise<MapShape> {
  await openWhiteboard(page);
  const made = await newMap(page, "Plan");
  // (Before item 2: no box opens; editing starts with a double-click on the
  // widget and a second one adds the box. Kept so items 3-4 can be run
  // on that code for their "before" pictures.)
  const opened = await field(page)
    .waitFor({ timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    await expect(page.locator(`[id="${made.id}"] [data-linkkit-map][data-editing="false"] [data-map-view][data-ready]`)).toBeVisible();
    const w = centre(await box(widget(page, made.id)));
    await page.waitForTimeout(600);
    await page.mouse.dblclick(w.x, w.y);
    await expect.poll(() => editingId(page)).toBe(made.id);
    await page.waitForTimeout(600);
    await page.mouse.dblclick(w.x, w.y);
  }
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("A");
  await page.keyboard.press("Enter");
  await expect(field(page)).toHaveCount(0);
  await expect(boxOf(page, "A")).toBeVisible();
  expect(await editingId(page)).toBe(made.id);
  return made;
}

/** Drags from `from` to `to` (window px) in a few steps. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

// ---- Item 2: a new map goes straight to typing --------------------------------

test("item 2: after the new map's name and Enter, the map is being edited with its first box's name open; the keys typed go into it", async ({ page }) => {
  await openWhiteboard(page);
  const made = await newMap(page, "Groceries");
  await page.waitForTimeout(600);
  await shot(page, "2a-new-map-enter");
  await expect.poll(() => editingId(page)).toBe(made.id);
  await expect(field(page)).toBeFocused();
  // Letters that are whiteboard tool keys (r, t, d, e...): typed, not tools.
  await page.keyboard.type("Bread rolls");
  await expect(field(page)).toHaveValue("Bread rolls");
  await page.keyboard.press("Enter");
  await expect(boxOf(page, "Bread rolls")).toBeVisible();
  expect(await editingId(page)).toBe(made.id);
  expect(await toolId(page)).toBe("select");
  expect(await otherShapes(page)).toEqual([]);
  // The map keeps the name typed for it.
  await expect.poll(() => storedName(page, made.mapId)).toBe("Groceries");
});

test("item 2: Escape on the new map's blank first box leaves an empty map; a double-click on it (not being edited) starts editing AND adds the box there, name open, in that one gesture", async ({ page }) => {
  await openWhiteboard(page);
  const made = await newMap(page, "Empty one");
  await expect.poll(() => editingId(page)).toBe(made.id);
  await escapeEditing(page);
  await expect(boxes(page)).toHaveCount(0);
  await expect(page.locator(`[id="${made.id}"] [data-linkkit-map][data-editing="false"] [data-map-view][data-ready]`)).toBeVisible();
  const w = await box(widget(page, made.id));
  const at = centre(w);
  // Clear of tldraw's multi-click time since the last clicks.
  await page.waitForTimeout(600);
  await page.mouse.dblclick(at.x, at.y);
  await page.waitForTimeout(600);
  await shot(page, "2b-empty-map-dblclick");
  await expect.poll(() => editingId(page)).toBe(made.id);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("First");
  await page.keyboard.press("Enter");
  await expect(boxOf(page, "First")).toBeVisible();
  await expect(boxes(page)).toHaveCount(1);
  // Where it was double-clicked (the widget grows round it).
  const b = centre(await box(boxOf(page, "First")));
  expect(Math.abs(b.x - at.x), "x").toBeLessThan(40);
  expect(Math.abs(b.y - at.y), "y").toBeLessThan(40);
  expect(await otherShapes(page)).toEqual([]);
});

// ---- Item 3: a dot dropped on bare whiteboard ---------------------------------

test("item 3: in a plain map being edited, a box's dot dropped on bare whiteboard adds a linked box there, name open; editing goes on and keys go into the name", async ({ page }) => {
  const made = await mapWithA(page);
  const a = boxOf(page, "A");
  await a.hover();
  const d = await box(dot(a));
  // Far outside the widget, on bare page.
  const to = { x: 1050, y: 640 };
  await drag(page, centre(d), to);
  await page.waitForTimeout(400);
  await shot(page, "3-dot-on-bare-page");
  expect(await editingId(page), "still editing").toBe(made.id);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("Rest");
  await expect(field(page)).toHaveValue("Rest");
  await page.keyboard.press("Enter");
  // Enter goes on with the chain (a blank box beside it): Escape stops it.
  if (await field(page).count()) await page.keyboard.press("Escape");
  await expect(field(page)).toHaveCount(0);
  await expect(boxOf(page, "Rest")).toBeVisible();
  await expect(boxes(page)).toHaveCount(2);
  await expect(arrows(page)).toHaveCount(1);
  const r = centre(await box(boxOf(page, "Rest")));
  expect(Math.abs(r.x - to.x), "x").toBeLessThan(12);
  expect(Math.abs(r.y - to.y), "y").toBeLessThan(12);
  expect(await editingId(page)).toBe(made.id);
  expect(await toolId(page)).toBe("select");
  expect(await otherShapes(page)).toEqual([]);
});

// ---- Item 4: Linkkit's speed-round gestures inside a map being edited -----------

test("item 4: in a map being edited, a box's + adds a linked box with its name open, and Enter keeps the chain going", async ({ page }) => {
  const made = await mapWithA(page);
  const a = boxOf(page, "A");
  await a.hover();
  await a.getByRole("button", { name: "Add a linked box" }).click();
  for (const name of ["One", "Two"]) {
    await expect(field(page)).toBeFocused();
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");
  }
  await expect(field(page)).toBeFocused();
  await shot(page, "4a-plus-and-enter-chain");
  // The blank third goes with Escape; editing goes on.
  await page.keyboard.press("Escape");
  await expect(field(page)).toHaveCount(0);
  await expect(boxes(page)).toHaveCount(3);
  await expect(arrows(page)).toHaveCount(2);
  for (const n of ["One", "Two"]) await expect(boxOf(page, n)).toBeVisible();
  expect(await editingId(page)).toBe(made.id);
  expect(await otherShapes(page)).toEqual([]);
});

test("item 4: in a map being edited, a drag from a box's border band to another box draws an arrow (the box and the widget stay put)", async ({ page }) => {
  const made = await mapWithA(page);
  // A second box, double-clicked onto bare page.
  await page.mouse.dblclick(1000, 450);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("B");
  await page.keyboard.press("Enter");
  await expect(boxOf(page, "B")).toBeVisible();
  const a = await box(boxOf(page, "A"));
  const b = centre(await box(boxOf(page, "B")));
  const shapeBefore = (await mapShapes(page))[0];
  await page.mouse.move(a.x + 3, a.y + a.height / 2);
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await shot(page, "4b-border-drag-arrow");
  await page.mouse.up();
  await expect(arrows(page)).toHaveCount(1);
  const a2 = await box(boxOf(page, "A"));
  expect(Math.abs(a2.x - a.x) + Math.abs(a2.y - a.y), "A didn't move").toBeLessThan(1.5);
  const shapeAfter = (await mapShapes(page))[0];
  expect(Math.abs(shapeAfter.x - shapeBefore.x) + Math.abs(shapeAfter.y - shapeBefore.y), "the widget didn't move").toBeLessThan(1.5);
  expect(await editingId(page)).toBe(made.id);
});

/**
 * Ctrl+V with `text` on the clipboard, as the browser does it, without
 * touching the PC's real clipboard: the key down on the focused element
 * (Linkkit's own copied boxes take it), then, if the key was left alone,
 * the paste event with the text there. Says which took it.
 */
const pasteText = (page: Page, text: string) =>
  page.evaluate((t) => {
    const target = document.activeElement ?? document.body;
    const key = new KeyboardEvent("keydown", { key: "v", code: "KeyV", ctrlKey: true, bubbles: true, cancelable: true });
    target.dispatchEvent(key);
    if (key.defaultPrevented) return "key";
    const data = new DataTransfer();
    data.setData("text/plain", t);
    const paste = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    target.dispatchEvent(paste);
    return paste.defaultPrevented ? "taken" : "none";
  }, text);

test("item 4: Ctrl+V of a text list while a map is edited goes to the map (one box per line, under the selected box), never a whiteboard text shape", async ({ page }) => {
  const made = await mapWithA(page);
  const a = boxOf(page, "A");
  await a.click();
  await expect(a).toHaveAttribute("data-highlight", "selected");
  expect(await pasteText(page, "Milk\nEggs\nFlour")).toBe("taken");
  await expect(boxes(page)).toHaveCount(4);
  await expect(arrows(page)).toHaveCount(3);
  for (const n of ["Milk", "Eggs", "Flour"]) await expect(boxOf(page, n)).toBeVisible();
  // Laid out clear of each other once they settle (Linkkit's layout).
  const apart = async () => {
    const r = await Promise.all(["A", "Milk", "Eggs", "Flour"].map(async (n) => box(boxOf(page, n))));
    return r.every((p, i) => r.every((q, j) => i === j || p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y));
  };
  await expect.poll(apart, { message: "the pasted boxes overlap nothing" }).toBe(true);
  await shot(page, "4c-list-paste");
  expect(await otherShapes(page), "no whiteboard shape made").toEqual([]);
  expect(await editingId(page)).toBe(made.id);

  // Nothing selected: the lines are boxes of their own, still in the map.
  await page.keyboard.press("Escape");
  await expect(a).not.toHaveAttribute("data-highlight", "selected");
  expect(await editingId(page)).toBe(made.id);
  expect(await pasteText(page, "Red\nGreen")).toBe("taken");
  await expect(boxes(page)).toHaveCount(6);
  expect(await otherShapes(page)).toEqual([]);
});
