import { expect, test, type Locator, type Page } from "@playwright/test";

import { box, seedBoard } from "./helpers";

/**
 * The board widget on the whiteboard, phase 2.5 (docs/PHASE-2.5.md items
 * 15-20): slim "+" buttons, hover-only list controls, the "⋯" list menu,
 * the name shown on hover or selection, lists as tall as their content.
 * All of it is Boardkit's whiteboard mode; standalone /boardkit is checked
 * unchanged. Fresh, empty browser profile per test; the board is Boardkit's
 * first-visit board (or a new one made here). Actions go through the mouse
 * and keyboard; storage and `window.editor` are only read to check.
 */

type Rec = { board: { lists: Record<string, { title: string }>; cards: Record<string, { title: string }>; listOrder: string[]; cardOrder: Record<string, string[]> } };
const record = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), id) as Promise<Rec>;
async function saved(page: Page, id: string, check: (r: Rec) => boolean) {
  await expect.poll(async () => check(await record(page, id)), { timeout: 8_000 }).toBe(true);
  return record(page, id);
}

const shapeOf = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).editor;
    const s = e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board");
    return s ? { id: s.id as string, x: s.x as number, y: s.y as number, w: s.props.w as number, h: s.props.h as number, scale: s.props.scale as number } : null;
  });
/** The shape's box on screen. */
const shapeOnScreen = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).editor;
    const s = e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board");
    const a = e.pageToScreen({ x: s.x, y: s.y });
    const b = e.pageToScreen({ x: s.x + s.props.w, y: s.y + s.props.h });
    const c = e.getContainer().getBoundingClientRect();
    return { x: a.x - c.x, y: a.y - c.y, right: b.x - c.x, bottom: b.y - c.y };
  });

const boardEl = (page: Page) => page.locator(".tl-html-container [data-boardkit-board]").first();
const editingEl = (page: Page) => page.locator('[data-boardkit-board][data-editing="true"]');
const lists = (page: Page) => boardEl(page).locator("section[data-list-id]");
const opacity = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).opacity));
const visibility = (l: Locator) => l.evaluate((el) => getComputedStyle(el).visibility);

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Puts board `id` on the page (selected, as placing leaves it). */
async function placeBoard(page: Page, id: string) {
  await page.getByTestId("tools.board").click();
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  await expect(boardEl(page)).toBeVisible();
  await expect.poll(async () => (await shapeOf(page))?.scale ?? 0).toBeGreaterThan(0);
  await page.waitForTimeout(300);
}

/** Nothing selected and the pointer well away from the board. */
async function leaveBoard(page: Page) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).editor.selectNone());
  const b = await box(boardEl(page));
  const vp = page.viewportSize()!;
  const y = b.y > 120 ? b.y - 80 : Math.min(vp.height - 90, b.y + b.height + 60);
  await page.mouse.move(vp.width / 2, y, { steps: 3 });
}

/** A seed board shown at 100% scale, so its parts are easy to point at. */
async function setUp(page: Page, context: Parameters<typeof seedBoard>[0]) {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  await placeBoard(page, id);
  return id;
}

test("15: Boardkit's add buttons carry fixed markers, and standalone /boardkit looks as before (full buttons, × in the header, no slim +, no ⋯)", async ({ page, context }) => {
  const id = await setUp(page, context);
  // On the whiteboard: one list marker, one card marker per list with cards.
  await expect(boardEl(page).locator('[data-add="list"]')).toHaveCount(1);
  await expect(boardEl(page).locator('[data-add="card"]')).toHaveCount((await record(page, id)).board.listOrder.length);
  // Standalone Boardkit.
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  await expect(bk.getByRole("button", { name: "Switch board" })).toBeVisible();
  await expect(bk.locator('[data-add="list"]')).toHaveText("+ Add a list");
  await expect(bk.locator('[data-add="card"]').first()).toHaveText("+ Add a card");
  await expect(bk.locator("[data-slim]")).toHaveCount(0);
  await expect(bk.getByRole("button", { name: "List actions", exact: true })).toHaveCount(0);
  await expect(bk.getByRole("button", { name: "Delete list", exact: true }).first()).toBeVisible();
  await expect(bk.getByRole("button", { name: "Customise list", exact: true }).first()).toBeVisible();
  await bk.close();
});

