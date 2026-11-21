import { expect, test, type BrowserContext, type Page } from "./test";

import { box, openBoardList, seedBoard } from "./helpers";

/**
 * GT-6 step 1: cards are whiteboard objects of their own. One click picks a
 * card (no double-click to enter the board), a box and the lasso pick single
 * cards, a drag moves cards between lists and boards with a landing line and
 * the target list lit, each move is saved to Boardkit and is one Ctrl+Z.
 * The board is Boardkit's first-visit board (Backlog, In progress, Done,
 * Parked), made by opening /boardkit; everything goes through the mouse and
 * keyboard, `window.editor` and localStorage are only read to check.
 */

type Rec = { rev: number; board: { cards: Record<string, { title: string }>; listOrder: string[]; cardOrder: Record<string, string[]>; trash: unknown[] } };
type Pt = { x: number; y: number };
type Shape = { id: string; type: string; parentId: string; x: number; y: number; props: { boardId: string; cardId?: string; w: number; h: number; scale?: number } };

const record = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), id) as Promise<Rec>;
/** The board's lists as saved: the card ids of each, in order. */
const order = async (page: Page, id: string) => {
  const r = await record(page, id);
  return r.board.listOrder.map((l) => r.board.cardOrder[l]);
};
const shapes = (page: Page) => page.evaluate(() => (window as any).editor.getCurrentPageShapes()) as Promise<Shape[]>;
const boards = async (page: Page) => (await shapes(page)).filter((s) => s.type === "boardkit-board");
const selected = (page: Page) => page.evaluate(() => (window as any).editor.getSelectedShapes().map((s: any) => ({ type: s.type, cardId: s.props.cardId, id: s.id }))) as Promise<{ type: string; cardId?: string; id: string }[]>;
const pickedCards = async (page: Page) => (await selected(page)).filter((s) => s.type === "boardkit-card").map((s) => s.cardId!);
const anyCard = (page: Page, cardId: string) => page.locator(`[data-boardkit-board] article[data-card-id="${cardId}"]`);
const listEl = (page: Page, listId: string) => page.locator(`[data-boardkit-board] section[data-list-id="${listId}"]`);
const editingEl = (page: Page) => page.locator('[data-boardkit-board][data-editing="true"]');
const mid = async (page: Page, cardId: string): Promise<Pt> => {
  const b = await box(anyCard(page, cardId).first());
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

async function openWhiteboard(page: Page, context: BrowserContext) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Puts board `id` on the page; every card of it has its object. */
async function placeBoard(page: Page, id: string) {
  const before = (await boards(page)).length;
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  await expect.poll(async () => (await boards(page)).filter((b) => (b.props.scale ?? 0) > 0).length).toBe(before + 1);
  const rec = await record(page, id);
  const shown = rec.board.listOrder.flatMap((l) => rec.board.cardOrder[l]);
  await expect.poll(async () => (await shapes(page)).filter((s) => s.type === "boardkit-card" && s.props.boardId === id).length).toBe(shown.length);
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  return rec;
}

/** Makes every board widget `scale` big, side by side from (`x`, `y`), with
    nothing picked: room around them for boxes and drags. */
async function park(page: Page, scale: number, x = 220, y = 200) {
  await page.evaluate(
    ({ scale, x, y }) => {
      const editor = (window as any).editor;
      let left = x;
      const all = editor.getCurrentPageShapes().filter((s: any) => s.type === "boardkit-board");
      editor.updateShapes(
        all.map((s: any) => {
          const w = (s.props.w / s.props.scale) * scale;
          const next = { id: s.id, type: s.type, x: left, y, props: { ...s.props, scale, w, h: (s.props.h / s.props.scale) * scale } };
          left += w + 60;
          return next;
        }),
      );
      editor.selectNone();
    },
    { scale, x, y },
  );
  await expect.poll(async () => (await boards(page)).every((b) => b.props.scale === scale)).toBe(true);
  // The card objects follow in the next frame.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
}

/** Presses at `from`, moves to `to` in steps, and stops there, still pressed. */
async function dragTo(page: Page, from: Pt, to: Pt) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
}
async function drag(page: Page, from: Pt, to: Pt) {
  await dragTo(page, from, to);
  await page.mouse.up();
}

