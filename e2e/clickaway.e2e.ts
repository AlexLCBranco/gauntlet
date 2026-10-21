import { expect, test, type Locator, type Page } from "@playwright/test";

import { box, seedBoard, seedMap } from "./helpers";

/**
 * Hand-test fixes (owner, 2026-10-21). 1: wherever text is typed, a click
 * away saves it as Enter does (an empty new-item field just closes; Escape
 * still cancels), on the whiteboard and in /boardkit and /linkkit. 2: on
 * the whiteboard, a board's hover controls work on the first click. Fresh,
 * empty browser profile per test; the board is Boardkit's first-visit
 * board. Actions go through the mouse and keyboard; storage and
 * `window.editor` are only read to check.
 */

type Rec = { board: { lists: Record<string, { title: string }>; cards: Record<string, { title: string }>; listOrder: string[]; cardOrder: Record<string, string[]> } };
const record = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), id) as Promise<Rec>;
async function saved(page: Page, id: string, check: (r: Rec) => boolean) {
  await expect.poll(async () => check(await record(page, id)), { timeout: 8_000 }).toBe(true);
  return record(page, id);
}
const cardTitles = async (page: Page, id: string, list = 0) => {
  const r = (await record(page, id)).board;
  return (r.cardOrder[r.listOrder[list]] ?? []).map((c) => r.cards[c].title);
};

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const editing = (page: Page) => page.evaluate(() => (window as any).editor.getEditingShapeId() as string | null);

/**
 * Where a board is typed in: the whiteboard (a widget, not edited until a
 * field is opened on it) or standalone /boardkit. `away` clicks empty
 * space: the whiteboard beside the board, or Boardkit's page left of it.
 */
type Where = {
  page: Page;
  id: string;
  root: Locator;
  away: () => Promise<void>;
  openListField: () => Promise<void>;
  openCardField: (list: number) => Promise<void>;
  renameList: (list: number) => Promise<void>;
  renameCard: (list: number, card: number) => Promise<void>;
};

const listAt = (root: Locator, i: number) => root.locator("section[data-list-id]").nth(i);
const cardAt = (root: Locator, list: number, card: number) => listAt(root, list).locator("article[data-card-id]").nth(card);

