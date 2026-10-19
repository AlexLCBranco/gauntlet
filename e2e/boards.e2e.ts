import { expect, test, type Page } from "@playwright/test";

import { box, seedBoard } from "./helpers";

/**
 * Boardkit boards on the whiteboard (whiteboard phase 2). Fresh, empty
 * browser profile per test; the board is the real Boardkit's first-visit
 * board, made by opening /boardkit. Every action goes through the mouse
 * and keyboard; `window.editor` and localStorage are only read to check.
 */

type Rec = {
  rev: number;
  board: {
    lists: Record<string, { title: string }>;
    cards: Record<string, { title: string }>;
    listOrder: string[];
    cardOrder: Record<string, string[]>;
    trash: { cardId: string }[];
  };
};

const record = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), id) as Promise<Rec>;
const boardName = (page: Page, id: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem("boardkit:registry")!) as { boards: { id: string; name: string }[] }).boards.find((b) => b.id === id)!.name, id);

/** The shape's props and position. */
const shapeOf = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).editor.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board");
    return s ? { id: s.id as string, x: s.x as number, y: s.y as number, ...(s.props as { boardId: string; w: number; h: number; scale: number }) } : null;
  });

async function openWhiteboard(page: Page) {
  await page.goto("/whiteboard/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Puts board `id` on the page with the toolbar's Board button. */
async function placeBoard(page: Page, id: string) {
  await page.getByTestId("tools.board").click();
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  await expect(page.getByTestId("board-picker")).toHaveCount(0);
  const board = page.locator(`.gb-board[data-board-id="${id}"]`);
  await expect(board).toBeVisible();
  await expect.poll(async () => (await shapeOf(page))?.scale ?? 0).toBeGreaterThan(0);
  return board;
}

const cardEl = (page: Page, cardId: string) => page.locator(`.gb-card[data-card-id="${cardId}"]`);

async function startEditing(page: Page, cardId: string) {
  const b = await box(cardEl(page, cardId));
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator(".gb-board[data-editing]")).toHaveCount(1);
}

/** Drags with the mouse from one point to another, in steps. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  await page.mouse.up();
}

test("the Board button puts a real Boardkit board on the page, every list and card showing", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  const board = await placeBoard(page, id);
  const rec = await record(page, id);

  await expect(board.locator(".gb-name")).toHaveText(await boardName(page, id));
  await expect(board.locator(".gb-list")).toHaveCount(rec.board.listOrder.length);
  const shown = rec.board.listOrder.flatMap((l) => rec.board.cardOrder[l]);
  await expect(board.locator(".gb-card")).toHaveCount(shown.length);
  for (const cardId of shown.slice(0, 5)) await expect(cardEl(page, cardId)).toContainText(rec.board.cards[cardId].title);

  // Selected, inside the sheet, and its box is the content's size.
  const s = (await shapeOf(page))!;
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([s.id]);
  expect(s.x).toBeGreaterThanOrEqual(0);
  expect(s.y).toBeGreaterThanOrEqual(0);
  expect(s.x + s.w).toBeLessThanOrEqual(1920 + 0.5);
  expect(s.y + s.h).toBeLessThanOrEqual(1080 + 0.5);
  const onScreen = await box(board);
  const zoom = await page.evaluate(() => (window as any).editor.getZoomLevel());
  expect(onScreen.width).toBeCloseTo(s.w * zoom, 0);

  // Nothing written by just showing it.
  expect((await record(page, id)).rev).toBe(rec.rev);

  // Survives a reload (tldraw saves to IndexedDB a moment after a change).
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(page.locator(`.gb-board[data-board-id="${id}"] .gb-card`)).toHaveCount(shown.length);
});

test("a corner drag scales the whole board like a picture, and undo puts it back", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  const board = await placeBoard(page, id);
  const before = (await shapeOf(page))!;
  const firstCard = board.locator(".gb-card").first();
  const cardBefore = await box(firstCard);

  // The bottom-right corner handle, dragged up-left.
  const b = await box(board);
  await drag(page, { x: b.x + b.width, y: b.y + b.height }, { x: b.x + b.width * 0.6, y: b.y + b.height * 0.6 });
  const after = (await shapeOf(page))!;
  expect(after.scale).toBeLessThan(before.scale * 0.8);
  expect(after.w / after.h).toBeCloseTo(before.w / before.h, 2); // aspect kept
  // The content scaled with it: a card is smaller by the same factor.
  const cardAfter = await box(firstCard);
  expect(cardAfter.width / cardBefore.width).toBeCloseTo(after.scale / before.scale, 1);
  expect(after.x).toBeCloseTo(before.x, 0); // the top-left corner stayed

  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await shapeOf(page))!.scale).toBeCloseTo(before.scale, 5);
});

test("edit in place: rename, add, move and delete cards, all in Boardkit's own record; Ctrl+Z undoes", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  await placeBoard(page, id);
  const rec = await record(page, id);
  const [l1, l2] = rec.board.listOrder;
  expect(l2, "the starter board has two lists or more").toBeDefined();
  const [c1, c2] = rec.board.cardOrder[l1];

  // Double-click a card: editing starts with its title open.
  await startEditing(page, c1);
  const field = page.locator(".gb-input");
  await expect(field).toBeFocused();
  await page.keyboard.type("ZZ renamed on the whiteboard");
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  await expect(cardEl(page, c1)).toContainText("ZZ renamed on the whiteboard");
  let now = await record(page, id);
  expect(now.board.cards[c1].title).toBe("ZZ renamed on the whiteboard");
  expect(now.rev).toBe(rec.rev + 1);

  // Add two cards to the second list (Enter keeps the field open).
  await page.locator(`.gb-list[data-list-id="${l2}"] .gb-add`).click();
  await page.keyboard.type("ZZ new one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("ZZ new two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  now = await record(page, id);
  const l2Cards = now.board.cardOrder[l2];
  expect(l2Cards.slice(-2).map((c) => now.board.cards[c].title)).toEqual(["ZZ new one", "ZZ new two"]);
  const added = l2Cards.at(-1)!;
  // Still editing after Escape left the add field.
  await expect(page.locator(".gb-board[data-editing]")).toHaveCount(1);

  // Drag the first card of list 1 onto the top of list 2.
  const from = await box(cardEl(page, c1));
  const target = await box(cardEl(page, now.board.cardOrder[l2][0]));
  await drag(page, { x: from.x + 20, y: from.y + from.height / 2 }, { x: target.x + 20, y: target.y + 4 });
  now = await record(page, id);
  expect(now.board.cardOrder[l2][0]).toBe(c1);
  expect(now.board.cardOrder[l1]).not.toContain(c1);
  await expect(page.locator(`.gb-list[data-list-id="${l2}"] .gb-card`).first()).toHaveAttribute("data-card-id", c1);

  // Delete one: it goes to Boardkit's trash.
  await cardEl(page, c2).hover();
  await cardEl(page, c2).getByRole("button", { name: "Delete card" }).click();
  await expect(cardEl(page, c2)).toHaveCount(0);
  now = await record(page, id);
  expect(now.board.trash.at(-1)!.cardId).toBe(c2);

  // Ctrl+Z, one edit at a time, newest first.
  await page.keyboard.press("Control+z"); // the delete
  await expect(cardEl(page, c2)).toHaveCount(1);
  await page.keyboard.press("Control+z"); // the move
  await expect.poll(async () => (await record(page, id)).board.cardOrder[l1][0]).toBe(c1);
  await page.keyboard.press("Control+Shift+z"); // redo the move
  await expect.poll(async () => (await record(page, id)).board.cardOrder[l2][0]).toBe(c1);

  // Escape ends editing; the whiteboard's own undo is back (the board stays).
  await page.keyboard.press("Escape");
  await expect(page.locator(".gb-board[data-editing]")).toHaveCount(0);

  // Boardkit itself shows every change, with nothing to repair.
  const bk = await context.newPage();
  await bk.goto(`/boardkit/?embed=1&id=${id}`);
  await expect(bk.locator("[data-card-id]").first()).toBeVisible({ timeout: 15_000 });
  await expect(bk.getByText("ZZ renamed on the whiteboard")).toBeVisible();
  await expect(bk.getByText("ZZ new two")).toBeVisible();
  await expect(bk.locator(`[data-card-id="${added}"]`)).toBeVisible();
  await expect(bk.getByText(/repaired|damaged/i)).toHaveCount(0);
});

test("live both ways: Boardkit's edits show on the whiteboard without a reload", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  await placeBoard(page, id);
  const rec = await record(page, id);
  const cardId = rec.board.cardOrder[rec.board.listOrder[0]][0];

  const bk = await context.newPage();
  await bk.goto(`/boardkit/?embed=1&id=${id}`);
  const card = bk.locator(`[data-card-id="${cardId}"]`);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: "Card title", exact: true }).click();
  await bk.keyboard.press("Control+a");
  await bk.keyboard.type("ZZ typed in Boardkit");
  await bk.keyboard.press("Enter");

  await expect(cardEl(page, cardId)).toContainText("ZZ typed in Boardkit", { timeout: 10_000 });

  // And deleted in Boardkit: the whiteboard says so instead of showing stale cards.
  await bk.evaluate((id) => localStorage.removeItem(`boardkit:board:${id}`), id);
  await expect(page.locator(`.gb-board[data-board-id="${id}"][data-status="missing"]`)).toBeVisible();
});

test("box select and lasso pick the board like any other shape", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  await placeBoard(page, id);
  const s = (await shapeOf(page))!;
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).editor.selectNone());

  const pt = (x: number, y: number) => page.evaluate((p) => (window as any).editor.pageToScreen(p), { x, y }) as Promise<{ x: number; y: number }>;
  // Box select from outside its top-left to outside its bottom-right.
  const a = await pt(s.x - 20, s.y - 20);
  const z = await pt(s.x + s.w + 20, s.y + s.h + 20);
  await page.keyboard.press("v");
  await drag(page, a, z);
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([s.id]);

  await page.evaluate(() => (window as any).editor.selectNone());
  await page.keyboard.press("w");
  const loop = [await pt(s.x - 20, s.y - 20), await pt(s.x + s.w + 20, s.y - 20), await pt(s.x + s.w + 20, s.y + s.h + 20), await pt(s.x - 20, s.y + s.h + 20), await pt(s.x - 20, s.y - 10)];
  await page.mouse.move(loop[0].x, loop[0].y);
  await page.mouse.down();
  for (const p of loop.slice(1)) await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([s.id]);
});

test("the Board button is on the toolbar's row at any window width (in its overflow menu when narrow), clear of the main menu", async ({ page, context }) => {
  const id = await seedBoard(context);
  for (const width of [1600, 1000, 760]) {
    await page.setViewportSize({ width, height: 800 });
    await openWhiteboard(page);
    const tools = await box(page.locator(".gauntlet-top-toolbar .tlui-main-toolbar__tools").first());
    const menu = await box(page.getByTestId("main-menu.button"));
    // One row, inside the window, right of the main menu.
    expect(tools.height).toBeLessThan(60);
    expect(tools.x).toBeGreaterThan(menu.x + menu.width);
    expect(tools.x + tools.width).toBeLessThanOrEqual(width);
    // On the row, or in the overflow menu (tldraw keeps hidden copies of
    // the tools for measuring).
    let button = page.getByTestId("tools.board").filter({ visible: true });
    if ((await button.count()) === 0) {
      expect(width).toBeLessThan(1000);
      await page.getByTestId("tools.more-button").click();
      button = page.getByTestId("tools.more.board");
    }
    const b = await box(button);
    expect(Math.abs(b.y + b.height / 2 - (tools.y + tools.height / 2)) < 4 || b.y > tools.y + tools.height).toBe(true);
    await button.click();
    // The list opens under the button, inside the window.
    const list = await box(page.getByTestId("board-picker"));
    expect(list.y).toBeGreaterThan(tools.y + tools.height - 4);
    expect(list.x).toBeGreaterThanOrEqual(0);
    expect(list.x + list.width).toBeLessThanOrEqual(width);
    await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
    // The new board is on the page, selected.
    await expect.poll(() => page.evaluate(() => (window as any).editor.getSelectedShapes().map((s: any) => s.type))).toEqual(["boardkit-board"]);
    await expect(page.locator(`.gb-board[data-board-id="${id}"]`).first()).toBeVisible();
    await expect(page.getByTestId("board-picker")).toHaveCount(0);
  }
});

test("a board looks as in Boardkit: number formats and emphasis, highlights, check circles, keep/maybe/cut", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  // Boardkit's own fields, set on its record as Boardkit would store them.
  const ids = await page.evaluate((id) => {
    const key = `boardkit:board:${id}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    const b = rec.board;
    const [l1, l2] = b.listOrder;
    const [c1, c2, c3] = b.cardOrder[l1];
    Object.assign(b.lists[l1], { numberFormat: "roman", hasChecks: true });
    Object.assign(b.lists[l2], { status: "cut" });
    Object.assign(b.cards[c1], { highlight: "red", highlightStyle: "dashed", check: "green", numberEmphasis: "badge" });
    Object.assign(b.cards[c2], { highlight: "blue", check: "red", status: "maybe" });
    Object.assign(b.cards[c3], { status: "cut" });
    rec.rev += 1;
    localStorage.setItem(key, JSON.stringify(rec));
    return { l1, l2, c1, c2, c3, c4: b.cardOrder[l2][0] };
  }, id);
  await placeBoard(page, id);
  const c1 = cardEl(page, ids.c1);
  await expect(c1.locator(".gb-num")).toHaveText("i");
  await expect(cardEl(page, ids.c2).locator(".gb-num")).toHaveText("ii");
  await expect(cardEl(page, ids.c3).locator(".gb-num")).toHaveText("iii");
  await expect(c1).toHaveAttribute("data-highlight", "dashed");
  await expect(c1).toHaveAttribute("data-number-emphasis", "badge");
  expect(await c1.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("dashed");
  await expect(cardEl(page, ids.c2)).toHaveAttribute("data-highlight", "ring");
  await expect(c1.locator(".gb-check")).toHaveAttribute("data-check", "green");
  await expect(cardEl(page, ids.c2).locator(".gb-check")).toHaveAttribute("data-check", "red");
  await expect(cardEl(page, ids.c3).locator(".gb-check")).toHaveAttribute("data-check", "none");
  await expect(cardEl(page, ids.c2).locator(".gb-status")).toHaveAttribute("data-status", "maybe");
  // Cut: the card itself, and every card of a cut list, fade.
  for (const c of [ids.c3, ids.c4]) expect(Number(await cardEl(page, c).evaluate((el) => getComputedStyle(el).opacity))).toBeCloseTo(0.45, 2);
  expect(Number(await c1.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
  await expect(page.locator(`.gb-list[data-list-id="${ids.l2}"] .gb-status`)).toHaveAttribute("data-status", "cut");
  // Nothing written by showing it.
  const rev = await page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!).rev, id);
  await page.waitForTimeout(300);
  expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!).rev, id)).toBe(rev);
});