test("one click picks a card, Shift adds another, and a press between lists picks the board", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page, context);
  const rec = await placeBoard(page, id);
  const [backlog, , done] = rec.board.listOrder;
  const [a, b] = rec.board.cardOrder[backlog];
  const c = rec.board.cardOrder[done][0];

  // Each card's object sits exactly where the card is drawn.
  const drawn = await box(anyCard(page, a));
  const bounds = await page.evaluate((cardId) => {
    const editor = (window as any).editor;
    const s = editor.getCurrentPageShapes().find((s: any) => s.type === "boardkit-card" && s.props.cardId === cardId);
    const pb = editor.getShapePageBounds(s.id);
    const p = editor.pageToScreen({ x: pb.x, y: pb.y });
    const vp = editor.getViewportScreenBounds();
    return { x: p.x + vp.x, y: p.y + vp.y, w: pb.w * editor.getZoomLevel(), h: pb.h * editor.getZoomLevel() };
  }, a);
  expect(Math.abs(bounds.x - drawn.x)).toBeLessThan(1.5);
  expect(Math.abs(bounds.y - drawn.y)).toBeLessThan(1.5);
  expect(Math.abs(bounds.w - drawn.width)).toBeLessThan(1.5);
  expect(Math.abs(bounds.h - drawn.height)).toBeLessThan(1.5);

  // One click: that card, and the board is not being edited.
  const pa = await mid(page, a);
  await page.mouse.click(pa.x, pa.y);
  expect(await pickedCards(page)).toEqual([a]);
  expect(await selected(page)).toHaveLength(1);
  await expect(editingEl(page)).toHaveCount(0);

  // Another click: the other card alone. Shift: both. Shift again: one off.
  const pb = await mid(page, b);
  await page.mouse.click(pb.x, pb.y);
  expect(await pickedCards(page)).toEqual([b]);
  const pc = await mid(page, c);
  await page.keyboard.down("Shift");
  await page.mouse.click(pc.x, pc.y);
  await page.keyboard.up("Shift");
  expect((await pickedCards(page)).sort()).toEqual([b, c].sort());
  await page.keyboard.down("Shift");
  await page.mouse.click(pb.x, pb.y);
  await page.keyboard.up("Shift");
  expect(await pickedCards(page)).toEqual([c]);

  // Nothing was written by picking.
  expect((await record(page, id)).rev).toBe(rec.rev);

  // Between two lists: the board itself.
  const l0 = await box(listEl(page, rec.board.listOrder[0]));
  const l1 = await box(listEl(page, rec.board.listOrder[1]));
  await page.mouse.click((l0.x + l0.width + l1.x) / 2, l0.y + 40);
  const board = (await boards(page))[0];
  expect((await selected(page)).map((s) => s.id)).toEqual([board.id]);
});

