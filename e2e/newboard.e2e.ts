import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { box, seedBoard, whiteboardSaved } from "./helpers";

/**
 * "+ New board" in the whiteboard's Board picker: a real Boardkit board,
 * made without leaving the whiteboard. Fresh, empty browser profile per
 * test; everything is done with the mouse and keyboard, `window.editor`
 * and localStorage are only read to check.
 */

type Shape = { id: string; x: number; y: number; boardId: string; w: number; h: number; scale: number };

const shapes = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "boardkit-board")
      .map((s: any) => ({ id: s.id, x: s.x, y: s.y, ...s.props })),
  ) as Promise<Shape[]>;

const registry = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("boardkit:registry") ?? "null")) as Promise<{
    activeBoardId: string;
    boards: { id: string; name: string }[];
  } | null>;
const nameOf = async (page: Page, id: string) => (await registry(page))?.boards.find((b) => b.id === id)?.name;

const field = (page: Page) => page.getByTestId("board-name-field");

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** The view, the page and the camera, in page units. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).editor;
    const v = e.getViewportPageBounds();
    return { view: { x: v.x, y: v.y, w: v.w, h: v.h }, page: e.getCameraOptions().constraints.bounds as { x: number; y: number; w: number; h: number } };
  });

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

/** Board button -> "+ New board"; waits until the new widget is drawn. Its shape. */
async function newBoard(page: Page): Promise<Shape> {
  const before = (await shapes(page)).map((s) => s.id);
  await page.getByTestId("tools.board").click();
  await page.getByTestId("new-board").click({ timeout: 10_000 });
  await expect(page.getByTestId("board-picker")).toHaveCount(0);
  let made: Shape | undefined;
  await expect
    .poll(async () => {
      made = (await shapes(page)).find((s) => !before.includes(s.id));
      return made?.scale ?? 0;
    })
    .toBeGreaterThan(0);
  return made!;
}

const selected = (page: Page) => page.evaluate(() => (window as any).editor.getSelectedShapeIds() as string[]);

/** The name field has the focus, its whole text selected. */
const readyToType = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement | null;
    return el?.dataset.testid === "board-name-field" ? { value: el.value, from: el.selectionStart, to: el.selectionEnd } : null;
  });

/** Boardkit itself, in another tab, on board `id`. */
async function openInBoardkit(context: BrowserContext, id: string, name: string) {
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  const notNow = bk.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) await notNow.click();
  await bk.getByRole("button", { name: "Switch board" }).click();
  const item = bk.getByRole("menuitem", { name: new RegExp(`^(✓ )?${name}$`) });
  await expect(item).toHaveCount(1);
  await item.click();
  await expect.poll(() => bk.evaluate(() => JSON.parse(localStorage.getItem("boardkit:registry")!).activeBoardId)).toBe(id);
  return bk;
}

test("New board: a real Boardkit board in the middle of the view, selected, named Untitled, the name ready to type", async ({ page }) => {
  await openWhiteboard(page);
  // Zoomed in off-centre, so the middle of the view isn't the page's.
  await zoomInAt(page, 300, 250, 4);
  const { view, page: sheet } = await geometry(page);
  expect(Math.abs(view.x + view.w / 2 - (sheet.x + sheet.w / 2))).toBeGreaterThan(100);

  const s = await newBoard(page);
  expect(s.x + s.w / 2).toBeCloseTo(view.x + view.w / 2, 0);
  expect(s.y + s.h / 2).toBeCloseTo(view.y + view.h / 2, 0);
  expect(await selected(page)).toEqual([s.id]);

  // In Boardkit's storage: listed, named "Untitled", an empty board as
  // Boardkit's own "+ New board" makes.
  expect(await nameOf(page, s.boardId)).toBe("Untitled");
  const rec = await page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), s.boardId);
  expect(rec.board.listOrder).toEqual([]);

  await expect(field(page)).toHaveValue("Untitled");
  await expect.poll(() => readyToType(page)).toEqual({ value: "Untitled", from: 0, to: "Untitled".length });
  // The empty board shows how to add its first list.
  await expect(page.locator("[data-boardkit-board]").getByRole("button", { name: "+ Add a list" })).toBeVisible();
});