test("16: '+ Add a list' is a faint ghost column beside the last list, as tall as it, outside the widget's box; shown on hover or selection; a press adds a list", async ({ page, context }) => {
  const id = await setUp(page, context);
  const plus = boardEl(page).locator('[data-add="list"]');
  await expect(plus).toHaveAttribute("data-slim", "");
  await expect(plus).toHaveText("+");
  // The box takes no room for it: it ends at the last list. The ghost is
  // clearly outside it (a gap, not on the border), as tall as the last
  // list, its top in line with the list.
  const last = await box(lists(page).last());
  const s = await shapeOnScreen(page);
  expect(Math.abs(s.right - (last.x + last.width))).toBeLessThan(2);
  const p = await box(plus);
  expect(p.x).toBeGreaterThan(s.right + 2);
  expect(Math.abs(p.y - last.y)).toBeLessThan(2);
  expect(Math.abs(p.height - last.height)).toBeLessThan(2);
  // Its "+" at the top, in line with the list titles.
  const plusTop = await plus.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().top;
  });
  const titleTop = (await box(lists(page).last().locator("[data-list-header] h2"))).y;
  expect(Math.abs(plusTop - titleTop)).toBeLessThan(10);
  // Selected: shown. Not selected, pointer away: hidden. Pointer over: shown.
  await expect.poll(() => opacity(plus)).toBe(1);
  await leaveBoard(page);
  await expect.poll(() => opacity(plus)).toBe(0);
  const first = await box(lists(page).first());
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2, { steps: 3 });
  await expect.poll(() => opacity(plus)).toBe(1);
  // A press on it (the board not being edited) opens the field; Enter adds.
  const before = (await record(page, id)).board.listOrder.length;
  const at = await box(plus);
  await page.mouse.move(at.x + at.width / 2, at.y + 20, { steps: 3 });
  await page.mouse.down();
  await page.mouse.up();
  await expect(editingEl(page)).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Add a list" })).toBeFocused();
  await page.keyboard.type("ZZ slim list");
  await page.keyboard.press("Enter");
  const rec = await saved(page, id, (r) => r.board.listOrder.length === before + 1);
  expect(rec.board.lists[rec.board.listOrder.at(-1)!].title).toBe("ZZ slim list");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(editingEl(page)).toHaveCount(0);
  // Still hugging the lists, with the new one; the ghost follows the new
  // last list's height.
  const newLast = await box(lists(page).last());
  expect(Math.abs((await shapeOnScreen(page)).right - (newLast.x + newLast.width))).toBeLessThan(2);
  await expect.poll(async () => Math.round((await box(plus)).height)).toBe(Math.round(newLast.height));
});

test("16: '+ Add a card' is a faint full-width row inside the list at its bottom, only on the list under the pointer, stronger when pointed at; the list never grows for it", async ({ page, context }) => {
  const id = await setUp(page, context);
  await leaveBoard(page);
  const [a, b] = [lists(page).nth(0), lists(page).nth(1)];
  const plusA = a.locator('[data-add="card"]');
  const plusB = b.locator('[data-add="card"]');
  await expect(plusA).toHaveAttribute("data-slim", "");
  await expect.poll(() => opacity(plusA)).toBe(0);
  const ra = await box(a);
  await page.mouse.move(ra.x + ra.width / 2, ra.y + 20, { steps: 3 });
  await expect.poll(() => opacity(plusA)).toBe(1);
  expect(await opacity(plusB)).toBe(0);
  // Showing it changes nothing about the list's size.
  expect(await box(a)).toEqual(ra);
  // Clearly inside the list (not on its border), full width, below the last card.
  const pa = await box(plusA);
  expect(pa.x).toBeGreaterThan(ra.x + 2);
  expect(pa.x + pa.width).toBeLessThan(ra.x + ra.width - 2);
  expect(pa.y + pa.height).toBeLessThan(ra.y + ra.height - 2);
  expect(pa.width).toBeGreaterThan(ra.width - 30);
  const lastCard = await box(a.locator("article[data-card-id]").last());
  expect(pa.y).toBeGreaterThanOrEqual(lastCard.y + lastCard.height);
  // The tallest list's bottom is the box's bottom.
  const bottoms = await lists(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
  expect(Math.abs((await shapeOnScreen(page)).bottom - Math.max(...bottoms))).toBeLessThan(2);
  // Pointed at, a bit stronger.
  const faint = await plusA.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.mouse.move(pa.x + pa.width / 2, pa.y + pa.height / 2, { steps: 3 });
  // (Hover styles apply once the board is edited; not edited, the row only shows.)
  // Pressed: the field opens in that list; Enter adds the card there.
  const listId = (await a.getAttribute("data-list-id"))!;
  const before = (await record(page, id)).board.cardOrder[listId].length;
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByRole("textbox", { name: "Add a card" })).toBeFocused();
  await page.keyboard.type("ZZ slim card");
  await page.keyboard.press("Enter");
  const rec = await saved(page, id, (r) => r.board.cardOrder[listId].length === before + 1);
  expect(rec.board.cards[rec.board.cardOrder[listId].at(-1)!].title).toBe("ZZ slim card");
  await page.keyboard.press("Escape");
  // While editing, pointing at the row of another list makes it stronger.
  await expect(editingEl(page)).toHaveCount(1);
  const rb = await box(b);
  await page.mouse.move(rb.x + rb.width / 2, rb.y + 20, { steps: 3 });
  await expect.poll(() => opacity(plusB)).toBe(1);
  const pb = await box(plusB);
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2, { steps: 3 });
  await expect.poll(() => plusB.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(faint);
});

