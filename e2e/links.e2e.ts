import { readFile } from "node:fs/promises";

import { expect, test, type BrowserContext, type Locator, type Page } from "./test";

import { box, openBoardList, openMapList, seedBoard, seedMap, whiteboardSaved } from "./helpers";

/**
 * Links on everything (owner, 2026-10-23): every object can hold a link,
 * set from its right-click menu or Ctrl+K, opened only from its link icon
 * (or a link in its text), always in a new tab; a click on the object
 * still selects it. Drawn items keep it in the shape (`meta.url`); boards,
 * lists and cards in Boardkit's record; map boxes in Linkkit's. Fresh,
 * empty browser profile per test. Shapes are set up through
 * `window.editor` (marked); links are added with the mouse and keyboard.
 */

test.use({ viewport: { width: 1400, height: 900 } });

const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) =>
  page.evaluate(([src, a]) => new Function("e", "a", `return (${src})(e, a)`)((window as any).editor, a), [fn.toString(), arg] as const) as Promise<T>;

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** A local address (this site's sample page), so a link opened in a test
    never leaves the machine. */
const local = (page: Page, tag: string) => `${new URL(page.url()).origin}/embed-sample.html?${tag}`;

const meta = (page: Page, id: string) => ed(page, (e, id) => e.getShape(id)?.meta?.url ?? null, id);

/** The shape's middle on screen (window pixels). */
const middle = (page: Page, id: string) =>
  ed(page, (e, id) => {
    const b = e.getShapePageBounds(id);
    const p = e.pageToScreen({ x: b.midX, y: b.midY });
    return { x: p.x, y: p.y };
  }, id);

/** Types `url` into the link field that just opened, and presses Enter. */
async function fill(page: Page, field: Locator, url: string) {
  await expect(field.getByRole("textbox", { name: "Link" })).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type(url);
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
}
const wbPrompt = (page: Page) => page.getByTestId("link-prompt");
const appPrompt = (page: Page) => page.locator("[data-link-prompt]");

/** Right-click at (x, y) → the menu item `item`. */
async function menu(page: Page, at: { x: number; y: number }, item: RegExp) {
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.getByRole("menuitem", { name: item }).click();
}

/** Adds a link to shape `id` from the right-click menu. */
async function linkByMenu(page: Page, id: string, url: string) {
  await menu(page, await middle(page, id), /^Add link/);
  await fill(page, wbPrompt(page), url);
}

/** Adds a link to shape `id` with Ctrl+K (selected with a click first). */
async function linkByKey(page: Page, id: string, url: string) {
  const m = await middle(page, id);
  await page.keyboard.press("Escape");
  await page.mouse.click(m.x, m.y);
  await expect.poll(() => ed(page, (e) => e.getSelectedShapeIds())).toEqual([id]);
  await page.keyboard.press("Control+k");
  await fill(page, wbPrompt(page), url);
}

const badge = (page: Page, id: string) => page.locator(`[data-link-badge="${id}"]`);

/** Pages opened while `act` runs (and a moment after). */
async function opened(context: BrowserContext, act: () => Promise<void>, wait = 800): Promise<Page[]> {
  const pages: Page[] = [];
  const on = (p: Page) => pages.push(p);
  context.on("page", on);
  await act();
  await new Promise((r) => setTimeout(r, wait));
  context.off("page", on);
  return pages;
}

/** Set up through `window.editor`: two of each drawn kind, side by side. */
async function drawEveryKind(page: Page): Promise<Record<string, [string, string]>> {
  return ed(page, (e) => {
    const src = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="teal"/></svg>');
    e.createAssets([{ id: "asset:pic", typeName: "asset", type: "image", props: { name: "pic.svg", src, w: 120, h: 80, mimeType: "image/svg+xml", isAnimated: false }, meta: {} }]);
    const out: Record<string, string[]> = {};
    const kinds: [string, (x: number, y: number, n: number) => any][] = [
      ["rectangle", (x, y) => ({ type: "geo", x, y, props: { w: 120, h: 80, geo: "rectangle" } })],
      ["text", (x, y, n) => ({ type: "text", x, y, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Text ${n}` }] }] } } })],
      ["arrow", (x, y) => ({ type: "arrow", x, y, props: { start: { x: 0, y: 0 }, end: { x: 120, y: 60 } } })],
      ["line", (x, y) => ({ type: "line", x, y, props: { points: { a1: { id: "a1", index: "a1", x: 0, y: 0 }, a2: { id: "a2", index: "a2", x: 120, y: 60 } } } })],
      ["image", (x, y) => ({ type: "image", x, y, props: { assetId: "asset:pic", w: 120, h: 80 } })],
      ["embed", (x, y) => ({ type: "web-embed", x, y, props: { url: "https://example.invalid/", w: 200, h: 130, frameable: "no", title: "Card" } })],
    ];
    kinds.forEach(([kind, make], row) => {
      out[kind] = [0, 1].map((n) => {
        const before = new Set(e.getCurrentPageShapes().map((s: any) => s.id));
        // Clear of the style panel (left) and the backups banner (bottom left).
        e.createShape(make(520 + n * 380, 80 + row * 115, n));
        return e.getCurrentPageShapes().find((s: any) => !before.has(s.id)).id;
      });
    });
    // A group of two rectangles, twice.
    out.group = [0, 1].map((n) => {
      const ids = [0, 1].map((k) => {
        const before = new Set(e.getCurrentPageShapes().map((s: any) => s.id));
        e.createShape({ type: "geo", x: 1180 + k * 40, y: 120 + n * 160, props: { w: 60, h: 60, geo: "ellipse", fill: "solid" } });
        return e.getCurrentPageShapes().find((s: any) => !before.has(s.id)).id;
      });
      e.groupShapes(ids);
      return e.getShape(ids[0]).parentId;
    });
    e.selectNone();
    return out as Record<string, [string, string]>;
  });
}

test("every drawn kind (rectangle, text, arrow, line, picture, web embed card, group) takes a link from the right-click menu and from Ctrl+K; both are kept after a reload, each with its icon", async ({ page }) => {
  await openWhiteboard(page);
  const shapes = await drawEveryKind(page);
  const want: Record<string, string> = {};
  for (const [kind, [a, b]] of Object.entries(shapes)) {
    await linkByMenu(page, a, `example.com/${kind}-menu`);
    await linkByKey(page, b, `https://example.com/${kind}-key`);
    want[a] = `https://example.com/${kind}-menu`;
    want[b] = `https://example.com/${kind}-key`;
  }
  await page.keyboard.press("Escape");
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  for (const [id, url] of Object.entries(want)) {
    expect(await meta(page, id), id).toBe(url);
    await expect(badge(page, id)).toHaveAttribute("href", url);
  }
});

test("a click on a linked item selects it and opens nothing; its icon opens the link in a new tab (noopener), and the icon never takes a resize", async ({ page, context }) => {
  await openWhiteboard(page);
  const id = await ed(page, (e) => {
    e.createShape({ type: "geo", x: 400, y: 300, props: { w: 200, h: 120, geo: "rectangle" } });
    return e.getCurrentPageShapes()[0].id as string;
  });
  const url = local(page, "rect");
  await linkByMenu(page, id, url);
  await page.keyboard.press("Escape");
  await ed(page, (e) => void e.selectNone());
  const m = await middle(page, id);
  expect(await opened(context, () => page.mouse.click(m.x, m.y))).toHaveLength(0);
  expect(await ed(page, (e) => e.getSelectedShapeIds())).toEqual([id]);
  // The icon sits above the item, clear of its top-right corner.
  const icon = await box(badge(page, id));
  const corner = await ed(page, (e, id) => e.pageToScreen({ x: e.getShapePageBounds(id).maxX, y: e.getShapePageBounds(id).minY }), id);
  expect(icon.y + icon.height).toBeLessThanOrEqual(corner.y - 6);
  expect(icon.x + icon.width).toBeLessThanOrEqual(corner.x - 12);
  const before = await ed(page, (e, id) => e.getShapePageBounds(id).w, id);
  const [popup] = await Promise.all([context.waitForEvent("page"), badge(page, id).click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe(url);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
  expect(await ed(page, (e, id) => e.getShapePageBounds(id).w, id)).toBe(before);
  // The corner still resizes.
  await page.mouse.move(corner.x, corner.y + 1);
  await page.mouse.down();
  await page.mouse.move(corner.x + 60, corner.y - 30, { steps: 6 });
  await page.mouse.up();
  expect(await ed(page, (e, id) => e.getShapePageBounds(id).w, id)).toBeGreaterThan(before + 40);
});

test("javascript: and data: links are refused with a short message, on the whiteboard, in Boardkit and in Linkkit; nothing is stored", async ({ page, context }) => {
  const mapId = await seedMap(context, "Root");
  await openWhiteboard(page);
  const id = await ed(page, (e) => {
    e.createShape({ type: "geo", x: 400, y: 300, props: { w: 200, h: 120, geo: "rectangle" } });
    return e.getCurrentPageShapes()[0].id as string;
  });
  await menu(page, await middle(page, id), /^Add link/);
  for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>"]) {
    await page.keyboard.press("Control+a");
    await page.keyboard.type(bad);
    await page.keyboard.press("Enter");
    await expect(wbPrompt(page).getByRole("alert")).toHaveText("Only http and https links are allowed.");
  }
  await page.keyboard.press("Escape");
  await expect(wbPrompt(page)).toHaveCount(0);
  expect(await meta(page, id)).toBeNull();

  // Boardkit: a card's link field.
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  const card = bk.locator("[data-card-id]").first();
  await card.click({ button: "right", position: { x: 6, y: 6 } });
  await bk.getByRole("menuitem", { name: /Add link/ }).click();
  await expect(appPrompt(bk).getByRole("textbox", { name: "Link" })).toBeFocused();
  await bk.keyboard.type("javascript:alert(1)");
  await bk.keyboard.press("Enter");
  await expect(appPrompt(bk).getByRole("alert")).toHaveText("Only http and https links are allowed.");
  await bk.keyboard.press("Escape");
  await bk.waitForTimeout(600);
  const cardId = await card.getAttribute("data-card-id");
  expect(await bk.evaluate((id) => Object.values(localStorage).some((v) => v.includes("javascript:alert") && v.includes(id!)), cardId)).toBe(false);

  // Linkkit: a box's link field.
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  const root = lk.locator("[data-box-id]").filter({ hasText: /^Root$/ });
  await root.click({ button: "right" });
  await lk.getByRole("menuitem", { name: /Add link/ }).click();
  await expect(appPrompt(lk).getByRole("textbox", { name: "Link" })).toBeFocused();
  await lk.keyboard.type("data:text/html,x");
  await lk.keyboard.press("Enter");
  await expect(appPrompt(lk).getByRole("alert")).toHaveText("Only http and https links are allowed.");
  await lk.keyboard.press("Escape");
  await lk.waitForTimeout(600);
  expect(await lk.evaluate((id) => localStorage.getItem(`linkkit:map:${id}`)!.includes("data:text"), mapId)).toBe(false);
});

test("pasting an address while typing in a text, a card or a box makes a link in that text, not a web embed; pasted on empty page it still makes an embed card", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await openWhiteboard(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const url = "https://example.com/pasted";
  const paste = async () => {
    await page.evaluate((t) => navigator.clipboard.writeText(t), url);
    await page.keyboard.press("Control+v");
  };
  const embeds = () => ed(page, (e) => e.getCurrentPageShapes().filter((s: any) => s.type === "web-embed").length);

  // A text on the whiteboard, being typed in.
  const textId = await ed(page, (e) => {
    e.createShape({ type: "text", x: 300, y: 200, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "See " }] }] } } });
    return e.getCurrentPageShapes()[0].id as string;
  });
  const t = await middle(page, textId);
  await page.mouse.dblclick(t.x, t.y);
  await expect.poll(() => ed(page, (e) => e.getEditingShapeId())).toBe(textId);
  await page.keyboard.press("End");
  await paste();
  await page.keyboard.press("Escape");
  await expect.poll(() => ed(page, (e, id) => JSON.stringify(e.getShape(id).props.richText), textId)).toContain(`"href":"${url}"`);
  expect(await embeds()).toBe(0);

  // A card's title on a board widget, being typed in.
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  const board = page.locator(".tl-html-container [data-boardkit-board]").first();
  await expect(board).toBeVisible();
  await page.waitForTimeout(400);
  const title = board.locator("[data-card-title] button").first();
  const tb = await box(title);
  await page.mouse.dblclick(tb.x + 6, tb.y + tb.height / 2);
  const field = page.locator('[data-boardkit-board][data-editing="true"] textarea').first();
  await expect(field).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type(" ");
  await paste();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-boardkit-board] [data-card-title] a[href="https://example.com/pasted"]').first()).toBeVisible();
  expect(await embeds()).toBe(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Empty page: an embed card, as before.
  await ed(page, (e) => void e.selectNone());
  await page.mouse.click(1250, 820);
  await page.mouse.move(1250, 820);
  await paste();
  await expect.poll(embeds).toBe(1);
});

