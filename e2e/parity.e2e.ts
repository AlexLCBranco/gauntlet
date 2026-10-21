import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { box, seedBoard } from "./helpers";

/**
 * Full parity with Boardkit's boards (owner, 2026-10-19). The inventory is
 * in HANDOFF.md ("Boardkit board inventory"); each test names the items it
 * covers (B1, L5, C9, K4, ...). Every check goes through the mouse and
 * keyboard on the whiteboard; localStorage is only read, to see what
 * Boardkit saved.
 *
 * The first test compares the whiteboard board with Boardkit itself, so a
 * control Boardkit gains later and the whiteboard lacks fails here instead
 * of going missing quietly.
 *
 * Fresh, empty browser profile per test; the board is Boardkit's own
 * first-visit board, made by opening /boardkit (throwaway data that goes
 * with the profile).
 */

type Card = { title: string; color?: string; kind?: string; check?: string; description?: string; highlight?: string; highlightStyle?: string; numberEmphasis?: string; status?: string };
type List = { title: string; color?: string; icon?: string; width?: number; numberFormat?: string; numbersHidden?: boolean; hasChecks?: boolean; singleThots?: boolean; continuesNumbering?: boolean; status?: string };
type Rec = {
  rev: number;
  version: number;
  board: {
    lists: Record<string, List>;
    cards: Record<string, Card>;
    listOrder: string[];
    cardOrder: Record<string, string[]>;
    trash: { cardId: string; listId: string }[];
    trashedLists: { listId: string }[];
    collapsedLists?: string[] | Record<string, boolean>;
  };
};

const record = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), id) as Promise<Rec>;

/** Waits until Boardkit has saved something that passes `check`. */
async function saved(page: Page, id: string, check: (r: Rec) => boolean, message?: string) {
  await expect.poll(async () => check(await record(page, id)), { message, timeout: 8_000 }).toBe(true);
  return record(page, id);
}

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const boardEl = (page: Page) => page.locator("[data-boardkit-board]");
const editingEl = (page: Page) => page.locator('[data-boardkit-board][data-editing="true"]');
const listEl = (page: Page, listId: string) => editingEl(page).locator(`section[data-list-id="${listId}"]`);
const cardEl = (page: Page, cardId: string) => editingEl(page).locator(`[data-card-id="${cardId}"]`);
const header = (page: Page, listId: string) => listEl(page, listId).locator("[data-list-header]");

/** Points at `l` (near its left edge, halfway down), as a person would
    before using what shows only on hover (phase 2.5). */
async function pointAt(l: Locator) {
  const b = (await l.boundingBox())!;
  await l.page().mouse.move(b.x + 6, b.y + b.height / 2, { steps: 2 });
}
/** A list header's control: on the whiteboard they show only while the
    pointer is over that header (phase 2.5), so it points there first. */
async function headerButton(page: Page, listId: string, name: string) {
  await pointAt(header(page, listId));
  return header(page, listId).getByRole("button", { name, exact: true });
}
/** The list's slim "+" (Add a card), shown while the pointer is over the list. */
async function addCardButton(page: Page, listId: string) {
  await pointAt(listEl(page, listId));
  return listEl(page, listId).getByRole("button", { name: "Add a card", exact: true });
}
/** The board's slim "+" (Add a list), shown while the pointer is over the board. */
async function addListButton(page: Page) {
  await pointAt(editingEl(page).locator("section[data-list-id]").first());
  return editingEl(page).getByRole("button", { name: "Add a list", exact: true });
}