test("16, 20: a board with no lists shows the full '+ Add a list'; an empty list shows the full '+ Add a card' and is just its header and that button", async ({ page }) => {
  await openWhiteboard(page);
  await page.getByTestId("tools.board").click();
  await page.getByTestId("new-board").click({ timeout: 10_000 });
  await page.keyboard.press("Enter");
  await expect(boardEl(page)).toBeVisible();
  const addList = boardEl(page).locator('[data-add="list"]');
  await expect(addList).toHaveText("+ Add a list");
  await expect(addList).not.toHaveAttribute("data-slim");
  // Its first list, added on the whiteboard.
  const b = await box(addList);
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByRole("textbox", { name: "Add a list" })).toBeFocused();
  await page.keyboard.type("ZZ empty");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(lists(page)).toHaveCount(1);
  const list = lists(page).first();
  const addCard = list.locator('[data-add="card"]');
  await expect(addCard).toHaveText("+ Add a card");
  await expect(addCard).not.toHaveAttribute("data-slim");
  await expect(boardEl(page).locator('[data-add="list"]')).toHaveAttribute("data-slim", "");
  // Header + the button (and the list's own padding), nothing more.
  const l = await box(list);
  const h = await box(list.locator("[data-list-header]"));
  const add = await box(addCard);
  expect(l.height).toBeLessThanOrEqual(h.height + add.height + 24);
});

test("17: a list header shows its title and count; the other controls only while the pointer is over that header", async ({ page, context }) => {
  await setUp(page, context);
  await leaveBoard(page);
  const [a, b] = [lists(page).nth(0), lists(page).nth(1)];
  const controls = (l: Locator) => l.locator("[data-list-header] > button");
  expect(await controls(a).count()).toBeGreaterThanOrEqual(4);
  for (const l of [a, b]) {
    await expect(l.locator("[data-list-header] h2")).toBeVisible();
    await expect(l.locator("[data-list-header] > span").last()).toBeVisible();
    for (const c of await controls(l).all()) expect(await visibility(c)).toBe("hidden");
  }
  // Over list a's cards: still hidden. Over its header: shown, b's still hidden.
  const ra = await box(a);
  await page.mouse.move(ra.x + ra.width / 2, ra.y + ra.height - 20, { steps: 3 });
  await page.waitForTimeout(100);
  for (const c of await controls(a).all()) expect(await visibility(c)).toBe("hidden");
  // The count sits at the header's right end; title and count stay put
  // when the controls show (they appear before the count, clear of it).
  const header = a.locator("[data-list-header]");
  const count = header.locator("> span").last();
  const title = header.locator("h2");
  const ha = await box(header);
  const countBefore = await box(count);
  const titleBefore = await box(title);
  const padRight = await header.evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
  expect(Math.abs(countBefore.x + countBefore.width - (ha.x + ha.width - padRight))).toBeLessThan(2);
  await page.mouse.move(ha.x + 20, ha.y + ha.height / 2, { steps: 3 });
  await expect.poll(async () => Promise.all((await controls(a).all()).map(visibility))).toEqual((await controls(a).all()).map(() => "visible"));
  expect(await box(count)).toEqual(countBefore);
  expect(await box(title)).toEqual(titleBefore);
  for (const c of await controls(a).all()) {
    const cb = await box(c);
    expect(cb.x + cb.width).toBeLessThanOrEqual(countBefore.x + 0.5);
    expect(cb.x).toBeGreaterThanOrEqual(titleBefore.x + titleBefore.width - 0.5);
  }
  for (const c of await controls(b).all()) expect(await visibility(c)).toBe("hidden");
  // Also while the board is edited.
  await page.mouse.dblclick(ra.x + ra.width / 2, ra.y + ra.height - 30);
  await expect(editingEl(page)).toHaveCount(1);
  for (const c of await controls(b).all()) expect(await visibility(c)).toBe("hidden");
  const hb = await box(b.locator("[data-list-header]"));
  await page.mouse.move(hb.x + 20, hb.y + hb.height / 2, { steps: 3 });
  await expect.poll(() => visibility(controls(b).first())).toBe("visible");
});