test("typing names it, on the whiteboard and in /boardkit; Escape or nothing typed leaves Untitled; a press elsewhere keeps the name", async ({ page, context }) => {
  await seedBoard(context);
  await openWhiteboard(page);

  // Typed (with keys that are whiteboard shortcuts elsewhere: r, d, x, Backspace).
  const a = await newBoard(page);
  await page.keyboard.type("Draft rx");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await expect(page.locator(".gb-name", { hasText: "Draft r" })).toBeVisible();
  await expect(field(page)).toHaveCount(0);
  expect(await nameOf(page, a.boardId)).toBe("Draft r");
  expect((await shapes(page)).map((s) => s.id)).toEqual([a.id]); // nothing drawn, nothing deleted
  expect(await page.evaluate(() => (window as any).editor.getCurrentToolId())).toBe("select");
  expect(await selected(page)).toEqual([a.id]);

  // Escape after typing: stays Untitled.
  const b = await newBoard(page);
  await page.keyboard.type("Not this");
  await page.keyboard.press("Escape");
  await expect(field(page)).toHaveCount(0);
  expect(await nameOf(page, b.boardId)).toBe("Untitled");
  expect(await selected(page)).toEqual([b.id]);

  // A press elsewhere after typing keeps it.
  const c = await newBoard(page);
  await page.keyboard.type("Week 41");
  await page.mouse.click(40, 860);
  await expect(field(page)).toHaveCount(0);
  await expect.poll(() => nameOf(page, c.boardId)).toBe("Week 41");

  // Nothing typed, a press elsewhere: Untitled.
  const d = await newBoard(page);
  await page.mouse.click(40, 860);
  await expect(field(page)).toHaveCount(0);
  expect(await nameOf(page, d.boardId)).toBe("Untitled");

  // Boardkit lists them by these names (two "Untitled": Boardkit allows the
  // same name twice and numbers nothing on its own).
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  await bk.getByRole("button", { name: "Switch board" }).click();
  const items = (await bk.getByRole("menuitem").allInnerTexts()).map((t) => t.replace(/^✓ /, "").trim());
  for (const n of ["Draft r", "Week 41"]) expect(items).toContain(n);
  expect(items.filter((t) => t === "Untitled")).toHaveLength(2);
});

test("it is Boardkit's own board: the first list added on the whiteboard shows in /boardkit, a card added there shows on the whiteboard", async ({ page, context }) => {
  await openWhiteboard(page);
  const s = await newBoard(page);
  await page.keyboard.type("Shared");
  await page.keyboard.press("Enter");

  // The first list, without leaving the whiteboard: double-click the empty
  // board opens its "+ Add a list".
  const b = await box(page.locator("[data-boardkit-board]").first());
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  const listField = page.getByPlaceholder("Enter list title…");
  await expect(listField).toBeFocused();
  await page.keyboard.type("Games");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape"); // closes the field
  await page.keyboard.press("Escape"); // ends editing
  await expect(page.locator('[data-boardkit-board][data-editing="true"]')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate((id) => {
      const r = JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!);
      return r.board.listOrder.map((l: string) => r.board.lists[l].title);
    }, s.boardId))
    .toEqual(["Games"]);

  const bk = await openInBoardkit(context, s.boardId, "Shared");
  const list = bk.locator("section[data-list-id]", { hasText: "Games" });
  await expect(list).toBeVisible();
  await list.getByRole("button", { name: "+ Add a card" }).click();
  await bk.keyboard.type("Lakers");
  await bk.keyboard.press("Enter");
  await bk.keyboard.press("Escape");

  await page.bringToFront();
  await expect(page.locator("[data-boardkit-board] article[data-card-id]", { hasText: "Lakers" })).toBeVisible({ timeout: 10_000 });
});

test("made with the view at the page's corner, it stays inside the page", async ({ page }) => {
  await openWhiteboard(page);
  const vp = page.viewportSize()!;
  await zoomInAt(page, vp.width - 2, vp.height - 2, 25);
  const { view, page: sheet } = await geometry(page);
  const s = await newBoard(page);
  // Centred on the view it would have crossed the page's right edge.
  expect(view.x + view.w / 2 + s.w / 2).toBeGreaterThan(sheet.x + sheet.w + 50);
  // ... it doesn't, and stays there.
  for (let i = 0; i < 3; i++) {
    const now = (await shapes(page)).find((x) => x.id === s.id)!;
    expect(now.x).toBeGreaterThanOrEqual(sheet.x - 0.5);
    expect(now.y).toBeGreaterThanOrEqual(sheet.y - 0.5);
    expect(now.x + now.w).toBeLessThanOrEqual(sheet.x + sheet.w + 0.5);
    expect(now.y + now.h).toBeLessThanOrEqual(sheet.y + sheet.h + 0.5);
    await page.waitForTimeout(300);
  }
});