async function onWhiteboard(page: Page, context: Parameters<typeof seedBoard>[0]): Promise<Where> {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  await page.getByTestId("tools.board").click();
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  const root = page.locator(".tl-html-container [data-boardkit-board]").first();
  await expect(root).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).editor.getCurrentPageShapes()[0]?.props.scale ?? 0)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  const vp = page.viewportSize()!;
  // The pointer goes over a list first, as a hand does: its "+" rows show;
  // then a press on the "+" itself.
  const over = async (l: Locator) => {
    const b = await box(l);
    await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 3 });
  };
  const press = async (l: Locator) => {
    const b = await box(l);
    await page.mouse.move(b.x + b.width / 2, b.y + Math.min(20, b.height / 2), { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
  };
  return {
    page,
    id,
    root,
    away: async () => {
      const b = await box(root);
      await page.mouse.click(Math.min(vp.width - 30, b.x + b.width + 160), Math.min(vp.height - 120, b.y + b.height + 60));
    },
    openListField: async () => {
      await over(listAt(root, 0));
      await press(root.locator('[data-add="list"]'));
    },
    openCardField: async (list) => {
      await over(listAt(root, list));
      await press(listAt(root, list).locator('[data-add="card"]'));
    },
    renameList: async (list) => {
      const h = await box(listAt(root, list).locator("[data-list-header] h2"));
      await page.mouse.dblclick(h.x + 10, h.y + h.height / 2);
    },
    renameCard: async (list, card) => {
      const t = await box(cardAt(root, list, card).locator("[data-card-title]"));
      await page.mouse.dblclick(t.x + 10, t.y + t.height / 2);
    },
  };
}

async function inBoardkit(page: Page, context: Parameters<typeof seedBoard>[0]): Promise<Where> {
  const id = await seedBoard(context);
  await page.goto("/boardkit/");
  await expect(page.getByRole("button", { name: "Switch board" })).toBeVisible();
  const root = page.locator("[data-board-canvas]");
  await expect(listAt(root, 0)).toBeVisible();
  return {
    page,
    id,
    root,
    away: async () => {
      await page.mouse.click(5, 300);
    },
    openListField: async () => {
      await root.locator('[data-add="list"]').click();
    },
    openCardField: async (list) => {
      await listAt(root, list).locator('[data-add="card"]').click();
    },
    renameList: async (list) => {
      await listAt(root, list).locator("[data-list-header] h2").getByRole("button", { name: "List title", exact: true }).click();
    },
    renameCard: async (list, card) => {
      await cardAt(root, list, card).getByRole("button", { name: "Card title", exact: true }).click();
    },
  };
}

for (const [label, make] of [
  ["on the whiteboard", onWhiteboard],
  ["in /boardkit", inBoardkit],
] as const) {
  test(`click away saves, ${label}: a new list (no card field opens), a new card, a renamed list`, async ({ page, context }) => {
    const w = await make(page, context);
    const { id } = w;
    const lists = (await record(page, id)).board.listOrder.length;

    await w.openListField();
    await expect(page.getByRole("textbox", { name: "Add a list" })).toBeFocused();
    await page.keyboard.type("ZZ list kept");
    await w.away();
    const r1 = await saved(page, id, (r) => r.board.listOrder.length === lists + 1);
    expect(r1.board.lists[r1.board.listOrder.at(-1)!].title).toBe("ZZ list kept");
    await page.waitForTimeout(300);
    await expect(page.getByRole("textbox", { name: "Add a card" })).toHaveCount(0);

    const before = await cardTitles(page, id, 0);
    await w.openCardField(0);
    await expect(page.getByRole("textbox", { name: "Add a card" })).toBeFocused();
    await page.keyboard.type("ZZ card kept");
    await w.away();
    await expect.poll(() => cardTitles(page, id, 0)).toEqual([...before, "ZZ card kept"]);

    await w.renameList(1);
    await expect(page.getByRole("textbox", { name: "List title" })).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("ZZ list renamed");
    await w.away();
    await saved(page, id, (r) => r.board.lists[r.board.listOrder[1]].title === "ZZ list renamed");
    await expect(page.getByRole("textbox", { name: "List title" })).toHaveCount(0);
  });

  test(`click away saves, ${label}: a card renamed, then a click on another card saves it and still does what it does`, async ({ page, context }) => {
    const w = await make(page, context);
    const { id, root } = w;
    const r0 = (await record(page, id)).board;
    const firstId = r0.cardOrder[r0.listOrder[0]][0];
    const secondId = r0.cardOrder[r0.listOrder[0]][1];
    await w.renameCard(0, 0);
    await expect(page.getByRole("textbox", { name: "Card title" })).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("ZZ card renamed");
    // A click on another card's title: saved, and that title opens.
    await root.locator(`article[data-card-id="${secondId}"]`).getByRole("button", { name: "Card title", exact: true }).click();
    await saved(page, id, (r) => r.board.cards[firstId].title === "ZZ card renamed");
    const field = page.getByRole("textbox", { name: "Card title" });
    await expect(field).toBeFocused();
    await expect(root.locator(`article[data-card-id="${secondId}"]`).getByRole("textbox", { name: "Card title" })).toBeFocused();
    await page.keyboard.press("Escape");
    expect((await record(page, id)).board.cards[secondId].title).toBe(r0.cards[secondId].title);
  });

  test(`click away, ${label}: empty new list and card fields just close; Escape cancels typed text`, async ({ page, context }) => {
    const w = await make(page, context);
    const { id } = w;
    const start = await record(page, id);
    await w.openListField();
    await expect(page.getByRole("textbox", { name: "Add a list" })).toBeFocused();
    await w.away();
    await expect(page.getByRole("textbox", { name: "Add a list" })).toHaveCount(0);
    await w.openCardField(0);
    await expect(page.getByRole("textbox", { name: "Add a card" })).toBeFocused();
    await w.away();
    await expect(page.getByRole("textbox", { name: "Add a card" })).toHaveCount(0);
    // Escape: typed, not kept.
    await w.openCardField(0);
    await page.keyboard.type("ZZ not kept");
    await page.keyboard.press("Escape");
    await w.renameList(0);
    await page.keyboard.press("Control+a");
    await page.keyboard.type("ZZ not kept either");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const end = await record(page, id);
    expect(end.board.listOrder).toEqual(start.board.listOrder);
    expect(end.board.cardOrder).toEqual(start.board.cardOrder);
    expect(end.board.lists).toEqual(start.board.lists);
  });
}

test("click away saves in /boardkit: the board's name", async ({ page, context }) => {
  const w = await inBoardkit(page, context);
  await page.getByRole("button", { name: "Board name" }).click();
  await expect(page.getByRole("textbox", { name: "Board name" })).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("ZZ board renamed");
  await w.away();
  await expect
    .poll(() => page.evaluate((id) => (JSON.parse(localStorage.getItem("boardkit:registry")!) as { boards: { id: string; name: string }[] }).boards.find((b) => b.id === id)?.name, w.id))
    .toBe("ZZ board renamed");
});

// ---- Linkkit ---------------------------------------------------------------

const mapNames = (page: Page, mapId: string) =>
  page.evaluate((id) => {
    const raw = localStorage.getItem(`linkkit:map:${id}`);
    return raw ? Object.values((JSON.parse(raw) as { map: { nodes: Record<string, { name: string }> } }).map.nodes).map((n) => n.name).sort() : [];
  }, mapId);

type MapWhere = { page: Page; mapId: string; root: Locator; away: () => Promise<void>; rename: (name: string) => Promise<void>; addChild: (name: string) => Promise<void> };

async function mapOnWhiteboard(page: Page, context: Parameters<typeof seedMap>[0]): Promise<MapWhere> {
  const mapId = await seedMap(context, "Top");
  await openWhiteboard(page);
  await page.getByTestId("tools.map").click();
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  const root = page.locator(".tl-html-container [data-linkkit-map]").first();
  await expect(root.locator("[data-map-view][data-ready]")).toBeVisible();
  await page.keyboard.press("Escape");
  const vp = page.viewportSize()!;
  const boxNamed = (name: string) => root.locator("[data-box-id]").filter({ hasText: new RegExp(`^${name}$`) });
  return {
    page,
    mapId,
    root,
    away: async () => {
      const b = await box(root);
      await page.mouse.click(Math.min(vp.width - 30, b.x + b.width + 260), Math.min(vp.height - 120, b.y + b.height + 160));
    },
    rename: async (name) => {
      const b = await box(boxNamed(name));
      await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    },
    addChild: async (name) => {
      if (!(await editing(page))) {
        const b = await box(boxNamed(name));
        await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
        await page.getByRole("textbox", { name: "Box name" }).press("Escape");
      }
      await boxNamed(name).hover();
      await boxNamed(name).getByRole("button", { name: "Add a child", exact: true }).click();
    },
  };
}

async function mapInLinkkit(page: Page, context: Parameters<typeof seedMap>[0]): Promise<MapWhere> {
  const mapId = await seedMap(context, "Top");
  await page.goto("/linkkit/");
  const root = page.locator("[data-map-view]");
  await expect(page.locator("[data-ready]")).toBeVisible({ timeout: 30_000 });
  const boxNamed = (name: string) => page.locator("[data-box-id]").filter({ hasText: new RegExp(`^${name}$`) });
  return {
    page,
    mapId,
    root,
    away: async () => {
      // Bare paper, well clear of the tree.
      const b = await box(root);
      await page.mouse.click(b.x + 20, b.y + b.height - 20);
    },
    rename: async (name) => {
      await boxNamed(name).dblclick();
    },
    addChild: async (name) => {
      await boxNamed(name).hover();
      await boxNamed(name).getByRole("button", { name: "Add a child", exact: true }).click();
    },
  };
}

for (const [label, make] of [
  ["on the whiteboard", mapOnWhiteboard],
  ["in /linkkit", mapInLinkkit],
] as const) {
  test(`click away saves a map box's name, ${label}; an empty new box is not kept; Escape cancels`, async ({ page, context }) => {
    const w = await make(page, context);
    const field = page.getByRole("textbox", { name: "Box name" });
    await w.rename("Top");
    await expect(field).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Renamed");
    await w.away();
    await expect.poll(() => mapNames(page, w.mapId)).toEqual(["Renamed"]);
    await expect(field).toHaveCount(0);

    // A new box (a child), left empty: a click away takes it back.
    await w.addChild("Renamed");
    await expect(field).toBeFocused();
    await w.away();
    await expect(field).toHaveCount(0);
    await page.waitForTimeout(800);
    expect(await mapNames(page, w.mapId)).toEqual(["Renamed"]);

    // Named, then a click away: kept.
    await w.addChild("Renamed");
    await expect(field).toBeFocused();
    await page.keyboard.type("Child");
    await w.away();
    await expect.poll(() => mapNames(page, w.mapId)).toEqual(["Child", "Renamed"]);

    // Escape: not kept.
    await w.rename("Child");
    await expect(field).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Not kept");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    expect(await mapNames(page, w.mapId)).toEqual(["Child", "Renamed"]);
  });
}

// ---- One click, not two (whiteboard) ---------------------------------------

test("one click on a board's hover controls, from an unselected board not being edited: the field opens focused, the menu opens; a click on plain board space only selects", async ({ page, context }) => {
  const w = await onWhiteboard(page, context);
  const { root } = w;
  const reset = async () => {
    for (let i = 0; i < 3 && (await editing(page)); i++) await page.keyboard.press("Escape");
    for (let i = 0; i < 2 && (await editing(page)); i++) await w.away();
    await page.evaluate(() => void (window as any).editor.selectNone());
    await expect.poll(() => editing(page)).toBeNull();
    // The pointer away, then back over the board (the controls show on hover).
    await page.mouse.move(10, 10, { steps: 2 });
  };
  const over = async (l: Locator, dy = 20) => {
    const b = await box(l);
    await page.mouse.move(b.x + b.width / 2, b.y + dy, { steps: 3 });
  };
  const onePress = async (l: Locator) => {
    const b = await box(l);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 2 });
    await page.mouse.down();
    await page.mouse.up();
  };

  // The card "+" row.
  await over(listAt(root, 0));
  await onePress(listAt(root, 0).locator('[data-add="card"]'));
  await expect(page.getByRole("textbox", { name: "Add a card" })).toBeFocused();
  await reset();

  // The list "+" column.
  await over(listAt(root, 0));
  await onePress(root.locator('[data-add="list"]'));
  await expect(page.getByRole("textbox", { name: "Add a list" })).toBeFocused();
  await reset();

  // A list header's controls: "⋯" opens the list's menu.
  const header = listAt(root, 0).locator("[data-list-header]");
  await over(header, 10);
  await onePress(header.locator('[data-control="menu"]'));
  await expect(page.getByRole("menuitem", { name: /Delete list/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await reset();
  // ...and "Customise list" opens its panel.
  await over(header, 10);
  await onePress(header.locator('[data-control="customise"]'));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await reset();

  // The full "+ Add a card" of an empty list: a new list, empty, first.
  await over(listAt(root, 0));
  await onePress(root.locator('[data-add="list"]'));
  await expect(page.getByRole("textbox", { name: "Add a list" })).toBeFocused();
  await page.keyboard.type("ZZ empty list");
  await w.away(); // kept, and no card field opens for it

  await saved(page, w.id, (r) => Object.values(r.board.lists).some((l) => l.title === "ZZ empty list"));
  await reset();
  const emptyList = root.locator("section[data-list-id]").last();
  await over(emptyList);
  const fullAdd = emptyList.locator('[data-add="card"]');
  await expect(fullAdd).not.toHaveAttribute("data-slim", "");
  await onePress(fullAdd);
  await expect(page.getByRole("textbox", { name: "Add a card" })).toBeFocused();
  await reset();

  // Plain board space (between two lists): selected, not edited.
  const a = await box(listAt(root, 0));
  const b = await box(listAt(root, 1));
  await page.mouse.click((a.x + a.width + b.x) / 2, a.y + 30);
  await expect.poll(() => page.evaluate(() => (window as any).editor.getSelectedShapeIds().length)).toBe(1);
  expect(await editing(page)).toBeNull();
});

test("one click on the full '+ Add a list' of a board with no lists, from a board not being edited", async ({ page }) => {
  await openWhiteboard(page);
  await page.getByTestId("tools.board").click();
  await page.getByTestId("new-board").click();
  await expect(page.getByTestId("board-name-field")).toBeFocused();
  await page.keyboard.press("Enter");
  const root = page.locator(".tl-html-container [data-boardkit-board]").first();
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  expect(await editing(page)).toBeNull();
  const add = root.locator('[data-add="list"]');
  await expect(add).toBeVisible();
  const b = await box(add);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByRole("textbox", { name: "Add a list" })).toBeFocused();
});

// ---- Typing at once after a one-click "+" -----------------------------------

/** One press on `l` (by position, as a hand does), then typing at once:
    no wait for the field. Enter keeps it. */
async function pressThenType(page: Page, l: Locator, text: string) {
  const b = await box(l);
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(20, b.height / 2), { steps: 2 });
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

for (const [label, make] of [
  ["on the whiteboard", onWhiteboard],
  ["in /boardkit", inBoardkit],
] as const) {
  test(`typing at once after one click on a "+", ${label}: every character is kept (card "+", list "+", full "+ Add a card", full "+ Add a list")`, async ({ page, context }) => {
    const w = await make(page, context);
    const { id, root } = w;
    const hover = async (l: Locator) => {
      const b = await box(l);
      await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 3 });
    };
    const settle = async () => {
      for (let i = 0; i < 3 && (await page.locator("textarea:focus").count()) > 0; i++) await page.keyboard.press("Escape");
      if (label === "on the whiteboard") {
        for (let i = 0; i < 3 && (await editing(page)); i++) await page.keyboard.press("Escape");
        await page.evaluate(() => void (window as any).editor.selectNone());
        await page.mouse.move(10, 10, { steps: 2 });
      }
    };

    // The card "+" (a slim row on the whiteboard; the full button in Boardkit).
    const before = await cardTitles(page, id, 0);
    await hover(listAt(root, 0));
    await pressThenType(page, listAt(root, 0).locator('[data-add="card"]'), "Quick card one");
    await expect.poll(() => cardTitles(page, id, 0)).toEqual([...before, "Quick card one"]);
    await settle();

    // The list "+" (the ghost column on the whiteboard; the full button in Boardkit).
    const lists = (await record(page, id)).board.listOrder.length;
    await hover(listAt(root, 0));
    await pressThenType(page, root.locator('[data-add="list"]'), "Quick list");
    const r = await saved(page, id, (r) => r.board.listOrder.length === lists + 1);
    expect(r.board.lists[r.board.listOrder.at(-1)!].title).toBe("Quick list");
    await settle();

    // The new list is empty: its full "+ Add a card".
    const last = root.locator("section[data-list-id]").last();
    await hover(last);
    await pressThenType(page, last.locator('[data-add="card"]'), "Quick card two");
    await expect.poll(() => cardTitles(page, id, lists)).toEqual(["Quick card two"]);
  });
}