test("a pasted address in a Linkkit box's name is a link there, not an embed", async ({ page, context }) => {
  const mapId = await seedMap(context, "Root");
  await openWhiteboard(page);
  await openMapList(page);
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  const map = page.locator('[data-linkkit-map] [data-map-view][data-ready]').first();
  await expect(map).toBeVisible();
  const b = await box(page.locator("[data-linkkit-map] [data-box-id]").first());
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('[data-linkkit-map][data-editing="true"]')).toBeVisible();
  const boxEl = page.locator('[data-linkkit-map][data-editing="true"] [data-box-id]').first();
  await boxEl.dblclick();
  const field = page.getByRole("textbox", { name: "Box name" });
  await expect(field).toBeFocused();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("https://example.com/box"));
  await page.keyboard.press("End");
  await page.keyboard.type(" ");
  await page.keyboard.press("Control+v");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-linkkit-map] [data-box-id] a[href="https://example.com/box"]').first()).toBeVisible();
  expect(await ed(page, (e) => e.getCurrentPageShapes().filter((s: any) => s.type === "web-embed").length)).toBe(0);
});

type BoardRec = { board: { url?: string; lists: Record<string, { url?: string; title: string }>; cards: Record<string, { url?: string; title: string }>; listOrder: string[]; cardOrder: Record<string, string[]> } };
const boardRec = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), id) as Promise<BoardRec>;

