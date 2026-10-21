import { expect, test, type Page } from "@playwright/test";

import { box, seedBoard, whiteboardSaved } from "./helpers";

/**
 * Boardkit boards on the whiteboard (whiteboard phase 2). Fresh, empty
 * browser profile per test; the board is the real Boardkit's first-visit
 * board, made by opening /boardkit. Every action goes through the mouse
 * and keyboard; `window.editor` and localStorage are only read to check.
 * The board is drawn by Boardkit's own components (its DOM: section
 * [data-list-id], article [data-card-id]); every one of its controls is
 * checked in parity.e2e.ts.
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
/** Waits until Boardkit has saved something that passes `check` (it saves a moment after an edit). */
async function saved(page: Page, id: string, check: (r: Rec) => boolean, message?: string) {
  await expect.poll(async () => check(await record(page, id)), { message, timeout: 8_000 }).toBe(true);
  return record(page, id);
}
const boardName = (page: Page, id: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem("boardkit:registry")!) as { boards: { id: string; name: string }[] }).boards.find((b) => b.id === id)!.name, id);

/** The shape's props and position. */
const shapeOf = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).editor.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board");
    return s ? { id: s.id as string, x: s.x as number, y: s.y as number, ...(s.props as { boardId: string; w: number; h: number; scale: number }) } : null;
  });

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Puts board `id` on the page with the toolbar's Board button. */
async function placeBoard(page: Page, id: string) {
  await page.getByTestId("tools.board").click();
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  await expect(page.getByTestId("board-picker")).toHaveCount(0);
  const board = boardEl(page);
  await expect(board).toBeVisible();
  await expect.poll(async () => (await shapeOf(page))?.scale ?? 0).toBeGreaterThan(0);
  return board;
}

/** The board on the page (the shape's content): Boardkit's own board. */
const boardEl = (page: Page) => page.locator(".tl-html-container [data-boardkit-board]").first();
const editingEl = (page: Page) => page.locator('[data-boardkit-board][data-editing="true"]');
const listEl = (page: Page, listId: string) => page.locator(`[data-boardkit-board] section[data-list-id="${listId}"]`);
const cardEl = (page: Page, cardId: string) => page.locator(`[data-boardkit-board] article[data-card-id="${cardId}"]`);

async function startEditing(page: Page, cardId: string) {
  const b = await box(cardEl(page, cardId));
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await expect(editingEl(page)).toHaveCount(1);
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

  await expect(page.locator(".gb-name")).toHaveText(await boardName(page, id));
  await expect(board.locator("section[data-list-id]")).toHaveCount(rec.board.listOrder.length);
  const shown = rec.board.listOrder.flatMap((l) => rec.board.cardOrder[l]);
  await expect(board.locator("article[data-card-id]")).toHaveCount(shown.length);
  for (const cardId of shown.slice(0, 5)) await expect(cardEl(page, cardId)).toContainText(rec.board.cards[cardId].title);

  // Selected, inside the sheet, and its box is the content's size.
  const s = (await shapeOf(page))!;
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([s.id]);
  expect(s.x).toBeGreaterThanOrEqual(0);
  expect(s.y).toBeGreaterThanOrEqual(0);
  const pageBox = await page.evaluate(() => (window as any).editor.getCameraOptions().constraints.bounds);
  expect(s.x + s.w).toBeLessThanOrEqual(pageBox.w + 0.5);
  expect(s.y + s.h).toBeLessThanOrEqual(pageBox.h + 0.5);
  const onScreen = await box(board);
  const zoom = await page.evaluate(() => (window as any).editor.getZoomLevel());
  expect(onScreen.width).toBeCloseTo(s.w * zoom, 0);

  // Nothing written by just showing it.
  expect((await record(page, id)).rev).toBe(rec.rev);

  // Survives a reload (tldraw saves to IndexedDB a moment after a change).
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(boardEl(page).locator("article[data-card-id]")).toHaveCount(shown.length);
});

