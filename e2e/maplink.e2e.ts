import { expect, test, type BrowserContext, type Page } from "./test";

import { box, seedBoard, seedMap, openBoardList, openMapList } from "./helpers";

/**
 * Linked boards made visible and one click away (hand-test round items 8
 * and 9, owner 2026-10-21): badges in the pickers, "Add map view" on a board
 * widget, "Unlink map" with undo, and List | Map | Both on one click. Fresh
 * browser profile per test; boards and maps are made here.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

type BoardWidget = { id: string; boardId: string; scale: number; view?: string };

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** A Linkkit tree "name" > "List A" > "Card 1", linked to a new Boardkit board. */
async function seedLinked(context: BrowserContext, name: string): Promise<{ mapId: string; boardId: string }> {
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
  await menu("+ New", "Map with tree rules");
  await expect(field).toBeFocused();
  await lk.keyboard.type(name);
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
  await addChild(name, "List A");
  await addChild("List A", "Card 1");
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

const boardShapes = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "boardkit-board")
      .map((s: any) => ({ id: s.id, ...s.props, view: s.meta?.view })),
  ) as Promise<BoardWidget[]>;

async function placeBoard(page: Page, boardId: string): Promise<BoardWidget> {
  const before = (await boardShapes(page)).map((s) => s.id);
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  let made: BoardWidget | undefined;
  await expect
    .poll(async () => {
      made = (await boardShapes(page)).find((s) => !before.includes(s.id));
      return made?.scale ?? 0;
    })
    .toBeGreaterThan(0);
  return made!;
}

/** Nothing selected or edited, pointer away from everything. */
async function leaveAll(page: Page) {
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const e = (window as any).editor;
    e.setEditingShape(null);
    e.selectNone();
  });
  await page.mouse.move(5, 400);
}

const switchOf = (page: Page, shapeId: string) => page.locator(`[id="${shapeId}"] [data-testid="view-switch"]`);
const linkedOf = (page: Page, mapId: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem(`linkkit:map:${id}`) ?? "null") as { map?: { linkedBoard?: string } } | null)?.map?.linkedBoard ?? null, mapId);
const linkedMapOfBoard = (page: Page, boardId: string) =>
  page.evaluate((boardId) => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.startsWith("linkkit:map:")) continue;
      const m = (JSON.parse(localStorage.getItem(k)!) as { map?: { linkedBoard?: string; id: string } }).map;
      if (m?.linkedBoard === boardId) return m.id;
    }
    return null;
  }, boardId);

test("the pickers mark linked boards (map icon, “+ map”) and linked maps (“+ board”), and not the others", async ({ page, context }) => {
  const { boardId, mapId } = await seedLinked(context, "Linked tree");
  const plainBoard = await seedBoard(context);
  const plainMap = await seedMap(context, "On its own");
  await openWhiteboard(page);
  await openBoardList(page);
  const boards = page.getByTestId("board-picker");
  await expect(boards.locator(`[data-board="${boardId}"]`).getByTestId("linked-map-badge")).toHaveText("+ map");
  await expect(boards.locator(`[data-board="${boardId}"] svg`)).toHaveCount(1);
  await expect(boards.locator(`[data-board="${plainBoard}"]`).getByTestId("linked-map-badge")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await openMapList(page);
  const maps = page.getByTestId("map-picker");
  await expect(maps.locator(`[data-map="${mapId}"]`).getByTestId("linked-board-badge")).toHaveText("+ board");
  await expect(maps.locator(`[data-map="${plainMap}"]`).getByTestId("linked-board-badge")).toHaveCount(0);
});

test("“Add map view” on an unlinked board (one click, not selected first) links a new map: the switch appears and Map shows its boxes; “Unlink map” takes it away; Ctrl+Z links it again", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await openWhiteboard(page);
  const widget = await placeBoard(page, boardId);
  await expect(switchOf(page, widget.id)).toHaveCount(0);
  await leaveAll(page);

  // Pointing at the board shows the control; one click on it.
  const add = page.locator(`[id="${widget.id}"] [data-testid="add-map-view"]`);
  const b = await box(page.locator(`[id="${widget.id}"] [data-boardkit-board]`));
  await page.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 4 });
  await expect(add).toBeVisible();
  const a = await box(add);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 6 });
  await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
  await expect(switchOf(page, widget.id)).toHaveCount(1);
  const mapId = await linkedMapOfBoard(page, boardId);
  expect(mapId).not.toBeNull();

  // Map view: the map with its boxes (the board's name, its lists and cards).
  await switchOf(page, widget.id).locator('[data-view="map"]').click();
  const boxes = page.locator(`[id="${widget.id}"] [data-linkkit-map] [data-box-id]`);
  await expect.poll(() => boxes.count()).toBeGreaterThan(0);

  // Unlink from "⋯": the switch goes, the list shows, the map is ordinary.
  await page.locator(`[id="${widget.id}"] [data-testid="board-menu"]`).click();
  await page.locator(`[id="${widget.id}"] [data-testid="unlink-map"]`).click();
  await expect(switchOf(page, widget.id)).toHaveCount(0);
  await expect(page.locator(`[id="${widget.id}"] [data-boardkit-board]`)).toBeVisible();
  expect(await linkedOf(page, mapId!)).toBeNull();

  // Ctrl+Z: linked again, the switch back, the map view as it was.
  await page.keyboard.press("Control+z");
  await expect(switchOf(page, widget.id)).toHaveCount(1);
  expect(await linkedOf(page, mapId!)).toBe(boardId);
  await expect(switchOf(page, widget.id).locator('[data-view="map"]')).toHaveAttribute("aria-pressed", "true");
  // Ctrl+Y: unlinked again.
  await page.keyboard.press("Control+y");
  await expect(switchOf(page, widget.id)).toHaveCount(0);
  expect(await linkedOf(page, mapId!)).toBeNull();
});

test("List | Map | Both: from a board neither selected nor edited, one click on each switches the view at once", async ({ page, context }) => {
  const { boardId } = await seedLinked(context, "One click");
  await openWhiteboard(page);
  const widget = await placeBoard(page, boardId);
  for (const view of ["map", "both", "list", "both", "map"] as const) {
    await leaveAll(page);
    expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds().length)).toBe(0);
    const b = await box(page.locator(`[id="${widget.id}"] .gb-scaled`));
    // Onto the widget from below its name, then up to the switch, as a hand would go.
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
    const button = switchOf(page, widget.id).locator(`[data-view="${view}"]`);
    await expect(button, `${view}: the switch shows on hover`).toBeVisible();
    const s = await box(button);
    await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2, { steps: 8 });
    await page.mouse.click(s.x + s.width / 2, s.y + s.height / 2);
    await expect(button, `${view}: one click`).toHaveAttribute("aria-pressed", "true");
    expect((await boardShapes(page)).find((w) => w.id === widget.id)!.view).toBe(view);
    await expect(page.locator(`[id="${widget.id}"] [data-boardkit-board]`)).toHaveCount(view === "map" ? 0 : 1);
    await expect(page.locator(`[id="${widget.id}"] [data-linkkit-map]`)).toHaveCount(view === "list" ? 0 : 1);
  }
});