test(`typing at once after one click on the full "+ Add a list" of a board with no lists, on the whiteboard`, async ({ page }) => {
  await openWhiteboard(page);
  await page.getByTestId("tools.board").click();
  await page.getByTestId("new-board").click();
  await expect(page.getByTestId("board-name-field")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  const root = page.locator(".tl-html-container [data-boardkit-board]").first();
  const boardId = await page.evaluate(() => (window as any).editor.getCurrentPageShapes()[0].props.boardId as string);
  await pressThenType(page, root.locator('[data-add="list"]'), "First list typed fast");
  const r = await saved(page, boardId, (r) => r.board.listOrder.length === 1);
  expect(r.board.lists[r.board.listOrder[0]].title).toBe("First list typed fast");
});

// ---- Click away: the other inline fields ------------------------------------

for (const [label, make] of [
  ["on the whiteboard", onWhiteboard],
  ["in /boardkit", inBoardkit],
] as const) {
  test(`click away saves a card's thots, ${label}`, async ({ page, context }) => {
    const w = await make(page, context);
    const { id, root } = w;
    const r0 = (await record(page, id)).board;
    const cardId = r0.cardOrder[r0.listOrder[0]][0];
    const card = root.locator(`article[data-card-id="${cardId}"]`);
    if (label === "on the whiteboard") {
      // The board edited first (a double-click on the card's title, its
      // rename let go).
      await w.renameCard(0, 0);
      await expect(page.getByRole("textbox", { name: "Card title" })).toBeFocused();
      await page.keyboard.press("Escape");
    }
    await card.hover();
    await card.locator("[data-thots-toggle]").click();
    await card.getByRole("button", { name: "Pregame thots", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Pregame thots" })).toBeFocused();
    await page.keyboard.type("Thots kept by a click away");
    await w.away();
    await saved(page, id, (r) => (r.board.cards[cardId] as { description?: string }).description === "Thots kept by a click away");
  });
}

const storedMap = (page: Page, mapId: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem(`linkkit:map:${id}`) ?? "null") as { map: any } | null)?.map, mapId);

for (const [label, make] of [
  ["on the whiteboard", mapOnWhiteboard],
  ["in /linkkit", mapInLinkkit],
] as const) {
  test(`click away saves an arrow's label, ${label}`, async ({ page, context }) => {
    const w = await make(page, context);
    await w.addChild("Top");
    await page.keyboard.type("Kid");
    await page.keyboard.press("Enter");
    await expect.poll(() => mapNames(page, w.mapId)).toEqual(["Kid", "Top"]);
    // Every box shows where the map shows (it never scrolls inside).
    const area = await box(page.locator("[data-map-view]").first());
    for (const b of await page.locator("[data-map-view] [data-box-id]").all()) {
      const r = await box(b);
      expect(r.x >= area.x - 1 && r.y >= area.y - 1 && r.x + r.width <= area.x + area.width + 1 && r.y + r.height <= area.y + area.height + 1, "box inside the map's area").toBe(true);
    }
    // Picked by a click on its line, a third of the way along (its "+ label"
    // then shows). Placed from the line's own box on screen: getScreenCTM
    // leaves out the whiteboard's CSS scale.
    const at = await page.evaluate(() => {
      const path = document.querySelector<SVGPathElement>(".react-flow__edge path")!;
      const p = path.getPointAtLength(path.getTotalLength() * 0.3);
      const b = path.getBBox();
      const r = path.getBoundingClientRect();
      const k = b.width > b.height ? r.width / b.width : r.height / b.height;
      return { x: r.x + (p.x - b.x) * k, y: r.y + (p.y - b.y) * k };
    });
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => page.getByRole("button", { name: "+ label" }).evaluate((el) => getComputedStyle(el.parentElement!).opacity)).toBe("1");
    await page.getByRole("button", { name: "+ label" }).click();
    const field = page.getByRole("textbox", { name: "Arrow label" });
    await expect(field).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("only if sunny");
    await w.away();
    await expect.poll(async () => Object.values((await storedMap(page, w.mapId)).links).map((l: any) => l.label)).toEqual(["only if sunny"]);
  });
}

