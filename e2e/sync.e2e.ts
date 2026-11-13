import { expect, test, type BrowserContext, type Page } from "./test";

import { box, seedBoard, seedMap, showCalendarNotes } from "./helpers";

/**
 * Two-way sync as a rule for every widget (owner, Edges round item 8). An
 * edit in the app (/boardkit, /linkkit, /calendar) shows on the whiteboard
 * and the other way round, with both open in two tabs and with only one
 * open (the other opened after). Each direction that isn't tested elsewhere
 * is here; the rest, by file:
 * - board, app → whiteboard, both open: boards.e2e.ts "live both ways";
 * - map, app → whiteboard, both open: maps.e2e.ts "live: an edit in /linkkit";
 * - list widget, both ways, both open: widgets.e2e.ts "a single list";
 * - Slate, /calendar → widget, both open: slate.e2e.ts "notes are read only"
 *   (the widget's notes are read only until Slate step 4: no widget → app).
 */

test.use({ viewport: { width: 1600, height: 1000 } });

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const record = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!).board, id) as Promise<{ listOrder: string[]; lists: Record<string, { title: string }> }>;

/** The board (or one of its lists) placed with the widget picker at (300, 250). */
async function place(page: Page, boardId: string, listId?: string) {
  await page.mouse.move(300, 250, { steps: 2 });
  await page.keyboard.press("e");
  const picker = page.getByTestId("widget-picker");
  if (listId) {
    await picker.locator(`[data-testid="widget-expand"][data-id="${boardId}"]`).click();
    await picker.locator(`[data-testid="widget-list"][data-id="${boardId}:${listId}"]`).click();
  } else await picker.locator(`[data-testid="widget-board"][data-id="${boardId}"]`).click();
  await page.evaluate(() => void (window as any).editor.selectNone());
}

const wbList = (page: Page, listId: string) => page.locator(`.tl-html-container [data-boardkit-board] section[data-list-id="${listId}"]`).first();

/** A card added on the whiteboard, with the list's "+" (one click starts editing). */
async function addOnWhiteboard(page: Page, listId: string, title: string) {
  const l = await box(wbList(page, listId));
  await page.mouse.move(l.x + l.width / 2, l.y + l.height - 10, { steps: 3 });
  const plus = await box(wbList(page, listId).locator('[data-add="card"]'));
  await page.mouse.click(plus.x + plus.width / 2, plus.y + plus.height / 2);
  await expect(page.getByRole("textbox", { name: "Add a card" })).toBeFocused();
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}

/** A card added in /boardkit (its own tab, the board shown). */
async function addInBoardkit(bk: Page, listId: string, title: string) {
  const col = bk.locator(`section[data-list-id="${listId}"]`);
  await col.hover();
  await col.getByRole("button", { name: /Add a card/ }).click();
  await bk.keyboard.type(title);
  await bk.keyboard.press("Enter");
  await bk.keyboard.press("Escape");
}

async function openBoardkit(context: BrowserContext) {
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  await expect(bk.locator("section[data-list-id]").first()).toBeVisible({ timeout: 15_000 });
  return bk;
}

for (const kind of ["board", "list"] as const) {
  test(`${kind} widget: whiteboard → /boardkit with both open; and with only one open, each way`, async ({ page, context }) => {
    test.setTimeout(150_000);
    const boardId = await seedBoard(context);
    await openWhiteboard(page);
    const listId = (await record(page, boardId)).listOrder[0]!;
    await place(page, boardId, kind === "list" ? listId : undefined);

    // Both open: whiteboard → /boardkit, no reload.
    const bk = await openBoardkit(context);
    await page.bringToFront();
    await addOnWhiteboard(page, listId, `${kind} wb-both 31`);
    await expect(bk.locator(`section[data-list-id="${listId}"] article`, { hasText: `${kind} wb-both 31` })).toBeVisible({ timeout: 10_000 });

    // Only the whiteboard open: its edit is in /boardkit when that opens.
    await bk.close();
    await addOnWhiteboard(page, listId, `${kind} wb-alone 32`);
    await page.waitForTimeout(800);
    const bk2 = await openBoardkit(context);
    await expect(bk2.locator(`section[data-list-id="${listId}"] article`, { hasText: `${kind} wb-alone 32` })).toBeVisible();

    // Only /boardkit open: its edit is on the whiteboard when that opens.
    await page.close();
    await addInBoardkit(bk2, listId, `${kind} bk-alone 33`);
    await bk2.waitForTimeout(800);
    const wb = await context.newPage();
    await openWhiteboard(wb);
    await expect(wbList(wb, listId).locator("article", { hasText: `${kind} bk-alone 33` })).toBeVisible({ timeout: 10_000 });
  });
}