test("a box and the lasso pick single cards; a box around the whole board picks the board", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page, context);
  const rec = await placeBoard(page, id);
  const backlog = rec.board.cardOrder[rec.board.listOrder[0]];
  await park(page, 0.6);
  const board = (await boards(page))[0];
  const first = await box(anyCard(page, backlog[0]));
  const second = await box(anyCard(page, backlog[1]));
  const whole = await box(page.locator(".tl-html-container [data-boardkit-board]").first());

  // A box from the left of the board around the first two cards of Backlog
  // (a box picks what it surrounds, as everywhere on this whiteboard).
  await page.keyboard.press("v");
  await drag(page, { x: whole.x - 30, y: first.y - 4 }, { x: first.x + first.width + 4, y: second.y + second.height + 4 });
  expect((await pickedCards(page)).sort()).toEqual([backlog[0], backlog[1]].sort());
  expect((await selected(page)).some((s) => s.id === board.id)).toBe(false);

  // A box around all of it: the board, as one thing.
  await page.evaluate(() => void (window as any).editor.selectNone());
  const pt = (x: number, y: number) => page.evaluate((p) => (window as any).editor.pageToScreen(p), { x, y }) as Promise<Pt>;
  await drag(page, await pt(board.x - 20, board.y - 20), await pt(board.x + board.props.w + 20, board.y + board.props.h + 20));
  expect((await selected(page)).map((s) => s.id)).toEqual([board.id]);

  // The lasso around the second card only.
  await page.evaluate(() => void (window as any).editor.selectNone());
  await page.keyboard.press("w");
  const m = 3;
  const loop: Pt[] = [
    { x: second.x - m, y: second.y - m },
    { x: second.x + second.width + m, y: second.y - m },
    { x: second.x + second.width + m, y: second.y + second.height + m },
    { x: second.x - m, y: second.y + second.height + m },
    { x: second.x - m, y: second.y - m + 1 },
  ];
  await page.mouse.move(loop[0].x, loop[0].y);
  await page.mouse.down();
  for (const p of loop.slice(1)) await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.mouse.up();
  expect(await pickedCards(page)).toEqual([backlog[1]]);
});