test("a corner drag scales the whole board like a picture, and undo puts it back", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  const board = await placeBoard(page, id);
  const before = (await shapeOf(page))!;
  const firstCard = board.locator("article[data-card-id]").first();
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
  const field = cardEl(page, c1).getByRole("textbox", { name: "Card title" });
  await expect(field).toBeFocused();
  await page.keyboard.type("ZZ renamed on the whiteboard");
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  await expect(cardEl(page, c1)).toContainText("ZZ renamed on the whiteboard");
  let now = await saved(page, id, (r) => r.board.cards[c1].title === "ZZ renamed on the whiteboard", "renamed");
  expect(now.rev).toBeGreaterThan(rec.rev);

  // Add two cards to the second list (Enter keeps the field open), with its
  // slim "+", shown while the pointer is over that list.
  const l2Box = await box(listEl(page, l2));
  await page.mouse.move(l2Box.x + l2Box.width / 2, l2Box.y + 20, { steps: 2 });
  await listEl(page, l2).getByRole("button", { name: /Add a card/ }).click();
  await page.keyboard.type("ZZ new one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("ZZ new two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  now = await saved(page, id, (r) => r.board.cardOrder[l2].some((c) => r.board.cards[c].title === "ZZ new two"), "cards added");
  const l2Cards = now.board.cardOrder[l2];
  expect(l2Cards.slice(-2).map((c) => now.board.cards[c].title)).toEqual(["ZZ new one", "ZZ new two"]);
  const added = l2Cards.at(-1)!;
  // Still editing after Escape left the add field.
  await expect(editingEl(page)).toHaveCount(1);

  // Drag the first card of list 1 onto the top of list 2.
  const from = await box(cardEl(page, c1));
  const target = await box(cardEl(page, now.board.cardOrder[l2][0]));
  await drag(page, { x: from.x + 20, y: from.y + from.height / 2 }, { x: target.x + 20, y: target.y + 4 });
  now = await saved(page, id, (r) => r.board.cardOrder[l2][0] === c1 && !r.board.cardOrder[l1].includes(c1), "card moved");
  await expect(listEl(page, l2).locator("article[data-card-id]").first()).toHaveAttribute("data-card-id", c1);

  // Delete one: it goes to Boardkit's trash.
  await cardEl(page, c2).hover();
  await cardEl(page, c2).getByRole("button", { name: "Delete card" }).click();
  await expect(cardEl(page, c2)).toHaveCount(0);
  await saved(page, id, (r) => r.board.trash.at(-1)?.cardId === c2, "card in the trash");

  // Ctrl+Z, one edit at a time, newest first.
  await page.keyboard.press("Control+z"); // the delete
  await expect(cardEl(page, c2)).toHaveCount(1);
  await page.keyboard.press("Control+z"); // the move
  await expect.poll(async () => (await record(page, id)).board.cardOrder[l1][0]).toBe(c1);
  await page.keyboard.press("Control+Shift+z"); // redo the move
  await expect.poll(async () => (await record(page, id)).board.cardOrder[l2][0]).toBe(c1);

  // Escape ends editing; the whiteboard's own undo is back (the board stays).
  await page.keyboard.press("Escape");
  await expect(editingEl(page)).toHaveCount(0);

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
  await expect(page.locator('[data-boardkit-board][data-status="missing"]')).toBeVisible();
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
    await expect(boardEl(page)).toBeVisible();
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
  const num = (cardId: string) => cardEl(page, cardId).locator("[class*=numberText]");
  await expect(num(ids.c1)).toHaveText("i");
  await expect(num(ids.c2)).toHaveText("ii");
  await expect(num(ids.c3)).toHaveText("iii");
  await expect(c1).toHaveAttribute("data-highlight", "dashed");
  await expect(c1).toHaveAttribute("data-number-emphasis", "badge");
  expect(await c1.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("dashed");
  await expect(cardEl(page, ids.c2)).toHaveAttribute("data-highlight", "ring");
  const check = (cardId: string) => cardEl(page, cardId).locator("[class*=_circle_]");
  await expect(check(ids.c1)).toHaveAttribute("data-check", "green");
  await expect(check(ids.c2)).toHaveAttribute("data-check", "red");
  await expect(check(ids.c3)).toBeVisible();
  await expect(check(ids.c3)).not.toHaveAttribute("data-check");
  await expect(cardEl(page, ids.c2).locator("[data-status]")).toHaveAttribute("data-status", "maybe");
  // Cut: the card itself, and every card of a cut list, fade.
  for (const c of [ids.c3, ids.c4]) {
    await expect(cardEl(page, c)).toHaveAttribute("data-cut", "");
    expect(Number(await cardEl(page, c).evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.8);
  }
  expect(Number(await c1.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
  await expect(listEl(page, ids.l2).locator("[data-list-header] [data-status]")).toHaveAttribute("data-status", "cut");
  // Nothing written by showing it.
  const rev = await page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!).rev, id);
  await page.waitForTimeout(300);
  expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!).rev, id)).toBe(rev);
});

/** Sets board `id`'s background in its saved record, as Boardkit's toolbar
    does (rev + 1, so an open Boardkit adopts it). */