test("on the whiteboard, a board, a list and a card take links from the right-click menu and from Ctrl+K, kept in Boardkit's record after a reload; a card's icon opens its link from a board only shown, a click on the card just selects the board", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await openWhiteboard(page);
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  const board = page.locator(".tl-html-container [data-boardkit-board]").first();
  await expect(board).toBeVisible();
  await page.waitForTimeout(400);
  const shapeId = await ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board").id as string);
  const rec = () => boardRec(page, boardId);
  const [firstList, secondList] = (await rec()).board.listOrder;
  const cardsOf = async (l: string) => (await rec()).board.cardOrder[l];
  const [card1, card2] = await cardsOf(firstList);

  // Right-click on a card, a list header and the board (not edited).
  const cardEl = (id: string) => board.locator(`[data-card-id="${id}"]`);
  const cb = await box(cardEl(card1));
  await menu(page, { x: cb.x + 8, y: cb.y + cb.height / 2 }, /^Add link to card/);
  await fill(page, wbPrompt(page), local(page, "card1"));
  const hb = await box(board.locator(`section[data-list-id="${firstList}"] [data-list-header]`));
  await menu(page, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, /^Add link to list/);
  await fill(page, wbPrompt(page), "https://example.com/list1");
  const bb = await box(board);
  await menu(page, { x: bb.x + bb.width - 4, y: bb.y + bb.height - 4 }, /^Add link to board/);
  await fill(page, wbPrompt(page), "https://example.com/board-menu");
  await expect.poll(async () => (await rec()).board.cards[card1].url).toBe(local(page, "card1"));
  expect((await rec()).board.lists[firstList].url).toBe("https://example.com/list1");
  expect((await rec()).board.url).toBe("https://example.com/board-menu");
  await expect(badge(page, shapeId)).toHaveAttribute("href", "https://example.com/board-menu");

  // Ctrl+K: the board widget selected → the board's link.
  await page.keyboard.press("Escape");
  await ed(page, (e) => void e.selectNone());
  await page.mouse.click(bb.x + bb.width - 4, bb.y + bb.height - 4);
  await page.keyboard.press("Control+k");
  await fill(page, wbPrompt(page), "https://example.com/board-key");
  await expect.poll(async () => (await rec()).board.url).toBe("https://example.com/board-key");
  // Ctrl+K inside the board being edited: a focused card, a focused list header.
  await page.mouse.dblclick(bb.x + bb.width - 4, bb.y + bb.height - 4);
  const editing = page.locator('[data-boardkit-board][data-editing="true"]');
  await expect(editing).toBeVisible();
  await editing.locator(`[data-card-id="${card2}"]`).focus();
  await page.keyboard.press("Control+k");
  await fill(page, appPrompt(page), "https://example.com/card2");
  await editing.locator(`section[data-list-id="${secondList}"] [data-list-header]`).focus();
  await page.keyboard.press("Control+k");
  await fill(page, appPrompt(page), "https://example.com/list2");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await rec()).board.cards[card2].url).toBe("https://example.com/card2");
  expect((await rec()).board.lists[secondList].url).toBe("https://example.com/list2");

  // After a reload: kept, with their icons.
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(board).toBeVisible();
  for (const [id, url] of [[card1, local(page, "card1")], [card2, "https://example.com/card2"]]) {
    await expect(board.locator(`[data-card-id="${id}"] a[aria-label^="Open link"]`)).toHaveAttribute("href", url);
  }
  await expect(board.locator(`section[data-list-id="${firstList}"] [data-list-header] a[aria-label^="Open link"]`)).toHaveAttribute("href", "https://example.com/list1");
  await expect(badge(page, shapeId)).toHaveAttribute("href", "https://example.com/board-key");

  // The board is only shown: a click on the card selects the board and
  // opens nothing; a click on its icon opens the card's link.
  await ed(page, (e) => void e.selectNone());
  const c = await box(board.locator(`[data-card-id="${card1}"]`));
  expect(await opened(context, () => page.mouse.click(c.x + 8, c.y + c.height / 2))).toHaveLength(0);
  expect(await ed(page, (e) => e.getSelectedShapeIds())).toEqual([shapeId]);
  await ed(page, (e) => void e.selectNone());
  const icon = await box(board.locator(`[data-card-id="${card1}"] a[aria-label^="Open link"]`));
  const pages = await opened(context, () => page.mouse.click(icon.x + icon.width / 2, icon.y + icon.height / 2));
  expect(pages).toHaveLength(1);
  await pages[0].waitForLoadState();
  expect(pages[0].url()).toBe(local(page, "card1"));
  expect(await pages[0].evaluate(() => window.opener)).toBeNull();
  expect(await ed(page, (e) => e.getSelectedShapeIds())).toEqual([]);
  await pages[0].close();
});

