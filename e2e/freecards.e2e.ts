import { readFile } from "node:fs/promises";

import { expect, test, type BrowserContext, type Page } from "./test";

import { box, openBoardList, seedBoard, whiteboardSaved } from "./helpers";

/**
 * GT-6 step 2: cards leave their list. A card dropped on the empty page is
 * gone from its list and from Boardkit's record (so from /boardkit, and
 * from a linked map) and stays on the page as a card of its own; dropped on
 * a list again, of any board, it is that list's card again. One Ctrl+Z
 * either way. A card on the page is saved, backed up, archived and exported
 * with the page. The board is Boardkit's first-visit board; everything goes
 * through the mouse and keyboard, `window.editor` and localStorage are only
 * read to check (and to set the scene: board sizes).
 */

test.use({ viewport: { width: 1600, height: 1000 } });

type Rec = { rev: number; board: { cards: Record<string, { title: string }>; listOrder: string[]; cardOrder: Record<string, string[]>; trash: unknown[] } };
type Pt = { x: number; y: number };
type Shape = { id: string; type: string; parentId: string; x: number; y: number; props: { boardId?: string; cardId?: string; card?: { id: string; title: string }; w: number; h: number; scale?: number } };

const record = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), id) as Promise<Rec>;
const order = async (page: Page, id: string) => {
  const r = await record(page, id);
  return r.board.listOrder.map((l) => r.board.cardOrder[l]);
};
const shapes = (page: Page) => page.evaluate(() => (window as any).editor.getCurrentPageShapes()) as Promise<Shape[]>;
const boards = async (page: Page) => (await shapes(page)).filter((s) => s.type === "boardkit-board");
const freeCards = async (page: Page) => (await shapes(page)).filter((s) => s.type === "boardkit-free-card");
const selected = (page: Page) => page.evaluate(() => (window as any).editor.getSelectedShapes().map((s: any) => ({ type: s.type, cardId: s.props.cardId, id: s.id }))) as Promise<{ type: string; cardId?: string; id: string }[]>;
const listCard = (page: Page, cardId: string) => page.locator(`[data-boardkit-board] article[data-card-id="${cardId}"]`);
const listEl = (page: Page, listId: string) => page.locator(`[data-boardkit-board] section[data-list-id="${listId}"]`);
const freeEl = (page: Page, shapeId: string) => page.locator(`[id="${shapeId}"] [data-testid="free-card"]`);
const midOf = async (l: ReturnType<Page["locator"]>): Promise<Pt> => {
  const b = await box(l.first());
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

async function openWhiteboard(page: Page) {
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

/** Makes the board widgets `scales[i]` big, side by side from (`x`, `y`),
    with nothing picked: room under them for cards on the page. */
async function park(page: Page, scales: number[], x = 60, y = 140) {
  await page.evaluate(
    ({ scales, x, y }) => {
      const editor = (window as any).editor;
      let left = x;
      const all = editor.getCurrentPageShapes().filter((s: any) => s.type === "boardkit-board");
      editor.updateShapes(
        all.map((s: any, i: number) => {
          const scale = scales[i] ?? scales[0];
          const w = (s.props.w / s.props.scale) * scale;
          const next = { id: s.id, type: s.type, x: left, y, props: { ...s.props, scale, w, h: (s.props.h / s.props.scale) * scale } };
          left += w + 60;
          return next;
        }),
      );
      editor.selectNone();
    },
    { scales, x, y },
  );
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
}

async function dragTo(page: Page, from: Pt, to: Pt) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
}
async function drag(page: Page, from: Pt, to: Pt) {
  await dragTo(page, from, to);
  await page.mouse.up();
}

/** A point on the empty page, under every board. */
async function emptySpot(page: Page): Promise<Pt> {
  const all = await page.locator(".tl-html-container .gb-scaled").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
  return { x: 420, y: Math.max(...all) + 140 };
}

/** Drags the list card `cardId` out to the empty page; the card it is there. */
async function takeOut(page: Page, cardId: string, to?: Pt): Promise<Shape> {
  const before = (await freeCards(page)).map((s) => s.id);
  await drag(page, await midOf(listCard(page, cardId)), to ?? (await emptySpot(page)));
  let made: Shape | undefined;
  await expect.poll(async () => (made = (await freeCards(page)).find((s) => !before.includes(s.id)))?.props.card?.id).toBe(cardId);
  await expect(freeEl(page, made!.id).locator("article")).toBeVisible();
  return made!;
}

test("a card dropped on the empty page leaves its list and /boardkit and stays on the page; dropped on a list it is that list's card again; one Ctrl+Z each way", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  const rec = await placeBoard(page, id);
  await park(page, [0.5]);
  const [backlog, doing] = rec.board.listOrder;
  const before = await order(page, id);
  const a = rec.board.cardOrder[backlog][0];
  const title = rec.board.cards[a].title;
  const d = rec.board.cardOrder[doing][0];
  const wasBox = await box(listCard(page, a));

  // Out: let go on the empty page. No landing line there.
  const from = await midOf(listCard(page, a));
  const spot = await emptySpot(page);
  await dragTo(page, from, spot);
  await expect(page.getByTestId("card-ghost")).toBeVisible();
  await expect(page.getByTestId("card-landing-line")).toBeHidden();
  await page.mouse.up();

  // Gone from its list and from the board's record (not in its trash).
  await expect.poll(async () => (await order(page, id))[0]).toEqual(before[0].slice(1));
  const left = await record(page, id);
  expect(Object.keys(left.board.cards)).not.toContain(a);
  expect(left.board.trash).toEqual(rec.board.trash);
  await expect(listCard(page, a)).toHaveCount(0);
  await expect.poll(async () => (await shapes(page)).filter((s) => s.type === "boardkit-card" && s.props.cardId === a).length).toBe(0);

  // On the page: one card of its own, with its text, where it was let go,
  // the size it had on the board (50%; without its list's number its text
  // has more room, so it may take fewer lines), and picked.
  await expect.poll(async () => (await freeCards(page)).length).toBe(1);
  const free = (await freeCards(page))[0];
  expect(free.props.card).toMatchObject({ id: a, title });
  expect(free.props.scale).toBeCloseTo(0.5, 2);
  expect(free.parentId).toMatch(/^page:/);
  await expect(freeEl(page, free.id)).toContainText(title);
  const now = await box(freeEl(page, free.id).locator("article"));
  expect(Math.abs(now.width - wasBox.width)).toBeLessThan(1.5);
  expect(now.height).toBeLessThanOrEqual(wasBox.height + 1.5);
  expect(Math.abs(now.x - (wasBox.x + spot.x - from.x))).toBeLessThan(3);
  expect(Math.abs(now.y - (wasBox.y + spot.y - from.y))).toBeLessThan(3);
  expect(await selected(page)).toEqual([{ type: "boardkit-free-card", id: free.id }]);
  // Its box is as tall as the card drawn.
  await expect.poll(async () => Math.abs((await freeCards(page))[0].props.h - now.height)).toBeLessThan(1.5);

  // /boardkit doesn't have it any more.
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  await expect(bk.locator(`section[data-list-id="${backlog}"]`)).toBeVisible();
  await expect(bk.locator(`article[data-card-id="${a}"]`)).toHaveCount(0);
  await bk.close();

  // One Ctrl+Z: back in its list, where it was; nothing left on the page.
  await page.keyboard.press("Control+z");
  await expect.poll(() => order(page, id)).toEqual(before);
  await expect.poll(async () => (await freeCards(page)).length).toBe(0);
  await expect(listCard(page, a)).toHaveCount(1);
  // One Ctrl+Y: out again, the same card.
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await order(page, id))[0]).toEqual(before[0].slice(1));
  await expect.poll(async () => (await freeCards(page)).map((s) => s.id)).toEqual([free.id]);
  await expect(freeEl(page, free.id)).toContainText(title);

  // On the page it moves like any item: a drag to another empty place.
  const at = await midOf(freeEl(page, free.id).locator("article"));
  await drag(page, at, { x: at.x + 300, y: at.y + 20 });
  await expect.poll(async () => Math.round((await freeCards(page))[0].x - free.x)).toBe(300);
  expect((await order(page, id))[0]).toEqual(before[0].slice(1));
  const parked = (await freeCards(page))[0];

  // In: dragged over a list, a line shows where it lands and the list lights up.
  const at2 = await midOf(freeEl(page, free.id).locator("article"));
  const top = await box(listCard(page, d));
  await dragTo(page, at2, { x: top.x + top.width / 2, y: top.y + 2 });
  const line = page.getByTestId("card-landing-line");
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-list", doing);
  await expect(line).toHaveAttribute("data-index", "0");
  expect(await listEl(page, doing).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  await page.mouse.up();
  await expect(line).toHaveCount(0);

  // That list's first card again, with its text; nothing left on the page.
  await expect.poll(async () => (await order(page, id))[1]).toEqual([a, ...before[1]]);
  expect((await record(page, id)).board.cards[a].title).toBe(title);
  await expect.poll(async () => (await freeCards(page)).length).toBe(0);
  await expect(listCard(page, a)).toHaveCount(1);
  await expect.poll(async () => (await selected(page)).map((s) => s.cardId)).toEqual([a]);
  expect(await listEl(page, doing).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("solid");

  // One Ctrl+Z: out of the list, on the page where it was before that drag.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await order(page, id))[1]).toEqual(before[1]);
  await expect.poll(async () => (await freeCards(page)).map((s) => [s.id, Math.round(s.x), Math.round(s.y)])).toEqual([[free.id, Math.round(parked.x), Math.round(parked.y)]]);
  expect(Object.keys((await record(page, id)).board.cards)).not.toContain(a);
  // One Ctrl+Y: in the list again.
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await order(page, id))[1]).toEqual([a, ...before[1]]);
  await expect.poll(async () => (await freeCards(page)).length).toBe(0);
  // And every step back, one Ctrl+Z each: in → on the page → moved → in its first list.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await freeCards(page)).length).toBe(1);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.round((await freeCards(page))[0]?.x ?? 0)).toBe(Math.round(free.x));
  await page.keyboard.press("Control+z");
  await expect.poll(() => order(page, id)).toEqual(before);
  await expect.poll(async () => (await freeCards(page)).length).toBe(0);
});

