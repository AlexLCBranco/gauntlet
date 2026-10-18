import { expect, test, type Page } from "@playwright/test";

import { addStone, alignedPage, box, canvasEl, canvasScroll, dragBy, frameOf, pageEl, savedLayout, seedBoard, seedMap, stones } from "./helpers";

/**
 * The canvas (gauntlet phase 4) on the home page, with the real apps in its
 * frames. Fresh profile per test: the only board is Boardkit's first-visit
 * one, the only maps the ones made here ("ZZ …").
 */

const MAP = "ZZ canvas map";

/** The stone's box is inside its page's box (2 px for borders). */
async function expectInside(page: Page, stoneIndex: number, pageIndex: number) {
  const s = await box(stones(page).nth(stoneIndex));
  const p = await box(pageEl(page, pageIndex));
  expect(s.x).toBeGreaterThanOrEqual(p.x - 2);
  expect(s.y).toBeGreaterThanOrEqual(p.y - 2);
  expect(s.x + s.width).toBeLessThanOrEqual(p.x + p.width + 2);
  expect(s.y + s.height).toBeLessThanOrEqual(p.y + p.height + 2);
  return { s, p };
}

test("add stones, move and resize inside the page, undo/redo, and the layout survives a reload", async ({ context }) => {
  await seedBoard(context);
  await seedMap(context, MAP);
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 1 of 1");

  // The picker lists every board and map; picking one puts it on the page,
  // its app running in the frame.
  const board = await addStone(page, "Untitled board");
  const bk = await frameOf(board);
  await expect(bk.locator("[data-card-id]").first()).toBeVisible({ timeout: 15_000 });
  await expect(bk.getByRole("button", { name: "Switch board" })).toHaveCount(0);
  const map = await addStone(page, MAP);
  const lk = await frameOf(map);
  await expect(lk.locator("[data-box-id]").filter({ hasText: MAP })).toBeVisible({ timeout: 15_000 });
  await expect(map.getByText(MAP)).toBeVisible();
  // Side by side, both inside page 1.
  await expectInside(page, 0, 0);
  await expectInside(page, 1, 0);
  expect((await box(map)).x).toBeGreaterThan((await box(board)).x + (await box(board)).width - 1);

  // Dragged far past the bottom-right corner: it stops at the page's edges.
  const header = board.locator("[title='Drag to move']");
  await dragBy(page, header, 3000, 3000, { x: 60, y: 10 });
  let { s, p } = await expectInside(page, 0, 0);
  expect(p.x + p.width - (s.x + s.width)).toBeLessThan(4);
  expect(p.y + p.height - (s.y + s.height)).toBeLessThan(4);
  const moved = (await savedLayout(page)).pages[0].stones[0];

  // Resized far past the top-left: it stops at the minimum size; far past
  // the bottom-right: at the page's edges. Nothing ever leaves the page.
  const corner = board.locator("[title='Drag to resize']");
  await dragBy(page, corner, -3000, -3000);
  ({ s } = await expectInside(page, 0, 0));
  expect(s.width).toBeLessThan(p.width * 0.2);
  // It now overlaps the map's frame, and the one grabbed last is on top.
  expect(await board.evaluate((el) => document.elementFromPoint(el.getBoundingClientRect().x + 40, el.getBoundingClientRect().y + 10)!.closest("[data-stone-id]") === el)).toBe(true);
  await dragBy(page, header, -3000, -3000, { x: 40, y: 10 });
  await dragBy(page, corner, 3000, 3000);
  ({ s } = await expectInside(page, 0, 0));
  expect(s.width).toBeGreaterThan(p.width - 6);
  expect(s.height).toBeGreaterThan(p.height - 6);
  const big = (await savedLayout(page)).pages[0].stones[0];
  expect(big).toMatchObject({ x: 0, y: 0, w: 1, h: 1 });

  // Undo with the canvas focused: back one step at a time; redo forward.
  await canvasEl(page).focus();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await savedLayout(page)).pages[0].stones[0]).toMatchObject({ x: 0, y: 0 });
  expect((await savedLayout(page)).pages[0].stones[0].w).toBeLessThan(0.2);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await savedLayout(page)).pages[0].stones[0]).toEqual(moved);
  await page.keyboard.press("Control+Shift+z");
  await page.keyboard.press("Control+Shift+z");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await savedLayout(page)).pages[0].stones[0]).toEqual(big);
  // Undo of an add takes the stone off; redo brings it back.
  for (let i = 0; i < 5; i++) await page.keyboard.press("Control+z");
  await expect(stones(page)).toHaveCount(1);
  await page.keyboard.press("Control+y");
  await expect(stones(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(async () => (await savedLayout(page)).pages[0].stones[0]).toEqual(big);

  // Ctrl+Z inside a frame is that app's undo, not the canvas's.
  const before = JSON.stringify(await savedLayout(page));
  // (The board fills the page now, on top of the map.)
  await bk.locator("[data-board-canvas]").click({ position: { x: 5, y: 5 } });
  await expect(board).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);
  expect(JSON.stringify(await savedLayout(page))).toBe(before);

  // A reload: same pages, same stones, same places, same names.
  const boxes = [await box(board), await box(map)];
  await page.reload();
  await expect(stones(page)).toHaveCount(2);
  await expect(stones(page).nth(1).getByText(MAP)).toBeVisible();
  expect(JSON.stringify(await savedLayout(page))).toBe(before);
  const after = [await box(stones(page).nth(0)), await box(stones(page).nth(1))];
  for (const [i, b] of boxes.entries()) {
    expect(after[i].x).toBeCloseTo(b.x, 0);
    expect(after[i].width).toBeCloseTo(b.width, 0);
  }

  // Removing a stone, and undoing that.
  await stones(page).nth(1).getByRole("button", { name: `Remove ${MAP} from the canvas` }).click();
  await expect(stones(page)).toHaveCount(1);
  await canvasEl(page).focus();
  await page.keyboard.press("Control+z");
  await expect(stones(page)).toHaveCount(2);
});