test("a drag moves a card inside its list and to another list: a line shows where, the list lights up, one Ctrl+Z each", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page, context);
  const rec = await placeBoard(page, id);
  const [backlog, doing] = rec.board.listOrder;
  const before = await order(page, id);
  const [a, b, c] = rec.board.cardOrder[backlog];
  const [d] = rec.board.cardOrder[doing];

  // Inside the list: the first card to under the third.
  const from = await mid(page, a);
  const third = await box(anyCard(page, c));
  await dragTo(page, from, { x: from.x, y: third.y + third.height - 3 });
  const line = page.getByTestId("card-landing-line");
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-list", backlog);
  await expect(line).toHaveAttribute("data-index", "2");
  await expect(page.getByTestId("card-ghost")).toBeVisible();
  // The list it will land in is lit; the card's own place is dimmed.
  expect(await listEl(page, backlog).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  expect(await listEl(page, doing).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("solid");
  expect(Number(await anyCard(page, a).evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
  await page.mouse.up();
  await expect(line).toHaveCount(0);
  await expect(page.getByTestId("card-ghost")).toHaveCount(0);
  await expect.poll(async () => (await order(page, id))[0].slice(0, 3)).toEqual([b, c, a]);
  // Still picked, where it is now; the board was never "entered".
  await expect.poll(() => pickedCards(page)).toEqual([a]);
  await expect(editingEl(page)).toHaveCount(0);
  // Drawn in the new order.
  await expect.poll(async () => (await box(anyCard(page, a))).y).toBeGreaterThan((await box(anyCard(page, c))).y);

  // To another list: above its first card.
  const from2 = await mid(page, b);
  const top = await box(anyCard(page, d));
  await dragTo(page, from2, { x: top.x + top.width / 2, y: top.y + 2 });
  await expect(line).toHaveAttribute("data-list", doing);
  await expect(line).toHaveAttribute("data-index", "0");
  expect(await listEl(page, doing).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  await page.mouse.up();
  await expect.poll(async () => (await order(page, id))[1].slice(0, 2)).toEqual([b, d]);
  expect((await order(page, id))[0]).not.toContain(b);

  // One Ctrl+Z per move, and Ctrl+Y brings each back.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await order(page, id))[0].slice(0, 3)).toEqual([b, c, a]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => order(page, id)).toEqual(before);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await order(page, id))[0].slice(0, 3)).toEqual([b, c, a]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => order(page, id)).toEqual(before);

  // The same board in /boardkit shows what the whiteboard did.
  await drag(page, await mid(page, a), { x: (await mid(page, d)).x, y: (await box(anyCard(page, d))).y + 2 });
  await expect.poll(async () => (await order(page, id))[1][0]).toBe(a);
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  await expect(bk.locator(`section[data-list-id="${doing}"] article[data-card-id]`).first()).toHaveAttribute("data-card-id", a);
  await bk.close();
});

test("several picked cards move together, in order; Escape and a drop off every list change nothing", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page, context);
  const rec = await placeBoard(page, id);
  const [backlog, , done, parked] = rec.board.listOrder;
  const before = await order(page, id);
  const [a, b] = rec.board.cardOrder[backlog];
  const x = rec.board.cardOrder[done][0];

  // Escape mid-drag: back as it was, no undo step made.
  const pa = await mid(page, a);
  const px = await mid(page, x);
  await dragTo(page, pa, px);
  await expect(page.getByTestId("card-landing-line")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("card-ghost")).toHaveCount(0);
  await page.mouse.up();
  expect(await order(page, id)).toEqual(before);

  // Dropped on the empty page: nothing moves (cards leaving lists is step 2).
  const whole = await box(page.locator(".tl-html-container [data-boardkit-board]").first());
  await drag(page, pa, { x: whole.x + whole.width / 2, y: whole.y + whole.height + 120 });
  expect(await order(page, id)).toEqual(before);
  expect((await record(page, id)).rev).toBe(rec.rev);

  // Two cards from two lists, into the empty list: in the order drawn.
  await page.mouse.click(pa.x, pa.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(px.x, px.y);
  const pb = await mid(page, b);
  await page.mouse.click(pb.x, pb.y);
  await page.keyboard.up("Shift");
  expect((await pickedCards(page)).sort()).toEqual([a, b, x].sort());
  const empty = await box(listEl(page, parked));
  await dragTo(page, pa, { x: empty.x + empty.width / 2, y: empty.y + empty.height / 2 });
  await expect(page.locator(".gc-ghost-count")).toHaveText("3");
  await page.mouse.up();
  await expect.poll(async () => (await order(page, id))[3]).toEqual([a, b, x]);
  await expect.poll(async () => (await pickedCards(page)).sort()).toEqual([a, b, x].sort());

  // One Ctrl+Z puts all three back.
  await page.keyboard.press("Control+z");
  await expect.poll(() => order(page, id)).toEqual(before);
});

test("a card dragged to another board leaves one and joins the other; one Ctrl+Z puts it back", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page, context);
  const rec = await placeBoard(page, id);
  // A second board: a copy of the first (its own data, "… (copy)").
  const first = (await boards(page))[0];
  await page.evaluate((id) => void (window as any).editor.select(id), first.id);
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await boards(page)).filter((b) => (b.props.scale ?? 0) > 0).length).toBe(2);
  const second = (await boards(page)).find((b) => b.id !== first.id)!;
  const copyId = second.props.boardId;
  expect(copyId).not.toBe(id);
  // Side by side, both inside the window. A copy keeps the list and card
  // ids of the board it was made from: each is found inside its own widget.
  await park(page, 0.45, 40, 140);
  const inFirst = (sel: string) => page.locator(`[id="${first.id}"] ${sel}`);
  const inSecond = (sel: string) => page.locator(`[id="${second.id}"] ${sel}`);
  const copy = await record(page, copyId);
  const beforeA = await order(page, id);
  const beforeB = await order(page, copyId);
  const card = rec.board.cardOrder[rec.board.listOrder[0]][0];
  const title = rec.board.cards[card].title;
  const targetList = copy.board.listOrder[1];
  const over = copy.board.cardOrder[targetList][0];

  const b0 = await box(inFirst(`article[data-card-id="${card}"]`));
  const t = await box(inSecond(`section[data-list-id="${targetList}"] article[data-card-id="${over}"]`));
  await dragTo(page, { x: b0.x + b0.width / 2, y: b0.y + b0.height / 2 }, { x: t.x + t.width / 2, y: t.y + t.height - 2 });
  await expect(page.getByTestId("card-landing-line")).toHaveAttribute("data-list", targetList);
  await page.mouse.up();

  // Gone from the first board (not in its trash), second in that list of the other.
  await expect.poll(async () => (await order(page, id))[0]).toEqual(beforeA[0].slice(1));
  expect((await record(page, id)).board.trash).toEqual(rec.board.trash);
  const after = await record(page, copyId);
  const moved = after.board.cardOrder[targetList][1];
  expect(after.board.cards[moved].title).toBe(title);
  // The copy already had a card with that id: the moved card got a new one.
  expect(moved).not.toBe(card);
  expect(Object.keys(after.board.cards)).toContain(card);
  expect(after.board.cardOrder[targetList]).toHaveLength(beforeB[1].length + 1);
  // Picked on the board it is on now.
  await expect.poll(() => pickedCards(page)).toEqual([moved]);

  // One Ctrl+Z: both boards as before. Ctrl+Y: moved again.
  await page.keyboard.press("Control+z");
  await expect.poll(() => order(page, id)).toEqual(beforeA);
  await expect.poll(() => order(page, copyId)).toEqual(beforeB);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await order(page, id))[0]).toEqual(beforeA[0].slice(1));
  await expect.poll(async () => (await order(page, copyId))[1]).toHaveLength(beforeB[1].length + 1);
  await page.keyboard.press("Control+z");
  await expect.poll(() => order(page, id)).toEqual(beforeA);
  await expect.poll(() => order(page, copyId)).toEqual(beforeB);
});