test("several cards go out together and come back together, in order; Escape changes nothing", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  const rec = await placeBoard(page, id);
  await park(page, [0.5]);
  const [backlog, , , parkedList] = rec.board.listOrder;
  const before = await order(page, id);
  const [a, b] = rec.board.cardOrder[backlog];

  // Escape while a card is held over the empty page: nothing happens.
  const pa = await midOf(listCard(page, a));
  const spot = await emptySpot(page);
  await dragTo(page, pa, spot);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await order(page, id)).toEqual(before);
  expect(await freeCards(page)).toHaveLength(0);
  expect((await record(page, id)).rev).toBe(rec.rev);

  // Two picked cards, dropped on the page: both leave, one under the other.
  await page.mouse.click(pa.x, pa.y);
  const pb = await midOf(listCard(page, b));
  await page.keyboard.down("Shift");
  await page.mouse.click(pb.x, pb.y);
  await page.keyboard.up("Shift");
  await drag(page, pa, spot);
  await expect.poll(async () => (await freeCards(page)).map((s) => s.props.card!.id).sort()).toEqual([a, b].sort());
  await expect.poll(async () => (await order(page, id))[0]).toEqual(before[0].slice(2));
  const out = (await freeCards(page)).sort((x, y) => x.y - y.y);
  expect(out.map((s) => s.props.card!.id)).toEqual([a, b]);
  expect(out[1].y).toBeGreaterThan(out[0].y + out[0].props.h);
  expect((await selected(page)).map((s) => s.id).sort()).toEqual(out.map((s) => s.id).sort());

  // Both still picked: dragged onto the empty list, they land in that order.
  const lead = await midOf(freeEl(page, out[0].id).locator("article"));
  const empty = await box(listEl(page, parkedList));
  await drag(page, lead, { x: empty.x + empty.width / 2, y: empty.y + empty.height / 2 });
  await expect.poll(async () => (await order(page, id))[3]).toEqual([a, b]);
  await expect.poll(async () => (await freeCards(page)).length).toBe(0);

  // One Ctrl+Z: both on the page again. Another: both in their first list.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await freeCards(page)).length).toBe(2);
  expect((await order(page, id))[3]).toEqual([]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => order(page, id)).toEqual(before);
  await expect.poll(async () => (await freeCards(page)).length).toBe(0);
});

