import { expect, test, type Page } from "./test";

import { box, seedBoard, openBoardList } from "./helpers";

/**
 * One undo for the whole whiteboard page (docs/PHASE-2.5.md item 22):
 * Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z and the bottom-left buttons undo and redo
 * the latest thing done on the page, a drawing change or a card edit, in
 * order. Fresh, empty browser profile per test; the board is Boardkit's
 * first-visit board. Actions go through the mouse and keyboard; storage and
 * `window.editor` are only read to check.
 */

type Rec = { board: { cards: Record<string, { title: string }>; listOrder: string[]; cardOrder: Record<string, string[]> } };
const record = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), id) as Promise<Rec>;
const cardTitle = async (page: Page, id: string, cardId: string) => (await record(page, id)).board.cards[cardId].title;

/** Every shape on the page: id, type, where. */
const shapes = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .map((s: any) => ({ id: s.id as string, type: s.type as string, x: Math.round(s.x), y: Math.round(s.y) }))
      .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)),
  );
const shapeAt = async (page: Page, id: string) => (await shapes(page)).find((s) => s.id === id)!;

const boardEl = (page: Page) => page.locator(".tl-html-container [data-boardkit-board]").first();
const editingEl = (page: Page) => page.locator('[data-boardkit-board][data-editing="true"]');

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** A rectangle drawn with the mouse at screen (x, y); its id. */
async function rect(page: Page, x: number, y: number) {
  const before = (await shapes(page)).map((s) => s.id);
  await page.keyboard.press("2");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 4 });
  await page.mouse.move(x + 100, y + 70, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const made = (await shapes(page)).find((s) => !before.includes(s.id))!;
  return made.id;
}

/** Drags shape `id` by (dx, dy) screen pixels, from its middle (selected
    first: an unfilled shape is grabbed by its middle only then). */
async function moveShape(page: Page, id: string, dx: number, dy: number) {
  const at = await page.evaluate((id) => {
    const e = (window as any).editor;
    e.select(id);
    const b = e.getShapePageBounds(id);
    return e.pageToScreen({ x: b.midX, y: b.midY });
  }, id);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + dx / 2, at.y + dy / 2, { steps: 5 });
  await page.mouse.move(at.x + dx, at.y + dy, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
}

/** Puts board `id` on the page, in the lower half, out of the rectangles' way. */
async function placeBoard(page: Page, id: string) {
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  await expect(boardEl(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).editor.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board")?.props.scale ?? 0)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
}

/** Renames card `cardId` in place, then Escape until the board is no longer edited. */
async function renameCard(page: Page, cardId: string, title: string) {
  const t = await box(page.locator(`[data-boardkit-board] article[data-card-id="${cardId}"] [data-card-title]`));
  await page.mouse.dblclick(t.x + 10, t.y + t.height / 2);
  await expect(editingEl(page)).toHaveCount(1);
  await page.keyboard.press("Control+a");
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  for (let i = 0; i < 3 && (await editingEl(page).count()) > 0; i++) await page.keyboard.press("Escape");
  await expect(editingEl(page)).toHaveCount(0);
}

test("rename a card, Escape, Ctrl+Z: the card's old name is back and nothing else changed; Ctrl+Y renames it again", async ({ page, context }) => {
  const id = await seedBoard(context);
  await open(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await rect(page, 300, 160); // an older whiteboard action, which Ctrl+Z must leave alone
  await placeBoard(page, id);
  const cardId = (await record(page, id)).board.cardOrder[(await record(page, id)).board.listOrder[0]][0];
  const old = await cardTitle(page, id, cardId);
  const before = await shapes(page);

  await renameCard(page, cardId, "ZZ renamed");
  await expect.poll(() => cardTitle(page, id, cardId)).toBe("ZZ renamed");
  await page.keyboard.press("Control+z");
  await expect.poll(() => cardTitle(page, id, cardId)).toBe(old);
  await expect(page.locator(`[data-boardkit-board] article[data-card-id="${cardId}"]`)).toContainText(old);
  expect(await shapes(page)).toEqual(before);
  await page.keyboard.press("Control+y");
  await expect.poll(() => cardTitle(page, id, cardId)).toBe("ZZ renamed");
  await expect(page.locator(`[data-boardkit-board] article[data-card-id="${cardId}"]`)).toContainText("ZZ renamed");
  expect(await shapes(page)).toEqual(before);
});

test("a mixed sequence (move a shape, edit a card, move the shape) is undone and redone in exact order, by keys and by the buttons", async ({ page, context }) => {
  const id = await seedBoard(context);
  await open(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const r = await rect(page, 300, 160);
  await placeBoard(page, id);
  const cardId = (await record(page, id)).board.cardOrder[(await record(page, id)).board.listOrder[0]][0];
  const old = await cardTitle(page, id, cardId);

  const p0 = await shapeAt(page, r);
  await moveShape(page, r, 120, 0);
  const p1 = await shapeAt(page, r);
  expect(p1.x).toBeGreaterThan(p0.x);
  await renameCard(page, cardId, "ZZ in between");
  await expect.poll(() => cardTitle(page, id, cardId)).toBe("ZZ in between");
  await moveShape(page, r, 0, 100);
  const p2 = await shapeAt(page, r);
  expect(p2.y).toBeGreaterThan(p1.y);

  const state = async () => ({ at: await shapeAt(page, r), title: await cardTitle(page, id, cardId) });
  const expectState = (at: typeof p0, title: string) => expect.poll(state).toEqual({ at, title });

  // Undo: the second move, then the card, then the first move.
  await page.keyboard.press("Control+z");
  await expectState(p1, "ZZ in between");
  await page.keyboard.press("Control+z");
  await expectState(p1, old);
  await page.getByRole("button", { name: "Undo" }).click();
  await expectState(p0, old);
  // Redo in the same order: the first move, the card, the second move.
  await page.keyboard.press("Control+Shift+z");
  await expectState(p1, old);
  await page.getByRole("button", { name: "Redo" }).click();
  await expectState(p1, "ZZ in between");
  await page.keyboard.press("Control+y");
  await expectState(p2, "ZZ in between");
});

test("inside a card title being typed, Ctrl+Z is the field's own; inside a board being edited (no field), Ctrl+Z is the page's", async ({ page, context }) => {
  const id = await seedBoard(context);
  await open(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const r = await rect(page, 300, 160);
  await placeBoard(page, id);
  const cardId = (await record(page, id)).board.cardOrder[(await record(page, id)).board.listOrder[0]][0];
  const old = await cardTitle(page, id, cardId);
  const p0 = await shapeAt(page, r);
  await moveShape(page, r, 100, 0);

  const t = await box(page.locator(`[data-boardkit-board] article[data-card-id="${cardId}"] [data-card-title]`));
  await page.mouse.dblclick(t.x + 10, t.y + t.height / 2);
  await expect(editingEl(page)).toHaveCount(1);
  await page.keyboard.press("End");
  await page.keyboard.type("XYZ");
  await page.keyboard.press("Control+z"); // the field's own undo: the move stays
  expect((await shapeAt(page, r)).x).toBeGreaterThan(p0.x);
  await page.keyboard.press("Escape"); // leave the field (nothing saved), still editing the board
  await expect(editingEl(page)).toHaveCount(1);
  expect(await cardTitle(page, id, cardId)).toBe(old);
  await page.keyboard.press("Control+z"); // the page's: the latest thing done is the move
  await expect.poll(async () => (await shapeAt(page, r)).x).toBe(p0.x);
  expect(await cardTitle(page, id, cardId)).toBe(old);
});
