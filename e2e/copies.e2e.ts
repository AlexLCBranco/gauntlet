import { expect, test, type BrowserContext, type Page } from "./test";

import { openBoardList, openMapList, seedBoard, seedMap } from "./helpers";

/**
 * Copies are independent (speed session Part 6, owner 2026-11-12): a board
 * or map widget copied inside the whiteboard (Ctrl+C / Ctrl+V, Ctrl+D)
 * shows a new board or map with its own data; a linked board and map are
 * copied as a new linked pair; one Ctrl+Z takes the copy and its data away
 * (Ctrl+Y brings both back). Unchanged: a board placed from the picker or
 * pasted from /boardkit is that same live board; a cut widget pasted again
 * is the same board. A copied Slate keeps its own night and size.
 * Fresh, empty browser profile per test; `window.editor` and storage are
 * read to check, and set up only where marked.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

type Widget = { id: string; type: string; boardId?: string; mapId?: string; date?: string; w: number; h: number; scale: number };
const widgets = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor.getCurrentPageShapes().map((s: any) => ({ id: s.id, type: s.type, boardId: s.props.boardId, mapId: s.props.mapId, date: s.props.date, w: s.props.w, h: s.props.h, scale: s.props.scale })),
  ) as Promise<Widget[]>;

type BoardRec = { board: { lists: Record<string, { title: string }>; cards: Record<string, { title: string }>; listOrder: string[]; cardOrder: Record<string, string[]> } };
const boardRec = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`) ?? "null"), id) as Promise<BoardRec | null>;
const boardNames = (page: Page) =>
  page.evaluate(() => Object.fromEntries((JSON.parse(localStorage.getItem("boardkit:registry")!).boards as { id: string; name: string }[]).map((b) => [b.id, b.name]))) as Promise<Record<string, string>>;
type MapRec = { map: { name: string; linkedBoard?: string; nodes: Record<string, { name: string }> } };
const mapRec = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`linkkit:map:${id}`) ?? "null"), id) as Promise<MapRec | null>;
const mapIds = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("linkkit:map:")).map((k) => k.slice(12)));
const boxNames = (r: MapRec | null) => Object.values(r?.map.nodes ?? {}).map((n) => n.name).sort();

async function openWhiteboard(page: Page, context: BrowserContext) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Waits for a new widget of `type` to be drawn: it. */
async function newWidget(page: Page, before: string[], type: string): Promise<Widget> {
  let made: Widget | undefined;
  await expect
    .poll(async () => {
      made = (await widgets(page)).find((s) => s.type === type && !before.includes(s.id));
      return (made?.scale ?? 0) > 0;
    })
    .toBe(true);
  return made!;
}

async function placeBoard(page: Page, boardId: string) {
  const before = (await widgets(page)).map((s) => s.id);
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  return newWidget(page, before, "boardkit-board");
}

async function placeMap(page: Page, mapId: string) {
  const before = (await widgets(page)).map((s) => s.id);
  await openMapList(page);
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  return newWidget(page, before, "linkkit-map");
}

/** Selects widget `id` alone (as a click on it does). */
const select = (page: Page, id: string) => page.evaluate((id) => void (window as any).editor.select(id), id);

/** Ctrl+D on the selected widget: the copy. */
async function duplicate(page: Page, type: string): Promise<Widget> {
  const before = (await widgets(page)).map((s) => s.id);
  await page.keyboard.press("Control+d");
  return newWidget(page, before, type);
}

/** The pointer on a bare spot of the page (paste at the cursor lands there). */
async function bareSpot(page: Page) {
  await page.mouse.move(1450, 850);
}