test("a card on the page is still there after a reload; dropped on a board of another size it takes that board's size", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  const rec = await placeBoard(page, id);
  // A second board: a copy of the first, bigger.
  const first = (await boards(page))[0];
  await page.evaluate((id) => void (window as any).editor.select(id), first.id);
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await boards(page)).filter((b) => (b.props.scale ?? 0) > 0).length).toBe(2);
  const second = (await boards(page)).find((b) => b.id !== first.id)!;
  await park(page, [0.3, 0.5], 40, 140);
  const a = rec.board.cardOrder[rec.board.listOrder[0]][0];
  const title = rec.board.cards[a].title;

  // Out of the small board: small on the page.
  const small = await box(page.locator(`[id="${first.id}"] article[data-card-id="${a}"]`));
  await drag(page, { x: small.x + small.width / 2, y: small.y + small.height / 2 }, await emptySpot(page));
  let free: Shape | undefined;
  await expect.poll(async () => (free = (await freeCards(page))[0])?.props.card?.id).toBe(a);
  expect(free!.props.scale).toBeCloseTo(0.3, 2);

  // Reload: the same card, same place, drawn; still not in its board.
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(freeEl(page, free!.id)).toContainText(title);
  const again = (await freeCards(page))[0];
  expect([again.id, again.x, again.y, again.props.scale]).toEqual([free!.id, free!.x, free!.y, free!.props.scale]);
  expect(Object.keys((await record(page, id)).board.cards)).not.toContain(a);
  expect(Math.abs((await box(freeEl(page, free!.id).locator("article"))).width - small.width)).toBeLessThan(1.5);

  // Onto the bigger board: as big as that board's cards.
  const copyId = second.props.boardId!;
  const copy = await record(page, copyId);
  const targetList = copy.board.listOrder[1];
  const neighbour = page.locator(`[id="${second.id}"] section[data-list-id="${targetList}"] article[data-card-id]`).first();
  const t = await box(neighbour);
  await drag(page, await midOf(freeEl(page, free!.id).locator("article")), { x: t.x + t.width / 2, y: t.y + 2 });
  await expect.poll(async () => (await record(page, copyId)).board.cardOrder[targetList].length).toBe(copy.board.cardOrder[targetList].length + 1);
  const landed = (await record(page, copyId)).board.cardOrder[targetList][0];
  expect((await record(page, copyId)).board.cards[landed].title).toBe(title);
  await expect.poll(async () => (await freeCards(page)).length).toBe(0);
  const big = await box(page.locator(`[id="${second.id}"] article[data-card-id="${landed}"]`));
  expect(Math.abs(big.width - (await box(neighbour)).width)).toBeLessThan(1.5);
  expect(big.width).toBeGreaterThan(small.width * 1.5);
});