/** A new 8-player bracket made in Linkkit, its first name typed and kept
    by a click away on its paper: its id. */
async function bracketWithAClickAway(page: Page): Promise<string> {
  await page.goto("/linkkit/");
  await expect(page.locator("[data-ready]")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "+ New" }).click();
  await page.getByRole("menuitem", { name: "Bracket" }).click();
  await page.getByRole("menuitem", { name: "8 players", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Player name" })).toBeFocused();
  await page.keyboard.type("Ann");
  const view = await box(page.locator("[data-map-view]"));
  await page.mouse.click(view.x + view.width - 30, view.y + view.height - 30);
  await expect(page.getByRole("textbox", { name: "Player name" })).toHaveCount(0);
  return page.evaluate(() => localStorage.getItem("linkkit:active")!);
}
const playerNames = async (page: Page, mapId: string) =>
  Object.values(((await storedMap(page, mapId))?.players ?? {}) as Record<string, { name: string }>)
    .map((p) => p.name)
    .filter(Boolean)
    .sort();

test("click away saves a bracket player's name, in /linkkit and on the whiteboard", async ({ page }) => {
  const mapId = await bracketWithAClickAway(page);
  await expect.poll(() => playerNames(page, mapId)).toEqual(["Ann"]);

  await openWhiteboard(page);
  await page.getByTestId("tools.map").click();
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  const root = page.locator(".tl-html-container [data-linkkit-map]").first();
  await expect(root.locator("[data-map-view][data-ready]")).toBeVisible();
  const r = await box(root.locator("[data-player-row]").nth(1));
  await page.mouse.dblclick(r.x + r.width / 2, r.y + r.height / 2);
  if ((await page.getByRole("textbox", { name: "Player name" }).count()) === 0) {
    // Editing started; a double-click on the row now renames it.
    const r2 = await box(root.locator("[data-player-row]").nth(1));
    await page.mouse.dblclick(r2.x + r2.width / 2, r2.y + r2.height / 2);
  }
  await expect(page.getByRole("textbox", { name: "Player name" })).toBeFocused();
  await page.keyboard.type("Bob");
  const b = await box(root);
  const vp = page.viewportSize()!;
  await page.mouse.click(Math.min(vp.width - 30, b.x + b.width + 200), Math.min(vp.height - 120, b.y + b.height / 2));
  await expect.poll(() => playerNames(page, mapId)).toEqual(["Ann", "Bob"]);
});

test("click away saves the map's name and a template's name, in /linkkit", async ({ page, context }) => {
  const w = await mapInLinkkit(page, context);
  // The map's name, in the header.
  await page.locator("button[title='Rename map']").click();
  await expect(page.getByRole("textbox", { name: "Map name" })).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Map renamed by a click away");
  await w.away();
  await expect
    .poll(() =>
      page.evaluate((id) => (JSON.parse(localStorage.getItem("linkkit:registry")!) as { maps: { id: string; name: string }[] }).maps.find((m) => m.id === id)?.name, w.mapId),
    )
    .toBe("Map renamed by a click away");

  // A template's name, in the template gallery.
  await page.getByRole("button", { name: /^Switch map/ }).click();
  await page.getByRole("menuitem", { name: "This map" }).click();
  await page.getByRole("menuitem", { name: /^Save as a template/ }).click();
  const nameField = page.getByRole("dialog").getByRole("textbox", { name: "Template name" });
  await expect(nameField).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Template one");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Switch map/ }).click();
  await page.getByRole("menuitem", { name: "+ New" }).click();
  await page.getByRole("menuitem", { name: /^From a template/ }).click();
  const gallery = page.getByRole("dialog");
  await gallery.locator("button[title='Rename this template']").first().click();
  const field = gallery.getByRole("textbox", { name: "Template name" });
  await expect(field).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Template renamed");
  // A click on the gallery's own heading: away from the field.
  await gallery.getByRole("heading").first().click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("linkkit:templates") ?? "")).toContain("Template renamed");
});

