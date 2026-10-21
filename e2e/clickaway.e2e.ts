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