/** A board with a linked map (Linkkit's "Link to Boardkit…"): their ids. */
async function seedLinked(context: BrowserContext, name: string): Promise<{ mapId: string; boardId: string }> {
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  const notNow = bk.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) await notNow.click();
  await expect(bk.getByRole("button", { name: "Switch board" })).toBeVisible();
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await expect(lk.locator("[data-ready]")).toBeVisible({ timeout: 30_000 });
  const menu = async (...path: string[]) => {
    await lk.getByRole("button", { name: /^Switch map/ }).click();
    for (const item of path) await lk.getByRole("menuitem", { name: new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
  };
  const field = lk.getByRole("textbox", { name: "Box name" });
  await menu("+ New", "Decision tree");
  await expect(field).toBeFocused();
  await lk.keyboard.type(name);
  await lk.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  const p = lk.locator("[data-box-id]").filter({ hasText: new RegExp(`^${name}$`) });
  await p.hover();
  await p.getByRole("button", { name: "Add a child", exact: true }).click();
  await expect(field).toBeFocused();
  await lk.keyboard.type("List A");
  await lk.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  await menu("This map", "Link to Boardkit…");
  await lk.getByRole("alertdialog").getByRole("button", { name: "Link", exact: true }).click();
  await expect(lk.getByText("Linked to Boardkit")).toBeVisible();
  const mapId = await lk.evaluate(() => localStorage.getItem("linkkit:active")!);
  const boardId = await lk.evaluate((id) => (JSON.parse(localStorage.getItem(`linkkit:map:${id}`)!) as { map: { linkedBoard: string } }).map.linkedBoard, mapId);
  await lk.waitForTimeout(800);
  await lk.close();
  await bk.close();
  return { mapId, boardId };
}

test("a board widget copied and pasted shows a new board with the same lists and cards; editing the copy leaves the original alone; one Ctrl+Z takes the copy and its board away, Ctrl+Y brings both back", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await openWhiteboard(page, context);
  const original = await placeBoard(page, boardId);
  const names = await boardNames(page);
  const before = (await widgets(page)).map((s) => s.id);
  await select(page, original.id);
  await page.keyboard.press("Control+c");
  await bareSpot(page);
  await page.keyboard.press("Control+v");
  const copy = await newWidget(page, before, "boardkit-board");
  expect(copy.boardId).not.toBe(boardId);
  expect((await boardNames(page))[copy.boardId!]).toBe(`${names[boardId]} (copy)`);
  const [from, to] = [(await boardRec(page, boardId))!, (await boardRec(page, copy.boardId!))!];
  expect(to.board.listOrder).toEqual(from.board.listOrder);
  expect(to.board.cards).toEqual(from.board.cards);
  // The copy draws its own board.
  await expect(page.locator(`[id="${copy.id}"] [data-boardkit-board]`)).toBeVisible();

  // One Ctrl+Z: the widget and its board gone; Ctrl+Y: both back, as copied.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await widgets(page)).some((s) => s.id === copy.id)).toBe(false);
  await expect.poll(() => boardRec(page, copy.boardId!)).toBeNull();
  expect(Object.keys(await boardNames(page))).not.toContain(copy.boardId);
  expect(await boardRec(page, boardId)).toEqual(from);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await widgets(page)).find((s) => s.id === copy.id)?.boardId).toBe(copy.boardId);
  await expect.poll(async () => (await boardRec(page, copy.boardId!))?.board.cards).toEqual(from.board.cards);
  expect((await boardNames(page))[copy.boardId!]).toBe(`${names[boardId]} (copy)`);

  // A card renamed on the copy: the original keeps its title.
  const cardId = to.board.cardOrder[to.board.listOrder[0]!]![0]!;
  const title = page.locator(`[id="${copy.id}"] article[data-card-id="${cardId}"] [data-card-title]`);
  const t = (await title.boundingBox())!;
  await page.mouse.dblclick(t.x + 60, t.y + t.height / 2);
  const field = page.locator(`[id="${copy.id}"] textarea`);
  await expect(field).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Only on the copy");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await boardRec(page, copy.boardId!))?.board.cards[cardId]?.title).toBe("Only on the copy");
  expect((await boardRec(page, boardId))!.board.cards[cardId]!.title).toBe(from.board.cards[cardId]!.title);
  await expect(page.locator(`[id="${original.id}"] article[data-card-id="${cardId}"]`)).not.toContainText("Only on the copy");
});

test("a map widget duplicated (Ctrl+D) shows a new map with the same boxes; one Ctrl+Z takes it and its map away", async ({ page, context }) => {
  const mapId = await seedMap(context, "Copy me");
  await openWhiteboard(page, context);
  const original = await placeMap(page, mapId);
  await select(page, original.id);
  const copy = await duplicate(page, "linkkit-map");
  expect(copy.mapId).not.toBe(mapId);
  const [from, to] = [await mapRec(page, mapId), await mapRec(page, copy.mapId!)];
  expect(to!.map.name).toBe("Copy me (copy)");
  expect(boxNames(to)).toEqual(boxNames(from));
  await expect(page.locator(`[id="${copy.id}"] [data-map-view][data-ready]`)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await widgets(page)).some((s) => s.id === copy.id)).toBe(false);
  await expect.poll(() => mapRec(page, copy.mapId!)).toBeNull();
  expect(boxNames(await mapRec(page, mapId))).toEqual(boxNames(from));
  await page.keyboard.press("Control+y");
  await expect.poll(async () => boxNames(await mapRec(page, copy.mapId!))).toEqual(boxNames(from));
});