test("click away saves a new map widget's name, on the whiteboard", async ({ page }) => {
  await openWhiteboard(page);
  await page.getByTestId("tools.map").click();
  await page.getByTestId("new-map").click();
  await expect(page.getByTestId("map-name-field")).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Named by a click away");
  await page.mouse.click(30, 500);
  await expect(page.getByTestId("map-name-field")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem("linkkit:registry")!) as { maps: { name: string }[] }).maps.map((m) => m.name)))
    .toContain("Named by a click away");
});

// ---- A double-click on a heavy board's card title renames it ----------------

test("a double-click on a card title of a big board (8 lists, 240 cards), not being edited, starts editing and renames that card", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  // A big board, set up as perf.e2e.ts does: its editing view takes the
  // longest to draw, so the title is found only once it is there.
  await page.evaluate((id) => {
    const key = `boardkit:board:${id}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    const b = rec.board;
    b.lists = {};
    b.cards = {};
    b.cardOrder = {};
    b.listOrder = [];
    for (let l = 0; l < 8; l++) {
      const lid = `big-l${l}`;
      b.listOrder.push(lid);
      b.lists[lid] = { id: lid, title: `List ${l + 1}` };
      b.cardOrder[lid] = [];
      for (let c = 0; c < 30; c++) {
        const cid = `big-c${l}-${c}`;
        b.cards[cid] = { id: cid, title: `Game ${c + 1}: Team ${l}A vs Team ${l}B` };
        b.cardOrder[lid].push(cid);
      }
    }
    rec.rev += 1;
    localStorage.setItem(key, JSON.stringify(rec));
  }, id);
  await page.getByTestId("tools.board").click();
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  const root = page.locator(".tl-html-container [data-boardkit-board]").first();
  await expect(root.locator("article[data-card-id]")).toHaveCount(240);
  await page.keyboard.press("Escape");
  await page.evaluate(() => void (window as any).editor.selectNone());
  for (const cardId of ["big-c3-4", "big-c6-20"]) {
    const t = await box(root.locator(`article[data-card-id="${cardId}"] [data-card-title]`));
    await page.mouse.dblclick(t.x + 10, t.y + t.height / 2);
    const field = page.getByRole("textbox", { name: "Card title" });
    await expect(field).toBeFocused();
    await expect(page.locator(`article[data-card-id="${cardId}"]`).getByRole("textbox", { name: "Card title" })).toBeFocused();
    await page.keyboard.press("Escape");
    for (let i = 0; i < 3 && (await editing(page)); i++) await page.keyboard.press("Escape");
  }
});