test("on /boardkit, a board, a list and a card take links from the right-click menu and from Ctrl+K, kept after a reload; edit and remove work; a duplicated list keeps them", async ({ page, context }) => {
  await seedBoard(context);
  await page.goto("/boardkit/");
  await expect(page.getByRole("button", { name: "Switch board" })).toBeVisible();
  const boardId = await page.evaluate(() => (JSON.parse(localStorage.getItem("boardkit:registry")!) as { activeBoardId: string }).activeBoardId);
  const rec = () => boardRec(page, boardId);
  const [list1, list2] = (await rec()).board.listOrder;
  const [card1, card2] = (await rec()).board.cardOrder[list1];
  const cardEl = (id: string) => page.locator(`[data-card-id="${id}"]`);
  const header = (id: string) => page.locator(`section[data-list-id="${id}"] [data-list-header]`);

  await cardEl(card1).click({ button: "right", position: { x: 6, y: 6 } });
  await page.getByRole("menuitem", { name: /Add link/ }).click();
  await fill(page, appPrompt(page), "example.com/card1");
  await cardEl(card2).focus();
  await page.keyboard.press("Control+k");
  await fill(page, appPrompt(page), "https://example.com/card2");
  await header(list1).locator("[class*=count]").click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Add link/ }).click();
  await fill(page, appPrompt(page), "https://example.com/list1");
  await header(list2).focus();
  await page.keyboard.press("Control+k");
  await fill(page, appPrompt(page), "https://example.com/list2");
  await page.locator("[data-board-name]").click({ button: "right", position: { x: 2, y: 2 } });
  await page.getByRole("menuitem", { name: /Add link/ }).click();
  await fill(page, appPrompt(page), "https://example.com/board-menu");
  await page.getByRole("button", { name: "Board name" }).focus();
  await page.keyboard.press("Control+k");
  await fill(page, appPrompt(page), "https://example.com/board-key");

  await expect.poll(async () => (await rec()).board.url).toBe("https://example.com/board-key");
  const r = (await rec()).board;
  expect([r.cards[card1].url, r.cards[card2].url, r.lists[list1].url, r.lists[list2].url]).toEqual([
    "https://example.com/card1",
    "https://example.com/card2",
    "https://example.com/list1",
    "https://example.com/list2",
  ]);
  await page.reload();
  await expect(cardEl(card1).locator('a[aria-label^="Open link"]')).toHaveAttribute("href", "https://example.com/card1");
  await expect(header(list2).locator('a[aria-label^="Open link"]')).toHaveAttribute("href", "https://example.com/list2");
  await expect(page.locator('[data-board-name] a[aria-label^="Open link"]')).toHaveAttribute("href", "https://example.com/board-key");

  // A click on the card opens nothing; its icon opens a new tab.
  expect(await opened(context, () => cardEl(card1).click({ position: { x: 6, y: 6 } }))).toHaveLength(0);

  // Edit, then remove.
  await cardEl(card1).click({ button: "right", position: { x: 6, y: 6 } });
  await page.getByRole("menuitem", { name: /Edit link/ }).click();
  await expect(appPrompt(page).getByRole("textbox", { name: "Link" })).toHaveValue("https://example.com/card1");
  await fill(page, appPrompt(page), "https://example.com/card1-edited");
  await expect.poll(async () => (await rec()).board.cards[card1].url).toBe("https://example.com/card1-edited");
  await cardEl(card2).click({ button: "right", position: { x: 6, y: 6 } });
  await page.getByRole("menuitem", { name: /Remove link/ }).click();
  await expect.poll(async () => (await rec()).board.cards[card2].url ?? null).toBeNull();
  await expect(cardEl(card2).locator('a[aria-label^="Open link"]')).toHaveCount(0);

  // A duplicated list keeps its link and its cards'.
  await header(list1).focus();
  await page.keyboard.press("d");
  await expect.poll(async () => (await rec()).board.listOrder.length).toBe(r.listOrder.length + 1);
  const after = (await rec()).board;
  const copy = after.listOrder[after.listOrder.indexOf(list1) + 1];
  expect(after.lists[copy].url).toBe("https://example.com/list1");
  expect(after.cards[after.cardOrder[copy][0]].url).toBe("https://example.com/card1-edited");
});