test("a linked board and map are copied as a new linked pair, from the board widget or from the map widget; one Ctrl+Z takes both away", async ({ page, context }) => {
  const { mapId, boardId } = await seedLinked(context, "Pair");
  await openWhiteboard(page, context);
  const board = await placeBoard(page, boardId);
  await select(page, board.id);
  const mapsBefore = await mapIds(page);
  const copy = await duplicate(page, "boardkit-board");
  expect(copy.boardId).not.toBe(boardId);
  // Its own map, linked to its own board; the original pair untouched.
  let newMaps: string[] = [];
  await expect.poll(async () => (newMaps = (await mapIds(page)).filter((m) => !mapsBefore.includes(m))).length).toBe(1);
  expect((await mapRec(page, newMaps[0]!))!.map.linkedBoard).toBe(copy.boardId);
  // Named as copies, and they stay so once the map is saved.
  await page.waitForTimeout(500);
  expect((await boardNames(page))[copy.boardId!]).toBe("Pair (copy)");
  expect((await mapRec(page, newMaps[0]!))!.map.name).toBe("Pair (copy)");
  expect((await mapRec(page, mapId))!.map.linkedBoard).toBe(boardId);
  // The copy shows its own map in its Map view.
  await expect(page.locator(`[id="${copy.id}"] [data-testid="view-switch"]`)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(() => mapRec(page, newMaps[0]!)).toBeNull();
  await expect.poll(() => boardRec(page, copy.boardId!)).toBeNull();

  // From the map widget: a new pair too.
  const map = await placeMap(page, mapId);
  await select(page, map.id);
  const boardsBefore = Object.keys(await boardNames(page));
  const mapCopy = await duplicate(page, "linkkit-map");
  expect(mapCopy.mapId).not.toBe(mapId);
  const linkedTo = (await mapRec(page, mapCopy.mapId!))!.map.linkedBoard!;
  expect(linkedTo).toBeTruthy();
  expect(boardsBefore).not.toContain(linkedTo);
  expect(Object.keys(await boardNames(page))).toContain(linkedTo);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(() => mapRec(page, mapCopy.mapId!)).toBeNull();
  await expect.poll(() => boardRec(page, linkedTo)).toBeNull();
  expect((await mapRec(page, mapId))!.map.linkedBoard).toBe(boardId);
});

test("still the live board: one placed again from the picker, one pasted from /boardkit, and a cut widget pasted again show the same board, and nothing is copied", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await openWhiteboard(page, context);
  const first = await placeBoard(page, boardId);
  const boards = Object.keys(await boardNames(page));
  // The picker, again.
  await page.keyboard.press("Escape");
  const second = await placeBoard(page, boardId);
  expect(second.boardId).toBe(boardId);
  // Ctrl+C in /boardkit (no card picked), Ctrl+V on the whiteboard.
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  await expect(bk.getByRole("button", { name: "Switch board" })).toBeVisible();
  await bk.locator("body").click({ position: { x: 5, y: 600 } });
  await bk.keyboard.press("Control+c");
  await bk.close();
  await page.bringToFront();
  const before = (await widgets(page)).map((s) => s.id);
  await bareSpot(page);
  await page.keyboard.press("Control+v");
  const pasted = await newWidget(page, before, "boardkit-board");
  expect(pasted.boardId).toBe(boardId);
  // Cut and pasted again: the same board, moved.
  await select(page, first.id);
  await page.keyboard.press("Control+x");
  await expect.poll(async () => (await widgets(page)).some((s) => s.id === first.id)).toBe(false);
  const left = (await widgets(page)).map((s) => s.id);
  await page.keyboard.press("Control+v");
  const back = await newWidget(page, left, "boardkit-board");
  expect(back.boardId).toBe(boardId);
  expect(Object.keys(await boardNames(page)).sort()).toEqual(boards.sort());
});

test("a copied Slate keeps its own night and size; turning the original's night leaves the copy's", async ({ page, context }) => {
  await openWhiteboard(page, context);
  const before = (await widgets(page)).map((s) => s.id);
  await page.getByTestId("tools.slate").click();
  let slate: Widget | undefined;
  await expect
    .poll(async () => {
      slate = (await widgets(page)).find((s) => s.type === "calendarkit-slate" && !before.includes(s.id));
      return (slate?.scale ?? 0) > 0;
    })
    .toBe(true);
  await select(page, slate!.id);
  const copy = await duplicate(page, "calendarkit-slate");
  expect({ date: copy.date, w: copy.w, h: copy.h, scale: copy.scale }).toEqual({ date: slate!.date, w: slate!.w, h: slate!.h, scale: slate!.scale });
  // The original a night on (its ‹ › / → as the owner does it).
  await select(page, slate!.id);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await widgets(page)).find((s) => s.id === slate!.id)?.date).not.toBe(slate!.date);
  expect((await widgets(page)).find((s) => s.id === copy.id)?.date).toBe(slate!.date);
});
