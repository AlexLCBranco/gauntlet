import { expect, test, type Page } from "./test";

import { whiteboardSaved } from "./helpers";

/**
 * Markup (owner, toolbar rework step 4; replaces the laser pointer):
 * red marks that stay until cleared, never saved, gone on leaving the page
 * or a reload; while it's on, Arrow and Line draw red markup arrows and
 * lines; "Clear markup" and "Keep marks" while there are marks.
 */

test.use({ viewport: { width: 1400, height: 900 } });

type Pt = { x: number; y: number };

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) =>
  page.evaluate(([src, a]) => new Function("e", "a", `return (${src})(e, a)`)((window as any).editor, a), [fn.toString(), arg] as const) as Promise<T>;

async function drag(page: Page, from: Pt, to: Pt) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10 + (i % 2 ? 6 : 0));
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
}
/** A straight drag (for markup lines and arrows). */
async function line(page: Page, from: Pt, to: Pt) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  await page.mouse.up();
}

const marks = (page: Page) => page.locator('[data-testid="markup-layer"] [data-mark]');
/** The whole drawing as tldraw would save it. */
const doc = (page: Page) => ed(page, (e) => JSON.stringify(e.store.serialize("document")));
const shapeTypes = (page: Page) => ed(page, (e) => e.getCurrentPageShapes().map((s: any) => `${s.type}:${s.props.color}`).sort());

test("K draws red marks that stay; Arrow and Line draw red markup while it's on (straightened too); nothing is saved", async ({ page }) => {
  await open(page);
  await whiteboardSaved(page);
  const before = await doc(page);
  await page.keyboard.press("k");
  expect(await ed(page, (e) => e.getCurrentToolId())).toBe("markup");
  await drag(page, { x: 300, y: 300 }, { x: 600, y: 420 });
  await expect(marks(page)).toHaveCount(1);
  await expect(marks(page).first()).toHaveAttribute("data-mark", "pen");
  await expect(page.locator('[data-testid="markup-layer"] g')).toHaveAttribute("stroke", "#e03131");
  // A: a markup arrow (Markup and Arrow both lit), 2° off level comes out level.
  await page.keyboard.press("a");
  expect(await ed(page, (e) => e.getCurrentToolId())).toBe("markup");
  await expect(page.getByTestId("tools.arrow")).toHaveAttribute("aria-pressed", "true");
  const from = { x: 300, y: 600 };
  await line(page, from, { x: from.x + 300 * Math.cos(Math.PI / 90), y: from.y + 300 * Math.sin(Math.PI / 90) });
  const arrow = page.locator('[data-mark="arrow"]');
  await expect(arrow).toHaveCount(1);
  expect(await arrow.getAttribute("y2")).toBe(await arrow.getAttribute("y1"));
  // L: a markup line.
  await page.keyboard.press("l");
  await line(page, { x: 800, y: 300 }, { x: 805, y: 600 });
  const l = page.locator('[data-mark="line"]');
  await expect(l).toHaveCount(1);
  expect(await l.getAttribute("x2")).toBe(await l.getAttribute("x1"));
  // Three marks, no shape at all, nothing changed in the saved drawing.
  await expect(marks(page)).toHaveCount(3);
  expect(await shapeTypes(page)).toEqual([]);
  await page.waitForTimeout(600);
  await whiteboardSaved(page);
  expect(await doc(page)).toBe(before);
  // Another tool leaves Markup; the marks stay on screen, and R draws a real rectangle.
  await page.keyboard.press("r");
  await drag(page, { x: 1000, y: 300 }, { x: 1150, y: 400 });
  await page.keyboard.press("Escape");
  expect(await shapeTypes(page)).toEqual(["geo:black"]);
  await expect(marks(page)).toHaveCount(3);
});

test("\"Clear markup\" shows while there are marks and clears them; marks are gone after a page change and after a reload", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("markup-bar")).toHaveCount(0);
  await page.keyboard.press("k");
  await drag(page, { x: 300, y: 300 }, { x: 600, y: 420 });
  await expect(page.getByTestId("markup-bar")).toBeVisible();
  await page.getByTestId("markup-clear").click();
  await expect(marks(page)).toHaveCount(0);
  await expect(page.getByTestId("markup-bar")).toHaveCount(0);
  // A page change.
  await page.keyboard.press("k");
  await drag(page, { x: 300, y: 300 }, { x: 600, y: 420 });
  await expect(marks(page)).toHaveCount(1);
  await page.keyboard.press("v");
  await page.getByRole("button", { name: /next page/i }).click();
  await expect.poll(() => ed(page, (e) => e.getPages().length)).toBe(2);
  await expect(marks(page)).toHaveCount(0);
  await page.getByRole("button", { name: /previous page/i }).click();
  await expect(marks(page)).toHaveCount(0);
  // A reload.
  await page.keyboard.press("k");
  await drag(page, { x: 300, y: 300 }, { x: 600, y: 420 });
  await expect(marks(page)).toHaveCount(1);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
  await expect(page.getByTestId("markup-layer")).toHaveCount(0);
  await expect(page.getByTestId("markup-bar")).toHaveCount(0);
});

test("\"Keep marks\" turns them into red drawings that are saved and survive a reload; one undo takes them back", async ({ page }) => {
  await open(page);
  await page.keyboard.press("k");
  await drag(page, { x: 300, y: 300 }, { x: 600, y: 420 });
  await page.keyboard.press("a");
  await line(page, { x: 300, y: 600 }, { x: 600, y: 600 });
  await page.keyboard.press("l");
  await line(page, { x: 800, y: 300 }, { x: 800, y: 600 });
  await expect(marks(page)).toHaveCount(3);
  await page.getByTestId("markup-keep").click();
  await expect(marks(page)).toHaveCount(0);
  await expect(page.getByTestId("markup-bar")).toHaveCount(0);
  expect(await shapeTypes(page)).toEqual(["arrow:red", "draw:red", "line:red"]);
  // Where they were drawn: the arrow from (300, 600) to (600, 600) on screen.
  const arrow = await ed(page, (e) => {
    const s = e.getCurrentPageShapes().find((s: any) => s.type === "arrow");
    const t = e.getShapePageTransform(s.id);
    return [t.applyToPoint(s.props.start), t.applyToPoint(s.props.end)].map((p: any) => e.pageToScreen(p)).map((p: any) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  });
  expect(arrow).toEqual([
    { x: 300, y: 600 },
    { x: 600, y: 600 },
  ]);
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
  expect(await shapeTypes(page)).toEqual(["arrow:red", "draw:red", "line:red"]);
  // One undo for all three (in the same session as the keep).
  await page.keyboard.press("k");
  await drag(page, { x: 300, y: 300 }, { x: 500, y: 350 });
  await page.getByTestId("markup-keep").click();
  expect((await shapeTypes(page)).length).toBe(4);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await shapeTypes(page)).length).toBe(3);
});