type MapRec = { map: { nodes: Record<string, { name: string; url?: string }> } };
const mapRec = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`linkkit:map:${id}`)!), id) as Promise<MapRec>;
const nodeByName = async (page: Page, mapId: string, name: string) => Object.entries((await mapRec(page, mapId)).map.nodes).find(([, n]) => n.name === name)!;

test("map boxes take links from the right-click menu and from Ctrl+K, on the whiteboard and on /linkkit, kept after a reload; a box's icon opens its link from a map only shown; the map widget itself takes one too", async ({ page, context }) => {
  const mapId = await seedMap(context, "Root");
  // /linkkit: a second box, then a link on each.
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  const root = lk.locator("[data-box-id]").filter({ hasText: /^Root$/ });
  await root.hover();
  await root.getByRole("button", { name: "Add a child", exact: true }).click();
  await lk.keyboard.type("Child");
  await lk.keyboard.press("Enter");
  const child = lk.locator("[data-box-id]").filter({ hasText: /^Child$/ });
  await root.click({ button: "right" });
  await lk.getByRole("menuitem", { name: /Add link/ }).click();
  await fill(lk, appPrompt(lk), "https://example.com/root-lk");
  await child.click();
  await lk.keyboard.press("Control+k");
  await fill(lk, appPrompt(lk), "https://example.com/child-lk");
  await expect.poll(async () => (await nodeByName(lk, mapId, "Child"))[1].url).toBe("https://example.com/child-lk");
  expect((await nodeByName(lk, mapId, "Root"))[1].url).toBe("https://example.com/root-lk");
  await lk.reload();
  await expect(lk.locator("[data-box-id]").filter({ hasText: /^Root$/ }).locator('a[aria-label^="Open link"]')).toHaveAttribute("href", "https://example.com/root-lk");
  await lk.close();

  // The whiteboard: the same map, shown; links changed from its menu and Ctrl+K.
  await openWhiteboard(page);
  await openMapList(page);
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  const map = page.locator("[data-linkkit-map]").first();
  await expect(map.locator("[data-map-view][data-ready]")).toBeVisible();
  await page.waitForTimeout(400);
  const shapeId = await ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "linkkit-map").id as string);
  const boxEl = (name: string) => map.locator("[data-box-id]").filter({ hasText: new RegExp(`^${name}$`) });
  const rb = await box(boxEl("Root"));
  await page.mouse.click(rb.x + 4, rb.y + rb.height / 2, { button: "right" });
  await page.getByRole("menuitem", { name: /^Edit box link/ }).click();
  await fill(page, wbPrompt(page), local(page, "root"));
  await expect.poll(async () => (await nodeByName(page, mapId, "Root"))[1].url).toBe(local(page, "root"));
  // Ctrl+K inside the map being edited: the selected box.
  await page.keyboard.press("Escape");
  const cb = await box(boxEl("Child"));
  await page.mouse.dblclick(cb.x + cb.width / 2, cb.y + cb.height / 2 + 30);
  await expect(page.locator('[data-linkkit-map][data-editing="true"]')).toBeVisible();
  await page.locator('[data-linkkit-map][data-editing="true"] [data-box-id]').filter({ hasText: /^Child$/ }).click();
  await page.keyboard.press("Control+k");
  await fill(page, appPrompt(page), "https://example.com/child-wb");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await nodeByName(page, mapId, "Child"))[1].url).toBe("https://example.com/child-wb");
  // The map widget itself, with Ctrl+K: a drawn item's link.
  await linkByKey(page, shapeId, "https://example.com/map-widget");
  await page.keyboard.press("Escape");

  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(map.locator("[data-map-view][data-ready]")).toBeVisible();
  expect(await meta(page, shapeId)).toBe("https://example.com/map-widget");
  await expect(badge(page, shapeId)).toHaveAttribute("href", "https://example.com/map-widget");
  await expect(boxEl("Child").locator('a[aria-label^="Open link"]')).toHaveAttribute("href", "https://example.com/child-wb");

  // Shown, not edited: a click on the box selects the map; its icon opens the link.
  await ed(page, (e) => void e.selectNone());
  const r2 = await box(boxEl("Root"));
  expect(await opened(context, () => page.mouse.click(r2.x + 6, r2.y + r2.height / 2))).toHaveLength(0);
  expect(await ed(page, (e) => e.getSelectedShapeIds())).toEqual([shapeId]);
  await ed(page, (e) => void e.selectNone());
  const icon = await box(boxEl("Root").locator('a[aria-label^="Open link"]'));
  const pages = await opened(context, () => page.mouse.click(icon.x + icon.width / 2, icon.y + icon.height / 2));
  expect(pages.map((p) => p.url())).toEqual([local(page, "root")]);
  await pages[0].close();
});