test("a double-click on a card types in its title; the card's own buttons still work with one press", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page, context);
  const rec = await placeBoard(page, id);
  const [a, b] = rec.board.cardOrder[rec.board.listOrder[0]];

  const pa = await mid(page, a);
  await page.mouse.dblclick(pa.x, pa.y);
  const field = anyCard(page, a).locator("textarea");
  await expect(field).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Renamed here");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await record(page, id)).board.cards[a].title).toBe("Renamed here");

  // A click on another card ends the typing and picks that card.
  const pb = await mid(page, b);
  await page.mouse.click(pb.x, pb.y);
  await expect(editingEl(page)).toHaveCount(0);
  expect(await pickedCards(page)).toEqual([b]);

  // The card's delete button, showing under the pointer: one press deletes.
  await page.mouse.move(pb.x, pb.y);
  const del = anyCard(page, b).locator('[data-control="delete"]');
  await expect.poll(async () => Number(await del.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.5);
  const d = await box(del);
  await page.mouse.click(d.x + d.width / 2, d.y + d.height / 2);
  await expect.poll(async () => (await order(page, id))[0]).not.toContain(b);
});

test("the board moves by its name and by the gap between two lists; scaled from a corner, its cards stay objects in place", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page, context);
  const rec = await placeBoard(page, id);
  const at = async () => {
    const b = (await boards(page))[0];
    return { x: b.x, y: b.y, scale: b.props.scale!, w: b.props.w };
  };
  // Room to move: smaller, away from the edges.
  await park(page, 0.7);
  const start = await at();

  // By the gap between two lists.
  const l0 = await box(listEl(page, rec.board.listOrder[0]));
  const l1 = await box(listEl(page, rec.board.listOrder[1]));
  const gap = { x: (l0.x + l0.width + l1.x) / 2, y: l0.y + 30 };
  await drag(page, gap, { x: gap.x + 60, y: gap.y + 40 });
  const moved = await at();
  expect(moved.x - start.x).toBeCloseTo(60 / (await page.evaluate(() => (window as any).editor.getZoomLevel())), 0);
  expect(moved.y).toBeGreaterThan(start.y);
  // Moving the board changed nothing in it.
  expect((await record(page, id)).rev).toBe(rec.rev);

  // By its name (shown while the pointer is over the board).
  await page.evaluate(() => void (window as any).editor.selectNone());
  await page.mouse.move(gap.x + 60, gap.y + 40);
  const name = await box(page.locator(".gb-name").first());
  // Its lower half: the name's top is the board's top edge, which resizes.
  const grab = { x: name.x + Math.min(20, name.width / 2), y: name.y + name.height * 0.6 };
  await drag(page, grab, { x: grab.x - 50, y: grab.y + 30 });
  const again = await at();
  expect(again.x).toBeLessThan(moved.x);
  expect(again.y).toBeGreaterThan(moved.y);

  // The cards came along: each object is where its card is drawn.
  const check = async () => {
    const card = rec.board.cardOrder[rec.board.listOrder[2]][0];
    const drawn = await box(anyCard(page, card));
    const b = await page.evaluate((cardId) => {
      const editor = (window as any).editor;
      const s = editor.getCurrentPageShapes().find((s: any) => s.type === "boardkit-card" && s.props.cardId === cardId);
      const pb = editor.getShapePageBounds(s.id);
      const p = editor.pageToScreen({ x: pb.x, y: pb.y });
      const vp = editor.getViewportScreenBounds();
      return { x: p.x + vp.x, y: p.y + vp.y, w: pb.w * editor.getZoomLevel() };
    }, card);
    return Math.max(Math.abs(b.x - drawn.x), Math.abs(b.y - drawn.y), Math.abs(b.w - drawn.width));
  };
  await expect.poll(check).toBeLessThan(1.5);

  // Scaled bigger (as a corner drag does): the card objects follow.
  await page.evaluate(() => {
    const editor = (window as any).editor;
    const s = editor.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board");
    editor.updateShapes([{ id: s.id, type: s.type, props: { ...s.props, scale: 0.9, w: (s.props.w / s.props.scale) * 0.9, h: (s.props.h / s.props.scale) * 0.9 } }]);
  });
  await expect.poll(check).toBeLessThan(1.5);
  // And a click still picks the card there.
  const card = rec.board.cardOrder[rec.board.listOrder[2]][0];
  const p = await mid(page, card);
  await page.mouse.click(p.x, p.y);
  expect(await pickedCards(page)).toEqual([card]);
});

