import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { seedBoard } from "./helpers";

/**
 * Picking an existing board in the Board picker places it as "+ New board"
 * does: in the middle of the VIEW, kept inside the page from the first
 * frame (no jump), selected. Fresh, empty browser profile per test; the
 * view is moved with the mouse, `window.editor` is only read to check.
 */

type Box = { x: number; y: number; w: number; h: number };
type Shape = Box & { id: string; boardId: string; scale: number };

const shapes = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "boardkit-board")
      .map((s: any) => ({ id: s.id, x: s.x, y: s.y, ...s.props })),
  ) as Promise<Shape[]>;

/** The view and the page, in page units. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).editor;
    const v = e.getViewportPageBounds();
    return { view: { x: v.x, y: v.y, w: v.w, h: v.h }, page: e.getCameraOptions().constraints.bounds as Box };
  });

const selected = (page: Page) => page.evaluate(() => (window as any).editor.getSelectedShapeIds() as string[]);

/** Boardkit's first-visit board cut down to its first list's first three cards,
    so it fits in a zoomed-in view: its id. */
async function smallBoard(context: BrowserContext): Promise<string> {
  const id = await seedBoard(context);
  const bk = await context.newPage();
  await bk.goto("/");
  await bk.evaluate((id) => {
    const key = `boardkit:board:${id}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    const b = rec.board;
    const [l1, ...others] = b.listOrder;
    const keep = b.cardOrder[l1].slice(0, 3);
    for (const l of others) {
      for (const c of b.cardOrder[l]) delete b.cards[c];
      delete b.cardOrder[l];
      delete b.lists[l];
    }
    for (const c of b.cardOrder[l1].slice(3)) delete b.cards[c];
    b.listOrder = [l1];
    // Wider than a new widget's first box (320), as the corner test needs.
    b.lists[l1].width = 360;
    b.cardOrder[l1] = keep;
    rec.rev += 1;
    localStorage.setItem(key, JSON.stringify(rec));
  }, id);
  await bk.close();
  return id;
}

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Zooms in with Ctrl+wheel around a point on screen. */
async function zoomInAt(page: Page, x: number, y: number, ticks: number) {
  await page.mouse.move(x, y);
  await page.keyboard.down("Control");
  for (let i = 0; i < ticks; i++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(30);
  }
  await page.keyboard.up("Control");
}

/** Notes every board widget's box at every change from now on (read with
    `track`), as it happens: store listeners are batched per frame, so
    side-effect handlers, which see each change, even within one frame. */
const startTracking = (page: Page) =>
  page.evaluate(() => {
    const w = window as any;
    w.__boards = [];
    const note = (s: any) => {
      if (s.type === "boardkit-board") w.__boards.push({ id: s.id, x: s.x, y: s.y, w: s.props.w, h: s.props.h, scale: s.props.scale });
    };
    w.editor.sideEffects.registerAfterCreateHandler("shape", note);
    w.editor.sideEffects.registerAfterChangeHandler("shape", (_prev: any, next: any) => note(next));
  });
const track = (page: Page, id: string) =>
  page.evaluate((id) => (window as any).__boards.filter((b: any) => b.id === id), id) as Promise<(Box & { scale: number })[]>;

/** Waits until a new board widget is drawn (its size measured). Its shape. */
async function drawn(page: Page, before: string[]): Promise<Shape> {
  let made: Shape | undefined;
  await expect
    .poll(async () => {
      made = (await shapes(page)).find((s) => !before.includes(s.id));
      return made?.scale ?? 0;
    })
    .toBeGreaterThan(0);
  return made!;
}

/** Board button -> the board `boardId` in the list. Its shape, once drawn. */
async function pickBoard(page: Page, boardId: string): Promise<Shape> {
  const before = (await shapes(page)).map((s) => s.id);
  await page.getByTestId("tools.board").click();
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  await expect(page.getByTestId("board-picker")).toHaveCount(0);
  return drawn(page, before);
}

/** Board button -> "+ New board". Its shape, once drawn. */
async function newBoard(page: Page): Promise<Shape> {
  const before = (await shapes(page)).map((s) => s.id);
  await page.getByTestId("tools.board").click();
  await page.getByTestId("new-board").click({ timeout: 10_000 });
  await expect(page.getByTestId("board-picker")).toHaveCount(0);
  return drawn(page, before);
}

/** A window smaller than the page (1920 x 1080). */
const SMALL = { width: 1600, height: 1000 };

/** Waits until the board has not moved for a while (keepInside has had its
    chance), then returns. */
async function settled(page: Page, s: Shape) {
  let last = "";
  for (let i = 0; i < 4; i++) {
    const now = JSON.stringify((await shapes(page)).find((x) => x.id === s.id));
    if (now === last) return;
    last = now;
    await page.waitForTimeout(300);
  }
}

const inside = (b: Box, outer: Box, what: string) => {
  expect(b.x, `${what}: left`).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(b.y, `${what}: top`).toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(b.x + b.w, `${what}: right`).toBeLessThanOrEqual(outer.x + outer.w + 0.5);
  expect(b.y + b.h, `${what}: bottom`).toBeLessThanOrEqual(outer.y + outer.h + 0.5);
};

test("a window smaller than the page, the view away from its middle: the picked board lands fully in view, selected", async ({ page, context }) => {
  const id = await smallBoard(context);
  await page.setViewportSize(SMALL);
  await openWhiteboard(page);
  await zoomInAt(page, 2, 2, 8);
  const { view, page: sheet } = await geometry(page);
  // The window shows less than half the page, and not the page's middle.
  expect(view.w).toBeLessThan(sheet.w / 2);
  const mid = { x: sheet.x + sheet.w / 2, y: sheet.y + sheet.h / 2 };
  expect(mid.x > view.x + view.w && mid.y > view.y + view.h).toBe(true);

  const s = await pickBoard(page, id);
  inside(s, view, "board in the view");
  expect(s.x + s.w / 2).toBeCloseTo(view.x + view.w / 2, 0);
  expect(s.y + s.h / 2).toBeCloseTo(view.y + view.h / 2, 0);
  expect(await selected(page)).toEqual([s.id]);
  // And on screen.
  await expect(page.locator(".tl-html-container [data-boardkit-board]").first()).toBeInViewport({ ratio: 0.999 });
});

test("the view at the page's corner: the picked board is in the view and the page from its first frame, no jump", async ({ page, context }) => {
  const id = await smallBoard(context);
  await page.setViewportSize(SMALL);
  await openWhiteboard(page);
  await zoomInAt(page, SMALL.width - 2, SMALL.height - 2, 8);
  const { view, page: sheet } = await geometry(page);
  expect(view.w).toBeLessThan(sheet.w / 2);
  // The view touches the page's right and bottom edges.
  expect(view.x + view.w).toBeGreaterThan(sheet.x + sheet.w - 5);
  expect(view.y + view.h).toBeGreaterThan(sheet.y + sheet.h - 5);

  await startTracking(page);
  const s = await pickBoard(page, id);
  await settled(page, s);
  // Every box it had, from the first, is inside the page and the view.
  const boxes = await track(page, s.id);
  expect(boxes.length).toBeGreaterThan(0);
  for (const [i, b] of boxes.entries()) {
    inside(b, sheet, `box ${i} in the page`);
    inside(b, view, `box ${i} in the view`);
  }
  expect(await selected(page)).toEqual([s.id]);
});

test("zoomed in at the page's corner past the board's size: the picked board is pulled inside the page at once, at the corner, no jump", async ({ page, context }) => {
  const id = await smallBoard(context);
  await page.setViewportSize(SMALL);
  await openWhiteboard(page);
  await zoomInAt(page, SMALL.width - 2, SMALL.height - 2, 20);
  const { view, page: sheet } = await geometry(page);

  await startTracking(page);
  const s = await pickBoard(page, id);
  // Centred on the view it would cross the page's right and bottom edges.
  expect(view.x + view.w / 2 + s.w / 2).toBeGreaterThan(sheet.x + sheet.w + 20);
  expect(view.y + view.h / 2 + s.h / 2).toBeGreaterThan(sheet.y + sheet.h + 20);
  await settled(page, s);
  // Inside the page from its first box (put there, not pulled in a moment
  // later), against its bottom-right corner, where the view is.
  const boxes = await track(page, s.id);
  expect(boxes.length).toBeGreaterThan(0);
  for (const [i, b] of boxes.entries()) inside(b, sheet, `box ${i} in the page`);
  const last = boxes.at(-1)!;
  expect(last.x + last.w).toBeCloseTo(sheet.x + sheet.w, 0);
  expect(last.y + last.h).toBeCloseTo(sheet.y + sheet.h, 0);
  expect(await selected(page)).toEqual([s.id]);
});

test("a full-size window: an existing board and a new board picked from the same view land in the same spot", async ({ page, context }) => {
  const id = await smallBoard(context);
  await openWhiteboard(page);
  // Zoomed in off-centre, so the middle of the view isn't the page's.
  await zoomInAt(page, 300, 250, 4);
  const { view, page: sheet } = await geometry(page);
  expect(Math.abs(view.x + view.w / 2 - (sheet.x + sheet.w / 2))).toBeGreaterThan(100);

  await startTracking(page);
  const a = await pickBoard(page, id);
  await page.keyboard.press("Escape"); // deselect, so the view stays as it is
  const b = await newBoard(page);
  await page.keyboard.press("Escape"); // leaves the name field: Untitled
  expect((await geometry(page)).view).toEqual(view);

  // Put down at the same spot, then each grows from its middle (they differ in size).
  const [firstA] = await track(page, a.id);
  const [firstB] = await track(page, b.id);
  expect(firstA.x).toBeCloseTo(firstB.x, 1);
  expect(firstA.y).toBeCloseTo(firstB.y, 1);
  expect(a.x + a.w / 2).toBeCloseTo(b.x + b.w / 2, 0);
  expect(a.y + a.h / 2).toBeCloseTo(b.y + b.h / 2, 0);
  expect(a.x + a.w / 2).toBeCloseTo(view.x + view.w / 2, 0);
  expect(a.y + a.h / 2).toBeCloseTo(view.y + view.h / 2, 0);
});