test("a backup keeps a card on the page: taken away, then restored, it is back", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  const rec = await placeBoard(page, id);
  await park(page, [0.5]);
  const a = rec.board.cardOrder[rec.board.listOrder[0]][0];
  const title = rec.board.cards[a].title;
  const free = await takeOut(page, a);
  await whiteboardSaved(page);

  await page.goto("/backup/");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save a backup" }).click()]);
  await expect(page.getByRole("status")).toContainText("Saved");
  const file = await readFile((await download.path())!);
  expect(file.toString("utf8")).toContain("boardkit-free-card");

  // Deleted from the page (a card on the page is the page's own item).
  await openWhiteboard(page);
  await expect(freeEl(page, free.id)).toBeVisible();
  await page.evaluate((id) => void (window as any).editor.deleteShapes([id]), free.id);
  await expect.poll(async () => (await freeCards(page)).length).toBe(0);
  await whiteboardSaved(page);

  await page.goto("/backup/");
  await page.getByLabel("Backup file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: file });
  const dialog = page.getByRole("dialog", { name: "Replace what's here with this backup?" });
  await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Replace with this backup" }).click()]);
  await expect(page.getByRole("status")).toContainText("Restored");

  await openWhiteboard(page);
  await expect(freeEl(page, free.id)).toContainText(title);
  expect((await freeCards(page)).map((s) => [s.id, s.props.card!.id])).toEqual([[free.id, a]]);
  expect(Object.keys((await record(page, id)).board.cards)).not.toContain(a);
});