test("one Ctrl+Z takes it off the whiteboard (right away, or after naming); still empty and unnamed it leaves Boardkit too, named it stays; Ctrl+Y puts it back", async ({ page, context }) => {
  // Another board in the list: Boardkit never deletes its last board.
  await seedBoard(context);
  await openWhiteboard(page);

  // Right away, the name field still open.
  const a = await newBoard(page);
  await expect.poll(() => readyToType(page)).not.toBeNull();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await shapes(page)).length).toBe(0);
  await expect(field(page)).toHaveCount(0);
  // Empty and never renamed: gone from Boardkit too (owner, 2026-10-20).
  await expect.poll(() => nameOf(page, a.boardId)).toBeUndefined();
  expect(await page.evaluate((id) => localStorage.getItem(`boardkit:board:${id}`), a.boardId)).toBeNull();
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await shapes(page)).map((s) => s.boardId)).toEqual([a.boardId]);
  // The same board again, same id, shown (not "isn't in Boardkit").
  expect(await nameOf(page, a.boardId)).toBe("Untitled");
  await expect(page.locator('[data-boardkit-board][data-status="missing"]')).toHaveCount(0);
  await expect(page.locator('.tl-html-container [data-boardkit-board] [data-add="list"]')).toHaveCount(1);

  // After naming it.
  const b = await newBoard(page);
  await page.keyboard.type("Keep me");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await shapes(page)).map((s) => s.boardId)).toEqual([a.boardId]);
  expect(await nameOf(page, b.boardId)).toBe("Keep me");
  const rec = await page.evaluate((id) => localStorage.getItem(`boardkit:board:${id}`), b.boardId);
  expect(rec).not.toBeNull();
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await shapes(page)).map((s) => s.boardId).sort()).toEqual([a.boardId, b.boardId].sort());
});

test("two in a row are two boards, and both survive a reload", async ({ page }) => {
  await openWhiteboard(page);
  const a = await newBoard(page);
  await page.keyboard.type("First");
  await page.keyboard.press("Enter");
  const b = await newBoard(page);
  await page.keyboard.type("Second");
  await page.keyboard.press("Enter");
  expect(a.boardId).not.toBe(b.boardId);
  const reg = await registry(page);
  expect(reg!.boards.map((x) => x.name)).toEqual(["First", "Second"]);

  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect.poll(async () => (await shapes(page)).map((s) => s.boardId).sort()).toEqual([a.boardId, b.boardId].sort());
  await expect(page.locator(".gb-name", { hasText: "First" })).toBeVisible();
  await expect(page.locator(".gb-name", { hasText: "Second" })).toBeVisible();
  expect(await registry(page)).toEqual(reg);
});

test("deleting the widget of an empty, never renamed new board deletes the board from Boardkit (Ctrl+Z brings both back); a board with content, or renamed, stays in Boardkit", async ({ page, context }) => {
  await seedBoard(context);
  await openWhiteboard(page);
  const del = async (shapeId: string) => {
    await page.evaluate((id) => {
      const e = (window as any).editor;
      e.setEditingShape(null);
      e.select(id);
      e.focus();
    }, shapeId);
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await shapes(page)).some((s) => s.id === shapeId)).toBe(false);
  };

  // Empty: the widget deleted takes the board with it; Ctrl+Z brings both.
  const a = await newBoard(page);
  await page.keyboard.press("Enter");
  await del(a.id);
  await expect.poll(() => nameOf(page, a.boardId)).toBeUndefined();
  await page.keyboard.press("Control+z");
  await expect.poll(() => nameOf(page, a.boardId)).toBe("Untitled");
  await expect.poll(async () => (await shapes(page)).map((s) => s.boardId)).toEqual([a.boardId]);

  // With a list: the widget goes, the board stays, list and all.
  const add = page.locator('.tl-html-container [data-boardkit-board] [data-add="list"]');
  const b = (await add.boundingBox())!;
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await page.keyboard.type("ZZ keeps it");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate((id) => (JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!).board.listOrder as string[]).length, a.boardId))
    .toBe(1);
  await del(a.id);
  await page.waitForTimeout(300);
  expect(await nameOf(page, a.boardId)).toBe("Untitled");
  expect(await page.evaluate((id) => localStorage.getItem(`boardkit:board:${id}`), a.boardId)).not.toBeNull();

  // Renamed, still empty: stays too.
  const c = await newBoard(page);
  await page.keyboard.type("Named");
  await page.keyboard.press("Enter");
  await del(c.id);
  await page.waitForTimeout(300);
  expect(await nameOf(page, c.boardId)).toBe("Named");
  // /boardkit lists the two that stay, not the one taken back earlier.
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  await bk.getByRole("button", { name: "Switch board" }).click();
  await expect(bk.getByRole("menuitem", { name: "Named" })).toBeVisible();
  await bk.close();
});