async function setBackground(page: Page, id: string, background: unknown) {
  await page.evaluate(
    ([id, background]) => {
      const key = `boardkit:board:${id}`;
      const rec = JSON.parse(localStorage.getItem(key)!);
      rec.board.background = background;
      rec.rev = (rec.rev ?? 0) + 1;
      localStorage.setItem(key, JSON.stringify(rec));
    },
    [id, background] as const,
  );
}

/** What paints at a screen point above the whiteboard's page: every element
    there, top first, down to the page (the sheet), with a background. */
const paintedAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => {
      const out: string[] = [];
      for (const el of document.elementsFromPoint(x, y)) {
        if (el.getAttribute("data-testid") === "sheet") return out;
        const cs = getComputedStyle(el);
        const clear = /rgba\(.*,\s*0\)$|transparent/.test(cs.backgroundColor) && cs.backgroundImage === "none";
        if (!clear) out.push(`${el.tagName}.${el.className} ${cs.backgroundColor} ${cs.backgroundImage.slice(0, 40)}`);
      }
      return ["(no sheet under the point)"];
    },
    [x, y] as const,
  );

/** A point in the empty space between the board's first two lists. */
async function gapBetweenLists(page: Page) {
  const lists = boardEl(page).locator("section[data-list-id]");
  const a = await box(lists.nth(0));
  const b = await box(lists.nth(1));
  expect(b.x).toBeGreaterThan(a.x + a.width + 2);
  // Below the shorter list's header, where neither list reaches over.
  return { x: (a.x + a.width + b.x) / 2, y: Math.min(a.y + a.height, b.y + b.height) - 10 };
}

test("no panel behind the lists on the whiteboard: they sit on the whiteboard's own background, even when the board has a background in Boardkit", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  // A board with a colour background set in Boardkit.
  await setBackground(page, id, { kind: "color", color: "#d33a3a" });
  await placeBoard(page, id);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).editor.selectNone());

  // No backdrop, and the board itself is see-through.
  const board = boardEl(page);
  expect(await board.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(await board.locator('[style*="--board-background"]').count()).toBe(0);
  // Between two lists, nothing paints over the whiteboard's page.
  const gap = await gapBetweenLists(page);
  expect(await paintedAt(page, gap.x, gap.y)).toEqual([]);
  // Below the lists too, inside the board's box.
  const all = await box(board);
  expect(await paintedAt(page, all.x + all.width - 4, all.y + all.height - 4)).toEqual([]);
  // The title and the slim "+ Add a list" are still there.
  await expect(page.locator(".gb-name")).toHaveText(await boardName(page, id));
  await expect(board.getByRole("button", { name: "Add a list", exact: true })).toHaveCount(1);

  // The same while the board is being edited.
  const firstCard = board.locator("article[data-card-id]").first();
  await startEditing(page, (await firstCard.getAttribute("data-card-id"))!);
  expect(await editingEl(page).locator('[style*="--board-background"]').count()).toBe(0);
  expect(await editingEl(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
});

test("the board is selected and moved by pressing the empty space between its lists", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  await placeBoard(page, id);
  await page.keyboard.press("Escape");
  // Smaller than the page, in its middle, so there is room to move it.
  await page.evaluate(() => {
    const e = (window as any).editor;
    const s = e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board");
    e.updateShape({ id: s.id, type: s.type, x: 200, y: 150, props: { scale: s.props.scale * 0.6 } });
    e.selectNone();
  });
  await page.waitForTimeout(300);
  const before = (await shapeOf(page))!;

  // A click between two lists selects the board.
  const gap = await gapBetweenLists(page);
  await page.mouse.click(gap.x, gap.y);
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([before.id]);

  // A drag from there moves it (and nothing in it). (Not right after the
  // click: that would be a double-click, which opens the board for editing.)
  await page.evaluate(() => (window as any).editor.selectNone());
  await page.waitForTimeout(700);
  await drag(page, gap, { x: gap.x - 100, y: gap.y + 60 });
  const after = (await shapeOf(page))!;
  expect(after.x).toBeLessThan(before.x - 50);
  expect(after.y).toBeGreaterThan(before.y + 30);
  expect(after.scale).toBe(before.scale);
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([before.id]);
});

test("standalone Boardkit still shows a board's background", async ({ page, context }) => {
  const id = await seedBoard(context);
  await page.goto("/boardkit/");
  const notNow = page.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 2_000 }).catch(() => false)) await notNow.click();
  await setBackground(page, id, { kind: "color", color: "#d33a3a" });
  await page.reload();
  const backdrop = page.locator('[style*="--board-background"]');
  await expect(backdrop).toHaveCount(1);
  const painted = await backdrop.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(painted).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
});