test("page jumps land aligned, the focus outline shows where keys go, the overview jumps and reorders", async ({ context }) => {
  await seedBoard(context);
  const page = await context.newPage();
  await page.goto("/");
  const board = await addStone(page, "Untitled board");
  let bk = await frameOf(board);
  await expect(bk.locator("[data-card-id]").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "+ page" }).click();
  await page.getByRole("button", { name: "+ page" }).click();
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 3 of 3");
  await expect.poll(() => alignedPage(page)).toBe(2);

  // Keys: one page per press, landing aligned.
  await page.keyboard.press("PageUp");
  await expect.poll(() => alignedPage(page)).toBe(1);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => alignedPage(page)).toBe(0);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(400);
  expect(await alignedPage(page)).toBe(0);
  await page.keyboard.press("PageDown");
  await expect.poll(() => alignedPage(page)).toBe(1);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => alignedPage(page)).toBe(2);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  expect(await alignedPage(page)).toBe(2);
  // Scrolled part way into a page (normal scrolling, no snap): up goes back
  // to that page's top.
  await canvasEl(page).evaluate((el) => el.scrollBy(0, -200));
  await page.waitForTimeout(300);
  expect(await alignedPage(page)).toBeNull();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => alignedPage(page)).toBe(1);
  await page.keyboard.press("PageUp");
  await expect.poll(() => alignedPage(page)).toBe(0);

  // Focus outline: a click in the frame outlines it, and keys go to the
  // app, not the canvas. (The frame was unloaded while on page 3, two pages
  // away, and loaded again here.)
  await expect(board).toHaveAttribute("data-focused", "false");
  bk = await frameOf(board);
  await expect(bk.locator("[data-card-id]").first()).toBeVisible({ timeout: 15_000 });
  await bk.locator("[data-board-canvas]").click({ position: { x: 5, y: 5 } });
  await expect(board).toHaveAttribute("data-focused", "true");
  expect(await board.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  const top = await canvasScroll(page);
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(500);
  expect(await canvasScroll(page)).toBe(top);
  // A click on the page outside any frame gives the keys back.
  const p0 = await box(pageEl(page, 0));
  await page.mouse.click(p0.x + p0.width - 10, p0.y + p0.height - 10);
  await expect(board).toHaveAttribute("data-focused", "false");
  expect(await board.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
  await page.keyboard.press("PageDown");
  await expect.poll(() => alignedPage(page)).toBe(1);

  // Overview: a click jumps there, aligned.
  await page.getByRole("button", { name: "Pages" }).click();
  const overview = page.getByRole("dialog", { name: "Pages" });
  await overview.getByRole("button", { name: "Page 3", exact: true }).click();
  await expect(overview).toHaveCount(0);
  await expect.poll(() => alignedPage(page)).toBe(2);
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 3 of 3");

  // Drag page 1 (the one with the board) to the end: its frame goes with it.
  const ids = (await savedLayout(page)).pages.map((p) => p.id);
  await page.getByRole("button", { name: "Pages" }).click();
  const thumb = (n: number) => overview.getByRole("button", { name: `Page ${n}`, exact: true });
  await expect(thumb(1).locator("div").filter({ hasText: "Untitled board" })).toHaveCount(1);
  const from = await box(thumb(1));
  const to = await box(thumb(3));
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(overview).toBeVisible();
  await expect.poll(async () => (await savedLayout(page)).pages.map((p) => p.id)).toEqual([ids[1], ids[2], ids[0]]);
  await expect(thumb(3).locator("div").filter({ hasText: "Untitled board" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(pageEl(page, 2).locator("[data-stone-id]")).toHaveCount(1);
  await expect(pageEl(page, 0).locator("[data-stone-id]")).toHaveCount(0);
  // Undo puts the order back.
  await canvasEl(page).focus();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await savedLayout(page)).pages.map((p) => p.id)).toEqual(ids);
});

test("a far frame unloads and comes back where it was scrolled, but never while something is typed in it", async ({ context }) => {
  await seedBoard(context);
  const page = await context.newPage();
  await page.goto("/");
  const board = await addStone(page, "Untitled board");
  let bk = await frameOf(board);
  await expect(bk.locator("[data-card-id]").first()).toBeVisible({ timeout: 15_000 });
  // Narrow, so the board's lists scroll sideways inside the frame.
  await dragBy(page, board.locator("[title='Drag to resize']"), -350, 0);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "+ page" }).click();
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 4 of 4");
  await page.getByRole("button", { name: "Pages" }).click();
  await page.getByRole("dialog", { name: "Pages" }).getByRole("button", { name: "Page 1", exact: true }).click();
  await expect.poll(() => alignedPage(page)).toBe(0);
  // It was unloaded on page 4 and is loaded again.
  await expect(board).toHaveAttribute("data-loaded", "true");
  bk = await frameOf(board);
  await expect(bk.locator("[data-card-id]").first()).toBeVisible({ timeout: 15_000 });

  // Scroll the board's lists inside the frame; the frame reports it.
  const rail = bk.locator("[data-board-canvas]");
  const scrolled = await rail.evaluate((el) => {
    el.scrollLeft = 300;
    return el.scrollLeft;
  });
  expect(scrolled).toBeGreaterThan(50);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("gauntlet:scroll") ?? "{}"))).toEqual({ [(await board.getAttribute("data-stone-id"))!]: { x: scrolled, y: 0 } });

  // Page 4 is three pages away: the frame unloads.
  await canvasEl(page).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("PageDown");
  await expect.poll(() => alignedPage(page)).toBe(3);
  await expect(board).toHaveAttribute("data-loaded", "false", { timeout: 8_000 });
  await expect(board.locator("iframe")).toHaveCount(0);
  // Page 2 is its neighbour: it loads again, scrolled where it was.
  await page.keyboard.press("PageUp");
  await page.keyboard.press("PageUp");
  await expect.poll(() => alignedPage(page)).toBe(1);
  await expect(board).toHaveAttribute("data-loaded", "true");
  bk = await frameOf(board);
  await expect(bk.locator("[data-card-id]").first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => bk.locator("[data-board-canvas]").evaluate((el) => el.scrollLeft)).toBe(scrolled);

  // Typing in a card's title, then the canvas is wheeled away to page 4
  // (from the margin, so the frame keeps the keys): the frame stays loaded,
  // the text still there.
  await page.keyboard.press("PageUp");
  await expect.poll(() => alignedPage(page)).toBe(0);
  const card = bk.locator("[data-card-id]").first();
  await card.getByRole("button", { name: "Card title", exact: true }).click();
  const editor = bk.locator("textarea:focus, input:focus");
  await expect(editor).toHaveCount(1);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("ZZ typed while far");
  const c = await box(canvasEl(page));
  await page.mouse.move(c.x + 8, c.y + c.height / 2);
  for (let i = 0; i < 20 && (await alignedPage(page)) !== 3; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);
  }
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 4 of 4");
  await page.waitForTimeout(5_000);
  await expect(board).toHaveAttribute("data-loaded", "true");
  await expect(editor).toHaveCount(1);
  await expect(editor).toHaveValue("ZZ typed while far");

  // Done typing (Enter, still in the frame): now it can unload, and the
  // text was saved.
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);
  // The app moves its focus to the card, and the browser scrolls the canvas
  // back to show it. Back to page 4 from the canvas.
  await expect.poll(() => alignedPage(page)).not.toBe(3);
  await page.mouse.click(c.x + 8, c.y + c.height / 2);
  await expect(board).toHaveAttribute("data-focused", "false");
  for (let i = 0; i < 3; i++) await page.keyboard.press("PageDown");
  await expect.poll(() => alignedPage(page)).toBe(3);
  await expect(board).toHaveAttribute("data-loaded", "false", { timeout: 8_000 });
  const boardId = await page.evaluate(() => (JSON.parse(localStorage.getItem("boardkit:registry")!) as { activeBoardId: string }).activeBoardId);
  expect(await page.evaluate((id) => localStorage.getItem(`boardkit:board:${id}`), boardId)).toContain("ZZ typed while far");
});