test("links survive copy and paste, duplicate, undo and redo, and edit and remove work, on drawn items and on a card shown on the whiteboard", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await openWhiteboard(page);
  const id = await ed(page, (e) => {
    e.createShape({ type: "geo", x: 300, y: 300, props: { w: 160, h: 100, geo: "rectangle" } });
    return e.getCurrentPageShapes()[0].id as string;
  });
  await linkByMenu(page, id, "https://example.com/a");
  const urls = () => ed(page, (e) => e.getCurrentPageShapes().filter((s: any) => s.type === "geo").map((s: any) => s.meta?.url ?? null));
  // Undo takes the link away, redo puts it back.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(() => meta(page, id)).toBeNull();
  await page.keyboard.press("Control+y");
  await expect.poll(() => meta(page, id)).toBe("https://example.com/a");
  // Duplicate, copy and paste. (A click on an item already selected
  // starts typing in it: from nothing selected each time.)
  const m = await middle(page, id);
  const pick = async () => {
    await page.keyboard.press("Escape");
    await ed(page, (e) => void e.selectNone());
    await page.mouse.click(m.x, m.y);
  };
  await pick();
  await page.keyboard.press("Control+d");
  await expect.poll(urls).toEqual(["https://example.com/a", "https://example.com/a"]);
  // Copy and paste: what tldraw puts on the clipboard (its content as
  // JSON) and takes back. Done through tldraw's own content calls: the
  // headless browser's system clipboard is shared with other tests.
  await ed(page, (e, id) => void e.putContentOntoCurrentPage(JSON.parse(JSON.stringify(e.getContentFromCurrentPage([id]))), { point: { x: 900, y: 600 }, select: true }), id);
  await expect.poll(urls).toEqual(["https://example.com/a", "https://example.com/a", "https://example.com/a"]);
  // Edit, then remove.
  await page.keyboard.press("Escape");
  await menu(page, m, /^Edit link/);
  await expect(wbPrompt(page).getByRole("textbox", { name: "Link" })).toHaveValue("https://example.com/a");
  await fill(page, wbPrompt(page), "https://example.com/b");
  expect(await meta(page, id)).toBe("https://example.com/b");
  await menu(page, m, /^Remove link/);
  await expect.poll(() => meta(page, id)).toBeNull();
  await expect(badge(page, id)).toHaveCount(0);

  // A card on a board widget: its link is one step of the page's undo.
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  const board = page.locator(".tl-html-container [data-boardkit-board]").first();
  await expect(board).toBeVisible();
  await page.waitForTimeout(400);
  const rec = () => boardRec(page, boardId);
  const card = (await rec()).board.cardOrder[(await rec()).board.listOrder[0]][0];
  const cb = await box(board.locator(`[data-card-id="${card}"]`));
  await menu(page, { x: cb.x + 8, y: cb.y + cb.height / 2 }, /^Add link to card/);
  await fill(page, wbPrompt(page), "https://example.com/card");
  await expect.poll(async () => (await rec()).board.cards[card].url).toBe("https://example.com/card");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await rec()).board.cards[card].url ?? null).toBeNull();
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await rec()).board.cards[card].url).toBe("https://example.com/card");
  await expect(board.locator(`[data-card-id="${card}"] a[aria-label^="Open link"]`)).toHaveAttribute("href", "https://example.com/card");
});