test("18: the header's x is gone; '⋯' opens the list's menu with Delete list…; Ctrl+Z brings a deleted list back", async ({ page, context }) => {
  const id = await setUp(page, context);
  const a = lists(page).first();
  const listId = (await a.getAttribute("data-list-id"))!;
  const title = (await record(page, id)).board.lists[listId].title;
  await expect(a.getByRole("button", { name: "Delete list", exact: true })).toHaveCount(0);
  const card = await box(a.locator("article[data-card-id]").first());
  await page.mouse.dblclick(card.x + card.width / 2, card.y + card.height / 2);
  await expect(editingEl(page)).toHaveCount(1);
  await page.keyboard.press("Escape"); // leave the card title, stay in the board
  await expect(editingEl(page)).toHaveCount(1);
  const h = await box(a.locator("[data-list-header]"));
  await page.mouse.move(h.x + 20, h.y + h.height / 2, { steps: 3 });
  await a.getByRole("button", { name: "List actions", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Duplicate list" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Delete list…" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await saved(page, id, (r) => !r.board.listOrder.includes(listId));
  await expect(boardEl(page).locator(`section[data-list-id="${listId}"]`)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  const back = await saved(page, id, (r) => r.board.listOrder.includes(listId));
  expect(back.board.lists[listId].title).toBe(title);
  await expect(boardEl(page).locator(`section[data-list-id="${listId}"]`)).toHaveCount(1);
});

test("19: the board's name shows on hover or while selected, hidden otherwise (its room kept)", async ({ page, context }) => {
  await setUp(page, context);
  const name = page.locator(".gb-name");
  await expect.poll(() => opacity(name)).toBe(1); // selected
  const before = await box(lists(page).first());
  await leaveBoard(page);
  await expect.poll(() => opacity(name)).toBe(0);
  expect(await box(lists(page).first())).toEqual(before); // nothing moved
  const l = await box(lists(page).first());
  await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2, { steps: 3 });
  await expect.poll(() => opacity(name)).toBe(1);
  await leaveBoard(page);
  await expect.poll(() => opacity(name)).toBe(0);
  // Selected by a click: shown.
  await page.mouse.click(l.x + l.width / 2, l.y + 40);
  await leaveBoard(page).catch(() => {});
  await page.evaluate(() => {
    const e = (window as any).editor;
    e.select(e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board").id);
  });
  await expect.poll(() => opacity(name)).toBe(1);
});

test("21: a board edit on the whiteboard that can't be saved (storage full) shows the banner and a Leave-site prompt; with room again, Try again saves it and the banner goes", async ({ page, context }) => {
  const id = await setUp(page, context);
  const cardId = (await record(page, id)).board.cardOrder[(await record(page, id)).board.listOrder[0]][0];
  // Fill this site's localStorage to the brim.
  const filled = await page.evaluate(() => {
    const keys: string[] = [];
    for (const size of [1 << 20, 1 << 16, 1 << 10, 64, 1]) {
      const chunk = "x".repeat(size);
      for (;;) {
        const key = `e2e:fill:${keys.length}`;
        try {
          localStorage.setItem(key, chunk);
          keys.push(key);
        } catch {
          break;
        }
      }
    }
    return keys;
  });
  expect(filled.length).toBeGreaterThan(0);
  await expect(page.locator("[data-save-failed]")).toHaveCount(0);
  // Rename a card in place, to a much longer title: a write that replaces a
  // key only needs room for what it adds.
  const long = "ZZ saved later " + "x".repeat(400);
  const title = page.locator(`[data-boardkit-board] article[data-card-id="${cardId}"] [data-card-title]`);
  const t = await box(title);
  await page.mouse.dblclick(t.x + 10, t.y + t.height / 2);
  await expect(editingEl(page)).toHaveCount(1);
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(long);
  await page.keyboard.press("Enter");
  const banner = page.locator("[data-save-failed]");
  await expect(banner).toBeVisible({ timeout: 5_000 });
  await expect(banner).toContainText("aren't being saved");
  expect((await record(page, id)).board.cards[cardId].title).not.toBe(long);
  // Closing the tab asks first.
  const asked = new Promise<string>((resolve) => page.once("dialog", (d) => (resolve(d.type()), void d.dismiss())));
  await page.close({ runBeforeUnload: true });
  expect(await asked).toBe("beforeunload");
  expect(page.isClosed()).toBe(false);
  // Room again: Try again stores the edit, and the banner goes.
  await page.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), filled);
  await banner.getByRole("button", { name: "Try again" }).click();
  await expect(banner).toHaveCount(0);
  await saved(page, id, (r) => r.board.cards[cardId].title === long);
});