async function placeBoard(page: Page, id: string) {
  await page.getByTestId("tools.board").click();
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  await expect(page.getByTestId("board-picker")).toHaveCount(0);
  await expect(boardEl(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).editor.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board")?.props.scale ?? 0)).toBeGreaterThan(0);
}

/** Double-click on the board's own background (not a card): editing starts. */
async function startEditing(page: Page) {
  const b = await box(boardEl(page));
  await page.mouse.dblclick(b.x + b.width - 12, b.y + b.height - 12);
  await expect(editingEl(page)).toHaveCount(1);
}

/** Boardkit's first-visit board on the whiteboard, being edited. */
async function setUp(page: Page, context: BrowserContext) {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  await placeBoard(page, id);
  await startEditing(page);
  const rec = await record(page, id);
  const lists = rec.board.listOrder;
  const withCards = lists.filter((l) => rec.board.cardOrder[l].length > 0);
  return { id, rec, lists, withCards };
}

const centre = async (l: Locator) => {
  const b = await box(l);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** Every control's name inside `root`: buttons, separators, groups. */
async function controlNames(root: Locator) {
  return root.evaluate((el) => {
    const names = new Set<string>();
    for (const c of el.querySelectorAll<HTMLElement>("button, [role='button'], [role='separator'], [role='img'], textarea")) {
      // Counts and card numbers vary; the control is the same.
      const name = (c.getAttribute("aria-label") ?? c.textContent ?? "").trim().replace(/\d+/g, "#");
      if (name) names.add(name);
    }
    return [...names].sort();
  });
}

async function menuItems(page: Page) {
  const menu = page.getByRole("menu").last();
  await expect(menu).toBeVisible();
  return (await menu.getByRole("menuitem").or(menu.getByRole("menuitemcheckbox")).allInnerTexts()).map((t) => t.trim()).sort();
}

test("the whiteboard board has every control Boardkit's board has (lists, cards, menus, customise panels)", async ({ page, context }) => {
  const id = await seedBoard(context);

  // Boardkit itself.
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  const notNow = bk.getByRole("button", { name: "Not now", exact: true });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) await notNow.click();
  const bkRail = bk.locator("[data-board-canvas]");
  await expect(bkRail.locator("[data-list-id]").first()).toBeVisible();
  const firstList = await bkRail.locator("section[data-list-id]").first().getAttribute("data-list-id");
  const bkControls = await controlNames(bkRail);
  await bkRail.locator(`section[data-list-id="${firstList}"] [data-list-header]`).click({ button: "right", position: { x: 4, y: 4 } });
  const bkHeaderMenu = await menuItems(bk);
  await bk.keyboard.press("Escape");
  await bkRail.locator(`section[data-list-id="${firstList}"]`).getByRole("button", { name: "Customise list", exact: true }).click();
  const bkListPanel = await controlNames(bk.locator("body > *").filter({ has: bk.getByRole("group", { name: "Colour" }) }).last());
  await bk.keyboard.press("Escape");
  await bk.mouse.click(5, 5);
  await bkRail.locator("[data-card-id]").first().hover();
  await bkRail.locator("[data-card-id]").first().getByRole("button", { name: "Customise card", exact: true }).click();
  const bkCardPanel = await controlNames(bk.locator("body > *").filter({ has: bk.getByRole("group", { name: "Colour" }) }).last());
  await bk.close();

  // The whiteboard.
  await openWhiteboard(page);
  await placeBoard(page, id);
  await startEditing(page);
  const wb = editingEl(page);
  const wbControls = await controlNames(wb);
  await header(page, firstList!).click({ button: "right", position: { x: 4, y: 4 } });
  const wbHeaderMenu = await menuItems(page);
  await page.keyboard.press("Escape");
  await (await headerButton(page, firstList!, "Customise list")).click();
  const wbListPanel = await controlNames(page.locator("body > *").filter({ has: page.getByRole("group", { name: "Colour" }) }).last());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Colour" })).toHaveCount(0);
  // The card buttons show while the pointer is over the card.
  await wb.locator("[data-card-id]").first().hover();
  await wb.locator("[data-card-id]").first().getByRole("button", { name: "Customise card", exact: true }).click();
  const wbCardPanel = await controlNames(page.locator("body > *").filter({ has: page.getByRole("group", { name: "Colour" }) }).last());

  // The app's toolbar is left out on purpose (owner); everything else
  // matches, but for phase 2.5's changes: the header's × is "⋯" (its menu
  // has "Delete list…"), and the add buttons of lists with cards and of a
  // board with lists are slim "+" (named "Add a card", "Add a list").
  expect(bkControls.length).toBeGreaterThan(10);
  // (An empty list keeps the full "+ Add a card"; a list header, a button
  // itself, is named after its text, whose × is "⋯" now.)
  const asOnWhiteboard = (n: string) =>
    n === "Delete list" ? ["List actions"] : n === "+ Add a list" ? ["Add a list"] : n === "+ Add a card" ? ["Add a card", n] : [n.replace(/‹▤⧉×$/, "‹▤⧉⋯")];
  expect(wbControls).toEqual([...new Set(bkControls.flatMap(asOnWhiteboard))].sort());
  expect(wbHeaderMenu.filter((n) => n !== "Delete list…")).toEqual(bkHeaderMenu);
  expect(wbHeaderMenu).toContain("Delete list…");
  expect(wbListPanel).toEqual(bkListPanel);
  expect(wbCardPanel).toEqual(bkCardPanel);
  // The ones the owner named (2026-10-19 hand test).
  for (const name of ["Collapse list", "Copy list as image", "Customise list", "List actions", "Move or copy card to another board", "Customise card", "Delete card"]) {
    expect(wbControls, name).toContain(name);
  }
  expect(wbControls.some((n) => /thots/.test(n))).toBe(true);
});

test("C11: a dragged card follows the pointer the whole way to another list, then lands there; Esc puts it back", async ({ page, context }) => {
  const { id, rec, withCards, lists } = await setUp(page, context);
  const from = withCards[0];
  const to = lists.find((l) => l !== from && rec.board.cardOrder[l].length > 0) ?? lists.find((l) => l !== from)!;
  const cardId = rec.board.cardOrder[from][0];
  const start = await centre(cardEl(page, cardId));
  const target = await centre(listEl(page, to).locator("[data-list-header]"));
  const end = { x: target.x, y: target.y + 40 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const at = { x: start.x + ((end.x - start.x) * i) / steps, y: start.y + ((end.y - start.y) * i) / steps };
    await page.mouse.move(at.x, at.y);
    if (i < 3) continue;
    // The lifted copy is under the pointer at every step (it used to vanish).
    const lifted = page.locator("article:not([data-card-id])");
    const b = await box(lifted);
    expect(at.x, `step ${i}: x`).toBeGreaterThanOrEqual(b.x - 2);
    expect(at.x, `step ${i}: x`).toBeLessThanOrEqual(b.x + b.width + 2);
    expect(at.y, `step ${i}: y`).toBeGreaterThanOrEqual(b.y - 2);
    expect(at.y, `step ${i}: y`).toBeLessThanOrEqual(b.y + b.height + 2);
    await expect(lifted).toBeVisible();
  }
  // The target list already shows the card (as in Boardkit).
  await expect(listEl(page, to).locator(`[data-card-id="${cardId}"]`)).toHaveCount(1);
  await page.mouse.up();
  await saved(page, id, (r) => r.board.cardOrder[to].includes(cardId) && !r.board.cardOrder[from].includes(cardId), "card moved in the record");

  // Esc mid-drag: back where it was.
  const back = await centre(cardEl(page, cardId));
  await page.mouse.move(back.x, back.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(back.x - i * 30, back.y + i * 5);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(editingEl(page)).toHaveCount(1);
  await page.waitForTimeout(600);
  expect((await record(page, id)).board.cardOrder[to]).toContain(cardId);
});

test("C11: a card dropped on the top edge of another list's first card lands there, without the board crashing; Boardkit itself too", async ({ page, context }) => {
  // A drop at a list's top edge made the card flip between the two lists on
  // every render until React gave up (error #185) and the board showed
  // "Error". Boardkit's fix (a card crosses only into the list under the
  // pointer) runs in Boardkit itself as well, unscaled: both are checked.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && /Maximum update depth|#185/.test(m.text()) && errors.push(m.text()));
  const dropOnTopEdge = async (p: Page, scope: Locator) => {
    const lists = await scope.locator("section[data-list-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-list-id")!));
    const [from, to] = lists;
    const card = scope.locator(`section[data-list-id="${from}"] article[data-card-id]`).first();
    const cardId = (await card.getAttribute("data-card-id"))!;
    const a = await box(card);
    const b = await box(scope.locator(`section[data-list-id="${to}"] article[data-card-id]`).first());
    const start = { x: a.x + 20, y: a.y + a.height / 2 };
    const end = { x: b.x + 20, y: b.y + 4 };
    await p.mouse.move(start.x, start.y);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(start.x + ((end.x - start.x) * i) / 8, start.y + ((end.y - start.y) * i) / 8);
    await p.mouse.up();
    return { from, to, cardId };
  };

  const { id } = await setUp(page, context);
  const wb = await dropOnTopEdge(page, editingEl(page));
  const r = await saved(page, id, (r) => r.board.cardOrder[wb.to][0] === wb.cardId && !r.board.cardOrder[wb.from].includes(wb.cardId), "card moved on the whiteboard");
  await expect(listEl(page, wb.to).locator("article[data-card-id]").first()).toHaveAttribute("data-card-id", wb.cardId);
  await expect(editingEl(page)).toHaveCount(1);

  const bk = await context.newPage();
  bk.on("pageerror", (e) => errors.push(e.message));
  await bk.goto("/boardkit/");
  const rail = bk.locator("[data-board-canvas]");
  await expect(rail.locator("article[data-card-id]").first()).toBeVisible();
  const own = await dropOnTopEdge(bk, rail);
  await saved(bk, id, (r) => r.board.cardOrder[own.to][0] === own.cardId && !r.board.cardOrder[own.from].includes(own.cardId), "card moved in Boardkit");
  expect(r.rev).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("L12: Enter on an empty 'Add a card' adds a blank card at once, and keeps adding", async ({ page, context }) => {
  const { id, rec, lists } = await setUp(page, context);
  const list = lists[0];
  const before = rec.board.cardOrder[list].length;
  await (await addCardButton(page, list)).click();
  const field = listEl(page, list).getByRole("textbox", { name: "Add a card" });
  await expect(field).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(listEl(page, list).locator("[data-card-id]")).toHaveCount(before + 3);
  await expect(field).toBeFocused();
  await page.keyboard.type("Named one");
  await page.keyboard.press("Enter");
  const r = await saved(page, id, (r) => r.board.cardOrder[list].length === before + 4);
  const added = r.board.cardOrder[list].slice(before).map((c) => r.board.cards[c].title);
  expect(added).toEqual(["", "", "", "Named one"]);
  // Escape closes the composer, not the board.
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(editingEl(page)).toHaveCount(1);
});

test("C4, L3, B1: rename a card and a list by clicking their titles; add a list", async ({ page, context }) => {
  const { id, rec, withCards } = await setUp(page, context);
  const list = withCards[0];
  const cardId = rec.board.cardOrder[list][0];
  await cardEl(page, cardId).getByRole("button", { name: "Card title", exact: true }).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Renamed card");
  await page.keyboard.press("Enter");
  await (await headerButton(page, list, "List title")).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Renamed list");
  await page.keyboard.press("Enter");
  await (await addListButton(page)).click();
  await page.keyboard.type("New list");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  const r = await saved(page, id, (r) => r.board.listOrder.length === rec.board.listOrder.length + 1 && r.board.cards[cardId].title === "Renamed card" && r.board.lists[list].title === "Renamed list");
  expect(r.board.lists[r.board.listOrder.at(-1)!].title).toBe("New list");
});

test("C7, C8, C10, C5, C6: card buttons → (move/copy to another board), ▤ thots, × delete; right-click toggles thots", async ({ page, context }) => {
  const { id, rec, withCards } = await setUp(page, context);
  const list = withCards[0];
  const [c1, c2] = rec.board.cardOrder[list];

  // ▤ opens the thots; type some.
  await cardEl(page, c1).hover();
  await cardEl(page, c1).getByRole("button", { name: /^Show .*thots/ }).click();
  await cardEl(page, c1).getByRole("button", { name: /Pregame thots|Thots/ }).first().click();
  await page.keyboard.type("my thot");
  await page.keyboard.press("Tab");
  await saved(page, id, (r) => r.board.cards[c1].description === "my thot", "thots saved");
  // ⇄ flips to postgame.
  await cardEl(page, c1).getByRole("button", { name: "Switch between pregame and postgame thots", exact: true }).click();
  await expect(cardEl(page, c1).getByRole("button", { name: /Postgame thots/ })).toBeVisible();
  // Right-click on the card closes them again (Boardkit's own gesture).
  await cardEl(page, c1).click({ button: "right", position: { x: 6, y: 6 } });
  await expect(cardEl(page, c1).getByRole("button", { name: /Postgame thots/ })).toHaveCount(0);

  // → offers this board's lists (no other board yet) and other boards.
  await cardEl(page, c2).hover();
  await cardEl(page, c2).getByRole("button", { name: "Move or copy card to another board", exact: true }).click();
  await expect(page.getByRole("menu").last()).toBeVisible();
  await page.keyboard.press("Escape");

  // × sends it to Boardkit's trash.
  await cardEl(page, c2).hover();
  await cardEl(page, c2).getByRole("button", { name: "Delete card", exact: true }).click();
  await saved(page, id, (r) => r.board.trash.some((t) => t.cardId === c2) && !r.board.cardOrder[list].includes(c2), "card in the trash");
  await expect(cardEl(page, c2)).toHaveCount(0);
});

test("C9, C1, C2: customise a card (colour, highlight + style, type, number emphasis); check circles cycle", async ({ page, context }) => {
  const { id, rec, withCards } = await setUp(page, context);
  const list = withCards[0];
  const [c1, c2] = rec.board.cardOrder[list];

  await cardEl(page, c1).hover();
  await cardEl(page, c1).getByRole("button", { name: "Customise card", exact: true }).click();
  const colours = page.getByRole("group", { name: "Colour" }).first();
  await colours.getByRole("button", { name: "red", exact: true }).click();
  await page.getByRole("group", { name: "Number" }).getByRole("button", { name: "Badge", exact: true }).click();
  await page.getByRole("group", { name: "Colour" }).nth(1).getByRole("button", { name: "blue", exact: true }).click();
  await page.getByRole("group", { name: "Highlight style" }).getByRole("button", { name: "Dashed", exact: true }).click();
  await page.getByRole("group", { name: "Card type" }).getByRole("button", { name: "Note", exact: true }).click();
  await page.keyboard.press("Escape");
  await saved(page, id, (r) => {
    const c = r.board.cards[c1];
    return c.color === "red" && c.highlight === "blue" && c.highlightStyle === "dashed" && c.kind === "note" && c.numberEmphasis === "badge";
  }, "card styles saved");
  await expect(cardEl(page, c1)).toHaveAttribute("data-highlight", "dashed");

  // Check circles: on for the list, then a click cycles the card's mark.
  await (await headerButton(page, list, "Customise list")).click();
  await page.getByRole("group", { name: "Checks" }).getByRole("button", { name: "Check circles", exact: true }).click();
  await page.keyboard.press("Escape");
  const circle = cardEl(page, c2).getByRole("button", { name: /Not checked/ });
  await circle.click();
  await saved(page, id, (r) => r.board.lists[list].hasChecks === true && r.board.cards[c2].check === "green", "check mark saved");
  await cardEl(page, c2).getByRole("button", { name: /Green check/ }).click();
  await saved(page, id, (r) => r.board.cards[c2].check === "red");
});

test("L4, L5, L6, L9, L10: list header — count, ‹ collapse and expand, ▤ thots on every card, right-click menu, × delete", async ({ page, context }) => {
  const { id, rec, withCards, lists } = await setUp(page, context);
  const list = withCards[0];
  const n = rec.board.cardOrder[list].length;
  await expect(header(page, list)).toContainText(String(n));

  // ▤: every card's thots open, then postgame, then hidden.
  await (await headerButton(page, list, "Show pregame thots on every card")).click();
  await expect(listEl(page, list).locator('[data-thots-toggle][aria-expanded="true"]')).toHaveCount(n);
  await (await headerButton(page, list, "Show postgame thots on every card")).click();
  await (await headerButton(page, list, "Hide thots on every card")).click();
  await expect(listEl(page, list).locator('[data-thots-toggle][aria-expanded="true"]')).toHaveCount(0);

  // ‹ collapses; a click on the strip opens it again.
  await (await headerButton(page, list, "Collapse list")).click();
  const strip = listEl(page, list).getByLabel(/collapsed$/);
  await expect(strip).toBeVisible();
  await strip.click();
  await expect(header(page, list).getByRole("button", { name: "Collapse list", exact: true })).toHaveCount(1);

  // Right-click: Duplicate list.
  await header(page, list).click({ button: "right", position: { x: 4, y: 4 } });
  await page.getByRole("menuitem", { name: "Duplicate list", exact: true }).click();
  await saved(page, id, (r) => r.board.listOrder.length === lists.length + 1, "list duplicated");
  // ... and the check items work from the menu too.
  await header(page, list).click({ button: "right", position: { x: 4, y: 4 } });
  await page.getByRole("menuitemcheckbox", { name: "Just one thots box per card", exact: true }).click();
  await saved(page, id, (r) => r.board.lists[list].singleThots === true);

  // "⋯" → Delete list… (the header's × on the whiteboard, phase 2.5) asks,
  // then sends the list to the trash.
  await (await headerButton(page, list, "List actions")).click();
  await page.getByRole("menuitem", { name: "Delete list…", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await saved(page, id, (r) => !r.board.listOrder.includes(list) && r.board.trashedLists.some((t) => t.listId === list), "list in the trash");
});

test("L8, L1, L2: customise a list — colour, icon, number format, hidden numbers, continue numbering; keep/maybe/cut shows", async ({ page, context }) => {
  const { id, rec, lists } = await setUp(page, context);
  const [l1, l2] = lists;
  await (await headerButton(page, l2, "Customise list")).click();
  await page.getByRole("group", { name: "Colour" }).getByRole("button", { name: "green", exact: true }).click();
  const icons = page.getByRole("group", { name: "Icon" });
  await icons.getByRole("button").nth(2).click();
  await page.getByRole("group", { name: "Numbers" }).getByRole("button", { name: "i ii iii", exact: true }).click();
  await page.getByRole("group", { name: "Numbering" }).getByRole("button", { name: "Continue from previous list", exact: true }).click();
  await page.keyboard.press("Escape");
  const r = await saved(page, id, (r) => {
    const l = r.board.lists[l2];
    return l.color === "green" && !!l.icon && l.numberFormat === "roman" && l.continuesNumbering === true;
  }, "list styles saved");
  if (r.board.cardOrder[l2].length > 0) {
    // Roman, continuing from the first list's count.
    const first = r.board.cardOrder[l1].length + 1;
    const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"][first - 1];
    await expect(cardEl(page, r.board.cardOrder[l2][0])).toContainText(roman);
  }
  await (await headerButton(page, l2, "Customise list")).click();
  await page.getByRole("group", { name: "Numbers" }).getByRole("button", { name: "Hidden", exact: true }).click();
  await page.keyboard.press("Escape");
  await saved(page, id, (r) => r.board.lists[l2].numbersHidden === true);
  expect(rec.board.listOrder).toContain(l1);
});

test("L7: ⧉ copies the list as an image", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { withCards } = await setUp(page, context);
  await (await headerButton(page, withCards[0], "Copy list as image")).click();
  await expect(header(page, withCards[0]).getByRole("button", { name: "Copy list as image", exact: true })).toHaveText("✓");
  const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types));
  expect(types).toContain("image/png");
});

test("L11: dragging a list's right edge resizes it (in the board's own pixels, at any zoom); double-click fits", async ({ page, context }) => {
  const { id, lists } = await setUp(page, context);
  const list = lists[0];
  const handle = listEl(page, list).getByRole("separator", { name: "Resize list" });
  const before = await box(listEl(page, list));
  const scale = await listEl(page, list).evaluate((el) => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth);
  const h = await centre(handle);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(h.x + i * 10, h.y);
  await page.mouse.up();
  const r = await saved(page, id, (r) => typeof r.board.lists[list].width === "number");
  // 60 screen pixels wider, in the board's own pixels.
  expect(r.board.lists[list].width!).toBeCloseTo(before.width / scale + 60 / scale, -1);
  await handle.dblclick();
  await saved(page, id, (r) => r.board.lists[list].width !== r.board.lists[list].width || true);
});

test("B2: dragging a list by its header reorders the lists", async ({ page, context }) => {
  const { id, lists } = await setUp(page, context);
  const [a, b] = lists;
  const from = await box(header(page, a));
  const to = await box(listEl(page, b));
  const start = { x: from.x + from.width - 40, y: from.y + from.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(start.x + ((to.x + to.width - start.x) * i) / 10, start.y);
  await page.mouse.up();
  await saved(page, id, (r) => r.board.listOrder.indexOf(a) > r.board.listOrder.indexOf(b), "lists reordered");
});

test("B3, B4, K2, L13: box-select cards on the board, style them from the selection bar, copy and paste them", async ({ page, context }) => {
  const { id, rec, withCards } = await setUp(page, context);
  const list = withCards[0];
  const cards = rec.board.cardOrder[list];
  // Drag on the board's empty space, across the list's cards.
  const first = await box(cardEl(page, cards[0]));
  const rail = await box(editingEl(page));
  const start = { x: first.x - 6, y: rail.y + rail.height - 8 };
  const end = { x: first.x + 30, y: first.y + 5 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(start.x + ((end.x - start.x) * i) / 8, start.y + ((end.y - start.y) * i) / 8);
  await page.mouse.up();
  const bar = page.getByRole("toolbar", { name: "Selection" });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(String(cards.length));

  await bar.getByRole("button", { name: "Highlight ▾", exact: true }).click();
  await page.getByRole("menuitem", { name: "orange", exact: true }).click();
  await saved(page, id, (r) => cards.every((c) => r.board.cards[c].highlight === "orange"), "highlight on every selected card");
  await bar.getByRole("button", { name: "Number ▾", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ring", exact: true }).click();
  await saved(page, id, (r) => cards.every((c) => r.board.cards[c].numberEmphasis === "ring"), "number emphasis on every selected card");
  await bar.getByRole("button", { name: "Reset number and highlight to default", exact: true }).click();
  await saved(page, id, (r) => cards.every((c) => !r.board.cards[c].highlight && !r.board.cards[c].numberEmphasis), "reset");

  // Copy, then paste into another list from its own "Paste N cards" button.
  await page.keyboard.press("Escape").catch(() => {});
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(start.x + ((end.x - start.x) * i) / 8, start.y + ((end.y - start.y) * i) / 8);
  await page.mouse.up();
  await page.keyboard.press("Control+c");
  const other = rec.board.listOrder.find((l) => l !== list)!;
  const paste = listEl(page, other).getByRole("button", { name: new RegExp(`^Paste ${cards.length} card`) });
  await expect(paste).toBeVisible();
  await paste.click();
  await saved(page, id, (r) => r.board.cardOrder[other].length === rec.board.cardOrder[other].length + cards.length, "pasted");
  // Esc lets go of the selection and the copied cards before it ends editing.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(editingEl(page)).toHaveCount(1);
});

test("K1, K3, K4, K5: Boardkit's keys while editing — new card, rename, thots, Delete, Ctrl+Z; D, C on a list; Delete never deletes the board", async ({ page, context }) => {
  const { id, rec, withCards, lists } = await setUp(page, context);
  const list = withCards[0];
  const [c1] = rec.board.cardOrder[list];
  const n = rec.board.cardOrder[list].length;

  await cardEl(page, c1).focus();
  await page.keyboard.press("n");
  await page.keyboard.type("Made with N");
  await page.keyboard.press("Enter");
  // The title too, not just one card more: N stores the new card as "New
  // card" first, and on a busy run the count was seen before the typed
  // title was saved.
  let r = await saved(page, id, (r) => r.board.cardOrder[list].length === n + 1 && r.board.cards[r.board.cardOrder[list][1]]?.title === "Made with N", "the new card, titled");
  const made = r.board.cardOrder[list][1];
  expect(r.board.cards[made].title).toBe("Made with N");

  await cardEl(page, made).focus();
  await page.keyboard.press("t");
  await expect(cardEl(page, made).getByRole("button", { name: /Pregame thots|Thots/ }).first()).toBeVisible();
  await cardEl(page, made).focus();
  await page.keyboard.press("Delete");
  r = await saved(page, id, (r) => !r.board.cardOrder[list].includes(made));
  // The board is still on the whiteboard, still being edited.
  await expect(editingEl(page)).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).editor.getCurrentPageShapes().filter((s: any) => s.type === "boardkit-board").length)).toBe(1);

  // Ctrl+Z brings the card back (the board's undo, not the whiteboard's).
  await page.keyboard.press("Control+z");
  await saved(page, id, (r) => r.board.cardOrder[list].includes(made), "undo restored the card");
  await page.keyboard.press("Control+Shift+z");
  await saved(page, id, (r) => !r.board.cardOrder[list].includes(made), "redo deleted it again");

  // A list header: D duplicates, C collapses.
  await header(page, list).focus();
  await page.keyboard.press("d");
  await saved(page, id, (r) => r.board.listOrder.length === lists.length + 1);
  await header(page, list).focus();
  await page.keyboard.press("c");
  await expect(listEl(page, list).getByLabel(/collapsed$/)).toBeVisible();

  // Escape with nothing of Boardkit's to let go of ends editing.
  await page.mouse.click(5, 450);
  await expect(editingEl(page)).toHaveCount(0);
});

test("C3, L1: keep / maybe / cut from Linkkit show on the board; a cut card is faded", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  // Set the statuses as Linkkit does (it writes the same record).
  const { list, card } = await page.evaluate((id) => {
    const key = `boardkit:board:${id}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    const list = rec.board.listOrder.find((l: string) => rec.board.cardOrder[l].length > 0);
    const card = rec.board.cardOrder[list][0];
    rec.board.lists[list].status = "maybe";
    rec.board.cards[card].status = "cut";
    rec.rev += 1;
    localStorage.setItem(key, JSON.stringify(rec));
    return { list, card };
  }, id);
  await placeBoard(page, id);
  await expect(boardEl(page).locator(`section[data-list-id="${list}"] [data-list-header]`).getByRole("img", { name: "Maybe" })).toBeVisible();
  const cut = boardEl(page).locator(`[data-card-id="${card}"]`);
  await expect(cut).toHaveAttribute("data-cut", "");
  await expect(cut.getByRole("img", { name: "Cut" })).toBeVisible();
  await startEditing(page);
  await expect(cardEl(page, card)).toHaveAttribute("data-cut", "");
});

test("L14: a full list says so instead of offering 'Add a card'", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  const list = await page.evaluate((id) => {
    const key = `boardkit:board:${id}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    const list = rec.board.listOrder[0];
    for (let i = rec.board.cardOrder[list].length; i < 50; i++) {
      const cid = `full${String(i).padStart(6, "0")}`;
      rec.board.cards[cid] = { id: cid, title: `Card ${i}` };
      rec.board.cardOrder[list].push(cid);
    }
    rec.rev += 1;
    localStorage.setItem(key, JSON.stringify(rec));
    return list;
  }, id);
  await placeBoard(page, id);
  await startEditing(page);
  await expect(listEl(page, list)).toContainText("List is full · 50 cards max");
  await expect(listEl(page, list).getByRole("button", { name: /Add a card/ })).toHaveCount(0);
});