test("map widget: whiteboard → /linkkit with both open; and with only one open, each way", async ({ page, context }) => {
  test.setTimeout(150_000);
  const mapId = await seedMap(context, "Sync start");
  await openWhiteboard(page);
  await page.mouse.move(300, 250, { steps: 2 });
  await page.keyboard.press("e");
  await page.getByTestId("widget-picker").locator(`[data-testid="widget-map"][data-id="${mapId}"]`).click();
  await page.evaluate(() => void (window as any).editor.selectNone());
  const shapeId = await page.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).find((s) => s.type === "linkkit-map").id as string);
  const widget = page.locator(`[id="${shapeId}"] [data-linkkit-map]`);
  await expect(widget.locator("[data-box-id]", { hasText: "Sync start" })).toBeVisible();

  /** Renames the start box on the whiteboard (double-click the widget, then the box). */
  const renameOnWhiteboard = async (from: string, to: string) => {
    const w = await box(widget);
    await page.mouse.dblclick(w.x + w.width / 2, w.y + w.height / 2);
    await expect(page.locator('[data-linkkit-map][data-editing="true"] [data-map-view][data-ready]')).toBeVisible();
    const b = await box(page.locator("[data-linkkit-map] [data-box-id]", { hasText: from }).first());
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    await page.keyboard.press("Control+a");
    await page.keyboard.type(to);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
  };
  const openLinkkit = async () => {
    const lk = await context.newPage();
    await lk.goto("/linkkit/");
    await expect(lk.getByRole("button", { name: /^Switch map/ })).toBeVisible();
    return lk;
  };

  // Both open: whiteboard → /linkkit (the map is the one it shows: just made there).
  const lk = await openLinkkit();
  await page.bringToFront();
  await renameOnWhiteboard("Sync start", "Renamed on wb");
  await expect(lk.locator("[data-box-id]", { hasText: "Renamed on wb" })).toBeVisible({ timeout: 10_000 });

  // Only the whiteboard open.
  await lk.close();
  await renameOnWhiteboard("Renamed on wb", "Wb alone");
  await page.waitForTimeout(800);
  const lk2 = await openLinkkit();
  await expect(lk2.locator("[data-box-id]", { hasText: "Wb alone" })).toBeVisible();

  // Only /linkkit open.
  await page.close();
  const startBox = lk2.locator("[data-box-id]").filter({ hasText: /^Wb alone$/ });
  await startBox.dblclick();
  await lk2.keyboard.press("Control+a");
  await lk2.keyboard.type("Lk alone");
  await lk2.keyboard.press("Enter");
  await lk2.waitForTimeout(800);
  const wb = await context.newPage();
  await openWhiteboard(wb);
  await expect(wb.locator(`[id="${shapeId}"] [data-linkkit-map] [data-box-id]`, { hasText: "Lk alone" })).toBeVisible({ timeout: 10_000 });
});

test("Slate widget: a note typed in /calendar with the whiteboard closed shows in the widget when it opens", async ({ page, context, request }) => {
  await openWhiteboard(page);
  await page.getByTestId("tools.slate").click();
  await expect.poll(() => page.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).some((s) => s.type === "calendarkit-slate" && s.props.cols > 0))).toBe(true);
  const date = await page.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).find((s) => s.type === "calendarkit-slate").props.date as string);
  const first = await page.locator('[data-testid="slate-widget"] .ck-slate-card').first().getAttribute("data-game-id");
  await page.waitForTimeout(800);
  await page.close();

  const ck = await context.newPage();
  await ck.addInitScript((d) => ((window as unknown as { __ckOpenDate?: string }).__ckOpenDate = d), date);
  await ck.goto("/calendar/?view=league&layout=slate");
  await showCalendarNotes(ck);
  const note = ck.locator(`[data-testid="slate"] [data-game-id="${first}"] [data-testid="note-text"]`);
  await note.fill("Typed alone 44");
  await note.blur();
  await ck.waitForTimeout(800);
  await ck.close();

  const wb = await context.newPage();
  await openWhiteboard(wb);
  await expect(wb.locator(`[data-testid="slate-widget"] [data-game-id="${first}"] [data-testid="note-text"]`)).toHaveText("Typed alone 44", { timeout: 10_000 });
  void request;
});