test("a backup restore brings links back: a drawn item's and a card's", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await openWhiteboard(page);
  const id = await ed(page, (e) => {
    e.createShape({ type: "geo", x: 300, y: 300, props: { w: 160, h: 100, geo: "rectangle" } });
    return e.getCurrentPageShapes()[0].id as string;
  });
  await linkByMenu(page, id, "https://example.com/kept");
  await page.keyboard.press("Escape");
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  const cardEl = bk.locator("[data-card-id]").first();
  const card = (await cardEl.getAttribute("data-card-id"))!;
  await cardEl.focus();
  await bk.keyboard.press("Control+k");
  await fill(bk, appPrompt(bk), "https://example.com/card-kept");
  await expect.poll(async () => (await boardRec(bk, boardId)).board.cards[card].url).toBe("https://example.com/card-kept");
  await bk.close();
  await whiteboardSaved(page);

  await page.goto("/backup/");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save a backup" }).click()]);
  await expect(page.getByRole("status")).toContainText("Saved");
  const file = await readFile((await download.path())!, "utf-8");

  // Both links removed, then the backup restored.
  await openWhiteboard(page);
  await menu(page, await middle(page, id), /^Remove link/);
  await whiteboardSaved(page);
  await page.evaluate(([id, card]) => {
    const key = `boardkit:board:${id}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    delete rec.board.cards[card].url;
    localStorage.setItem(key, JSON.stringify(rec));
  }, [boardId, card]);
  await page.goto("/backup/");
  await page.getByLabel("Backup file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(file) });
  const dialog = page.getByRole("dialog", { name: "Replace what's here with this backup?" });
  await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Replace with this backup" }).click()]);
  await expect(page.getByRole("status")).toContainText("Restored");
  expect((await boardRec(page, boardId)).board.cards[card].url).toBe("https://example.com/card-kept");
  await openWhiteboard(page);
  await expect.poll(() => meta(page, id)).toBe("https://example.com/kept");
  await expect(badge(page, id)).toBeVisible();
});
