import { expect, test, type BrowserContext, type Page } from "./test";

import { box, seedBoard, seedMap } from "./helpers";

/**
 * Adding any widget faster than a screenshot (owner, Edges round item 3;
 * src/widgets/). Each path is counted in the owner's actions (a click, a
 * key press, a typed search): never more than 3. Fresh browser profile.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

type W = { id: string; type: string; x: number; y: number; boardId?: string; mapId?: string; listId?: string; date?: string; meta?: string; w?: number; scale?: number };
const widgets = (page: Page) =>
  page.evaluate(() =>
    ((window as any).editor.getCurrentPageShapes() as any[])
      .filter((s) => ["boardkit-board", "linkkit-map", "calendarkit-slate"].includes(s.type))
      .map((s) => ({ id: s.id, type: s.type, x: s.x, y: s.y, boardId: s.props.boardId, mapId: s.props.mapId, date: s.props.date, listId: s.meta?.listId, meta: JSON.stringify(s.meta), w: s.props.w, scale: s.props.scale })),
  ) as Promise<W[]>;
const newest = async (page: Page) => (await widgets(page)).at(-1)!;
const clear = (page: Page) => page.evaluate(() => { const e = (window as any).editor; e.deleteShapes(e.getCurrentPageShapes().map((s: any) => s.id)); });

/** The board's saved record. */
const record = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!).board, id) as Promise<{ listOrder: string[]; lists: Record<string, { title: string }>; cardOrder: Record<string, string[]>; cards: Record<string, { title: string }> }>;

/** The mouse at (x, y) on the page, the picker opened with E there: 2 actions to place (E + a click). */
async function pickAt(page: Page, x: number, y: number) {
  await page.mouse.move(x, y, { steps: 2 });
  await page.keyboard.press("e");
  await expect(page.getByTestId("widget-picker")).toBeVisible();
  await expect(page.getByTestId("widget-search")).toBeFocused();
}

/** The top-left corner of the widget sits at page point (x, y) (100%: the screen point), give or take a board's own frame (its first fit moves it up to 16 px). */
async function cornerAt(page: Page, w: W, x: number, y: number) {
  // A widget settles in its first moments (its own layout, a map onto its boxes).
  await expect(async () => cornerNow(page, w, x, y)).toPass({ timeout: 4_000 });
}

async function cornerNow(page: Page, w: W, x: number, y: number) {
  // On screen: where the owner sees it (the camera may sit anywhere on a page bigger than the window).
  const b = await page.evaluate((id) => {
    const e = (window as any).editor;
    const r = e.getShapePageBounds(id);
    const a = e.pageToScreen({ x: r.x, y: r.y });
    const c = e.pageToScreen({ x: r.maxX, y: r.maxY });
    const p = e.getViewportPageBounds();
    return { x: a.x, y: a.y, maxX: c.x, maxY: c.y, pageRight: e.pageToScreen({ x: p.maxX, y: 0 }).x, pageBottom: e.pageToScreen({ x: 0, y: p.maxY }).y, cam: JSON.stringify(e.getCamera()) };
  }, w.id);
  const info = `${w.type} at ${Math.round(b.x)},${Math.round(b.y)} to ${Math.round(b.maxX)},${Math.round(b.maxY)}, camera ${b.cam}`;
  // Too big to fit from there: pulled back inside the page (its far side on the page's edge).
  if (Math.abs(b.x - x) >= 25) expect(b.x < x && Math.abs(b.maxX - b.pageRight) < 2, `x: at the cursor or pulled inside: ${info}`).toBe(true);
  if (Math.abs(b.y - y) >= 25) expect(b.y < y && Math.abs(b.maxY - b.pageBottom) < 2, `y: at the cursor or pulled inside: ${info}`).toBe(true);
}