test("a board file keeps a card on the page, and an exported picture shows it", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  const rec = await placeBoard(page, id);
  await park(page, [0.5]);
  const a = rec.board.cardOrder[rec.board.listOrder[0]][0];
  const title = rec.board.cards[a].title;
  const free = await takeOut(page, a);

  // Exported: the card's text is in the picture.
  const svg = await page.evaluate(async (id) => (await (window as any).editor.getSvgString([id]))?.svg as string, free.id);
  expect(svg).toContain(title);

  // Main menu → Save board to file, then Open board file…: a new page with the card.
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  await page.getByTestId("main-menu.button").click();
  const download = page.waitForEvent("download");
  await page.getByTestId("main-menu.save-board-file").click();
  const path = (await (await download).path())!;
  const json = await readFile(path, "utf8");
  expect(json).toContain("boardkit-free-card");
  const pages = await page.evaluate(() => (window as any).editor.getPages().length);
  await page.getByTestId("main-menu.button").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("main-menu.open-board-file").click();
  await (await chooser).setFiles(path);
  await expect.poll(() => page.evaluate(() => (window as any).editor.getPages().length)).toBe(pages + 1);
  await expect.poll(async () => (await freeCards(page)).map((s) => s.props.card!.title)).toEqual([title]);
  const opened = (await freeCards(page))[0];
  expect(opened.props.scale).toBeCloseTo(0.5, 2);
  await expect(freeEl(page, opened.id)).toContainText(title);
});

test("a card taken out of a board with a linked map is gone from the map too; Ctrl+Z brings it back in both", async ({ page, context }) => {
  // A Linkkit tree "Free map" > "List A" > "Card 1", linked to a new board.
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  const notNow = bk.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
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
  await lk.keyboard.type("Free map");
  await lk.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  const addChild = async (parent: string, child: string) => {
    const p = lk.locator("[data-box-id]").filter({ hasText: new RegExp(`^${parent}$`) });
    await p.hover();
    await p.getByRole("button", { name: "Add a child", exact: true }).click();
    await expect(field).toBeFocused();
    await lk.keyboard.type(child);
    await lk.keyboard.press("Enter");
    await expect(field).toHaveCount(0);
  };
  await addChild("Free map", "List A");
  await addChild("List A", "Card 1");
  await menu("This map", "Link to Boardkit…");
  await lk.getByRole("alertdialog").getByRole("button", { name: "Link", exact: true }).click();
  await expect(lk.getByText("Linked to Boardkit")).toBeVisible();
  const mapId = await lk.evaluate(() => localStorage.getItem("linkkit:active")!);
  const boardId = await lk.evaluate((id) => (JSON.parse(localStorage.getItem(`linkkit:map:${id}`)!) as { map: { linkedBoard: string } }).map.linkedBoard, mapId);
  await lk.waitForTimeout(800);
  await lk.close();
  await bk.close();

  await openWhiteboard(page);
  const rec = await placeBoard(page, boardId);
  const widget = (await boards(page))[0];
  const card = Object.values(rec.board.cards).find((c) => c.title === "Card 1") as { title: string } & { id?: string };
  const cardId = Object.keys(rec.board.cards).find((k) => rec.board.cards[k].title === "Card 1")!;
  expect(card).toBeTruthy();

  // Both: the list and the map side by side; the map has the card's box.
  const b = await box(page.locator(`[id="${widget.id}"] .gb-scaled`));
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  const both = page.locator(`[id="${widget.id}"] [data-testid="view-switch"] [data-view="both"]`);
  const s = await box(both);
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2, { steps: 8 });
  await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
  await expect(both).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  const mapBox = page.locator(`[id="${widget.id}"] [data-linkkit-map] [data-box-id]`).filter({ hasText: /^Card 1$/ });
  await expect(mapBox).toHaveCount(1);

  // Out of its list: gone from the board, and from the map.
  const free = await takeOut(page, cardId);
  expect(Object.keys((await record(page, boardId)).board.cards)).not.toContain(cardId);
  await expect(mapBox).toHaveCount(0);
  await expect(freeEl(page, free.id)).toContainText("Card 1");

  // One Ctrl+Z: in the list and in the map again.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => Object.keys((await record(page, boardId)).board.cards)).toContain(cardId);
  await expect(mapBox).toHaveCount(1);
  await expect.poll(async () => (await freeCards(page)).length).toBe(0);
});