test("card objects only mirror their board: Delete, duplicate and undo never leave one alone or twice; no style panel for cards", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page, context);
  const rec = await placeBoard(page, id);
  await park(page, 0.6, 320, 200);
  const cards = async () => (await shapes(page)).filter((s) => s.type === "boardkit-card");
  const count = (await cards()).length;
  const board = (await boards(page))[0];
  const [a] = rec.board.cardOrder[rec.board.listOrder[0]];

  // Only a card picked: no style panel (its look is Boardkit's).
  const pa = await mid(page, a);
  await page.mouse.click(pa.x, pa.y);
  expect(await pickedCards(page)).toEqual([a]);
  await expect(page.locator(".gk-style-panel")).toHaveCount(0);

  // Delete and Ctrl+D on a picked card change nothing (deleting and copying
  // cards: step 3), on the page or in Boardkit.
  await page.keyboard.press("Delete");
  await page.keyboard.press("Control+d");
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
  expect((await cards()).length).toBe(count);
  expect(new Set((await cards()).map((c) => c.props.cardId)).size).toBe(count);
  expect((await record(page, id)).rev).toBe(rec.rev);

  // The board picked, then Shift and a click on its card: the card alone.
  await page.evaluate((id) => void (window as any).editor.select(id), board.id);
  await page.keyboard.down("Shift");
  await page.mouse.click(pa.x, pa.y);
  await page.keyboard.up("Shift");
  expect((await selected(page)).map((s) => s.type)).toEqual(["boardkit-card"]);

  // The board deleted: its card objects go with it; undone, they are back.
  await page.evaluate((id) => void (window as any).editor.select(id), board.id);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await shapes(page)).length).toBe(0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await cards()).length).toBe(count);
  expect((await boards(page)).length).toBe(1);
});

test("undoing a board's placing takes its card objects off the page too", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page, context);
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  await expect.poll(async () => (await shapes(page)).filter((s) => s.type === "boardkit-card").length).toBeGreaterThan(3);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await shapes(page)).length).toBe(0);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await shapes(page)).filter((s) => s.type === "boardkit-card").length).toBeGreaterThan(3);
  expect((await boards(page)).length).toBe(1);
});
