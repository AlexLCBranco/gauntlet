import { expect, test, type Page } from "./test";

import { seedBoard, seedMap, openBoardList, openMapList } from "./helpers";

/**
 * Resize from the edge without selecting first, as in Excalidraw
 * (hand-test round item 3, owner 2026-10-21): over an edge or corner of an
 * unselected item the matching resize cursor shows at once, and one
 * press-and-drag there selects and resizes it. In the middle, nothing
 * changes. Rectangle, board, map and picture. Fresh browser profile.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

type Pt = { x: number; y: number };
const HANDLES = {
  top_left: [0, 0, "nwse-resize"],
  top: [0.5, 0, "ns-resize"],
  top_right: [1, 0, "nesw-resize"],
  right: [1, 0.5, "ew-resize"],
  bottom_right: [1, 1, "nwse-resize"],
  bottom: [0.5, 1, "ns-resize"],
  bottom_left: [0, 1, "nesw-resize"],
  left: [0, 0.5, "ew-resize"],
} as const;

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}
const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) => page.evaluate(({ src, arg }) => { const e = (window as any).editor; const r = new Function("e", "a", `return (${src})(e, a)`)(e, arg); return r === e ? undefined : r; }, { src: fn.toString(), arg }) as Promise<T>;

/** The item's box on screen. */
const screenBox = (page: Page, id: string) =>
  ed(page, (e, id: string) => {
    const b = e.getShapePageBounds(id);
    const a = e.pageToScreen({ x: b.x, y: b.y });
    const c = e.pageToScreen({ x: b.maxX, y: b.maxY });
    return { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y };
  }, id);

/** The cursor tldraw shows, and whether the page really shows it under
    the pointer (nothing there sets a cursor of its own). */
const cursorAt = (page: Page, p: Pt) =>
  page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null;
    const canvas = document.querySelector(".tl-canvas") as HTMLElement;
    const container = (window as any).editor.getContainer() as HTMLElement;
    return {
      type: container.dataset.edgeCursor ?? (window as any).editor.getInstanceState().cursor.type,
      shown: !!el && getComputedStyle(el).cursor === getComputedStyle(canvas).cursor && getComputedStyle(canvas).cursor !== getComputedStyle(container).getPropertyValue("--tl-cursor-default"),
    };
  }, p);

/** A point on handle `h` of box `b`, `out` px outside the edge (negative: inside). */
function on(b: { x: number; y: number; w: number; h: number }, h: keyof typeof HANDLES, out: number): Pt {
  const [fx, fy] = HANDLES[h];
  const dx = fx === 0 ? -out : fx === 1 ? out : 0;
  const dy = fy === 0 ? -out : fy === 1 ? out : 0;
  return { x: b.x + b.w * fx + dx, y: b.y + b.h * fy + dy };
}

async function checkItem(page: Page, id: string) {
  await ed(page, (e) => e.selectNone());
  const b = await screenBox(page, id);
  for (const out of [2, -2]) {
    for (const h of Object.keys(HANDLES) as (keyof typeof HANDLES)[]) {
      const p = on(b, h, out);
      await page.mouse.move(p.x, p.y, { steps: 2 });
      await expect.poll(async () => (await cursorAt(page, p)).type, { message: `${h}, ${out} px out` }).toBe(HANDLES[h][2]);
      expect((await cursorAt(page, p)).shown, `${h}: the page shows it`).toBe(true);
      expect(await ed(page, (e) => e.getSelectedShapeIds().length), "hovering selects nothing").toBe(0);
    }
  }
  // The middle: no resize cursor; the move cursor (movecursor.e2e.ts).
  const mid = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  await page.mouse.move(mid.x, mid.y, { steps: 3 });
  await expect.poll(async () => (await cursorAt(page, mid)).type).toBe("move");

  // One drag from the bottom-right corner, no click first: selected and bigger.
  const start = on(b, "bottom_right", 1);
  await page.mouse.move(start.x, start.y, { steps: 2 });
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(start.x + 10 * i, start.y + 6 * i);
  await page.mouse.up();
  expect(await ed(page, (e) => e.getSelectedShapeIds())).toEqual([id]);
  const after = await screenBox(page, id);
  expect(after.w).toBeGreaterThan(b.w + 20);
  expect(after.x).toBeCloseTo(b.x, 0);
  expect(after.y).toBeCloseTo(b.y, 0);
  await ed(page, (e) => e.selectNone());
}

test("rectangle: resize cursor on every side and corner without selecting, one drag from a corner resizes it", async ({ page }) => {
  await open(page);
  const id = await ed(page, (e) => {
    e.createShape({ type: "geo", x: 500, y: 300, props: { w: 240, h: 160, fill: "solid" } });
    return e.getCurrentPageShapes()[0].id as string;
  });
  await checkItem(page, id);
});

test("picture: the same", async ({ page }) => {
  await open(page);
  const id = await ed(page, (e) => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const assetId = "asset:hoverpic";
    e.createAssets([{ id: assetId, type: "image", typeName: "asset", props: { name: "p.png", src: png, w: 240, h: 160, mimeType: "image/png", isAnimated: false }, meta: {} }]);
    e.createShape({ type: "image", x: 500, y: 300, props: { assetId, w: 240, h: 160 } });
    return e.getCurrentPageShapes()[0].id as string;
  });
  await checkItem(page, id);
});

test("board widget: the same", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await open(page);
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  await expect(page.locator(".tl-html-container [data-boardkit-board]").first()).toBeVisible();
  await expect.poll(() => ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board")?.props.scale ?? 0)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  const id = await ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board").id as string);
  await checkItem(page, id);
});

test("map widget: the same", async ({ page, context }) => {
  const mapId = await seedMap(context, "Edge test");
  await open(page);
  await openMapList(page);
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  await expect(page.locator("[data-map-view][data-ready]").first()).toBeVisible();
  await page.keyboard.press("Escape");
  const id = await ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "linkkit-map").id as string);
  await checkItem(page, id);
});