test.describe("adding widgets", () => {
  test.setTimeout(180_000);

  test("one picker for every kind; each kind placed at the cursor in 2 actions (E, click); the search is focused; most recently used first", async ({ page, context }) => {
    const boardId = await seedBoard(context);
    const mapId = await seedMap(context, "Picker map");
    await open(page);

    // A board: E over the page, then its row. 2 actions.
    await pickAt(page, 300, 300);
    const picker = page.getByTestId("widget-picker");
    for (const t of ["widget-new-board", "widget-new-map", "widget-new-slate"]) await expect(picker.getByTestId(t)).toBeVisible();
    await expect(picker.locator(`[data-testid="widget-board"][data-id="${boardId}"]`)).toBeVisible();
    await expect(picker.locator(`[data-testid="widget-map"][data-id="${mapId}"]`)).toBeVisible();
    await expect(picker.getByTestId("widget-slate")).toHaveCount(3);
    await picker.locator(`[data-testid="widget-board"][data-id="${boardId}"]`).click();
    let w = await newest(page);
    expect(w).toMatchObject({ type: "boardkit-board", boardId });
    await cornerAt(page, w, 300, 300);

    // A map. 2 actions.
    await pickAt(page, 900, 200);
    await page.getByTestId("widget-picker").locator(`[data-testid="widget-map"][data-id="${mapId}"]`).click();
    w = await newest(page);
    expect(w).toMatchObject({ type: "linkkit-map", mapId });
    await cornerAt(page, w, 900, 200);

    // A Slate night: tomorrow's. 2 actions.
    await pickAt(page, 1200, 600);
    const tomorrow = page.getByTestId("widget-picker").getByTestId("widget-slate").nth(2);
    const date = await tomorrow.getAttribute("data-id");
    await tomorrow.click();
    w = await newest(page);
    expect(w).toMatchObject({ type: "calendarkit-slate", date });

    // New ones, at the cursor too. 2 actions each.
    await clear(page);
    await pickAt(page, 400, 500);
    await page.getByTestId("widget-new-map").click();
    w = await newest(page);
    expect(w.type).toBe("linkkit-map");
    await cornerAt(page, w, 400, 500);
    // A new map's name is ready to type (as "+ New map" always did): done.
    await page.keyboard.press("Enter");

    // Most recently used first: the map, then the Slate night, then the board.
    await pickAt(page, 200, 200);
    const order = await page.getByTestId("widget-picker").locator('[data-testid="widget-board"], [data-testid="widget-map"], [data-testid="widget-slate"]').evaluateAll((els) => els.map((e) => `${e.getAttribute("data-testid")}:${e.getAttribute("data-id")}`));
    expect(order[0]).toBe(`widget-slate:${date}`);
    expect(order[1]).toBe(`widget-map:${mapId}`);
    expect(order[2]).toBe(`widget-board:${boardId}`);
    // Escape closes it, nothing placed.
    const n = (await widgets(page)).length;
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("widget-picker")).toHaveCount(0);
    expect((await widgets(page)).length).toBe(n);
  });

  test("the toolbar button: 2 clicks, placed in the middle of the view (the cursor is on the toolbar, off the page); its tooltip names the key", async ({ page, context }) => {
    const boardId = await seedBoard(context);
    await open(page);
    const button = page.getByTestId("tools.widgets");
    await expect(button).toHaveAttribute("title", /Add widget — E/);
    await button.click();
    await expect(page.getByTestId("widget-search")).toBeFocused();
    await page.getByTestId("widget-picker").locator(`[data-testid="widget-board"][data-id="${boardId}"]`).click();
    const w = await newest(page);
    const view = await page.evaluate(() => { const b = (window as any).editor.getViewportPageBounds(); return { x: b.midX, y: b.midY }; });
    const b = await page.evaluate((id) => (window as any).editor.getShapePageBounds(id), w.id);
    expect(b.x).toBeLessThan(view.x);
    expect(b.x + b.w).toBeGreaterThan(view.x);
  });

  test("a single list: 3 actions (E, its board's ▸, the list) or by search; the LIVE list, in sync with its board both ways", async ({ page, context }) => {
    const boardId = await seedBoard(context);
    await open(page);
    const rec = await record(page, boardId);
    const listId = rec.listOrder[1]!;
    const title = rec.lists[listId]!.title;

    // 3 actions: E, ▸, the list.
    await pickAt(page, 300, 250);
    await page.getByTestId("widget-picker").locator(`[data-testid="widget-expand"][data-id="${boardId}"]`).click();
    await page.getByTestId("widget-picker").locator(`[data-testid="widget-list"][data-id="${boardId}:${listId}"]`).click();
    const w = await newest(page);
    expect(w).toMatchObject({ type: "boardkit-board", boardId, listId });
    await cornerAt(page, w, 300, 250);
    const widget = page.locator(`[id="${w.id}"] [data-boardkit-board]`);
    await expect(widget.locator("section[data-list-id]")).toHaveCount(1);
    await expect(widget.locator(`section[data-list-id="${listId}"]`)).toBeVisible();

    // By search: E, typing, Enter (3 actions) gives the same list.
    await pickAt(page, 900, 250);
    await page.keyboard.type(title.slice(0, 6));
    await expect(page.getByTestId("widget-picker").locator(`[data-testid="widget-list"][data-id="${boardId}:${listId}"]`)).toBeVisible();

    await page.keyboard.press("Escape");

    // Boardkit → whiteboard: a card added in /boardkit shows in the list widget.
    const bk = await context.newPage();
    await bk.goto("/boardkit/");
    const col = bk.locator(`section[data-list-id="${listId}"]`);
    await col.hover();
    await col.getByRole("button", { name: /Add a card/ }).click();
    await bk.keyboard.type("From Boardkit 81");
    await bk.keyboard.press("Enter");
    await bk.keyboard.press("Escape");
    await expect(widget.locator("article[data-card-id]", { hasText: "From Boardkit 81" })).toBeVisible({ timeout: 10_000 });

    // Whiteboard → Boardkit: a card added in the list widget shows in /boardkit.
    const wb = await box(widget.locator(`section[data-list-id="${listId}"]`));
    await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height - 10, { steps: 3 });
    // A real press: the widget lets presses through to the whiteboard, which
    // hands a press on its "+" to Boardkit (one click, DECISIONS 2026-10-21).
    const plus = await box(widget.locator(`section[data-list-id="${listId}"] [data-add="card"]`));
    await page.mouse.click(plus.x + plus.width / 2, plus.y + plus.height / 2);
    await expect(page.getByRole("textbox", { name: "Add a card" })).toBeFocused();
    await page.keyboard.type("From the whiteboard 82");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(col.locator("article[data-card-id]", { hasText: "From the whiteboard 82" })).toBeVisible({ timeout: 10_000 });
    await bk.close();
  });

  test("copy in the app, paste on the whiteboard: Ctrl+C on a list in /boardkit, a board, a map in /linkkit; Ctrl+V lands that LIVE widget at the cursor", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const boardId = await seedBoard(context);
    const mapId = await seedMap(context, "Copied map");
    await open(page);
    const rec = await record(page, boardId);
    const listId = rec.listOrder[0]!;

    const copyIn = async (app: Page) => {
      await app.keyboard.press("Control+c");
      return app.evaluate(() => navigator.clipboard.readText());
    };
    const pasteAt = async (x: number, y: number) => {
      await page.bringToFront();
      await page.mouse.move(x, y, { steps: 2 });
      await page.keyboard.press("Control+v");
      await expect.poll(async () => (await widgets(page)).length).toBeGreaterThan(0);
    };

    // A list: the pointer over it in /boardkit, Ctrl+C (1), then Ctrl+V over the page (2).
    const bk = await context.newPage();
    await bk.goto("/boardkit/");
    await bk.locator(`section[data-list-id="${listId}"]`).hover();
    expect(await copyIn(bk)).toContain(`/boardkit/?board=${boardId}&list=${listId}`);
    await pasteAt(250, 300);
    let w = await newest(page);
    expect(w).toMatchObject({ type: "boardkit-board", boardId, listId });
    await cornerAt(page, w, 250, 300);
    await expect(page.locator(`[id="${w.id}"] [data-boardkit-board] section[data-list-id]`)).toHaveCount(1);

    // The whole board: the pointer off any list.
    await bk.bringToFront();
    await bk.mouse.move(5, 300);
    const text = await copyIn(bk);
    expect(text).toContain(`/boardkit/?board=${boardId}`);
    expect(text).not.toContain("list=");
    await clear(page);
    await pasteAt(700, 200);
    w = await newest(page);
    expect(w).toMatchObject({ type: "boardkit-board", boardId });
    expect(w.listId).toBeUndefined();
    await cornerAt(page, w, 700, 200);

    // A map, nothing picked in /linkkit.
    const lk = await context.newPage();
    await lk.goto(`/linkkit/`);
    await expect(lk.getByRole("button", { name: /^Switch map/ })).toBeVisible();
    await lk.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
    expect(await copyIn(lk)).toContain(`/linkkit/?map=`);
    const copiedMap = new URL((await lk.evaluate(() => navigator.clipboard.readText())).trim()).searchParams.get("map");
    await clear(page);
    await pasteAt(500, 400);
    w = await newest(page);
    expect(w).toMatchObject({ type: "linkkit-map", mapId: copiedMap });
    await cornerAt(page, w, 500, 400);
    void mapId;
    await bk.close();
    await lk.close();
  });
});

export type { BrowserContext };
