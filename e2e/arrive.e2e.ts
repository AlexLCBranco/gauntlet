import { expect, test, type Page } from "./test";

import { openBoardList, openMapList, seedBoard, seedMap } from "./helpers";

/**
 * Nothing arrives too big (speed session Part 3, src/pages/arrive.ts):
 * anything placed on the whiteboard (a pasted, dropped or inserted
 * picture, a Slate, a board, a map) arrives with all four corners inside
 * the visible window at 100% zoom. The page is made bigger than the window
 * first (a rectangle far out, set up), so "fits the page" is not enough.
 * Fresh, empty browser profile per test; `window.editor` reads where
 * things are on screen.
 */

const WINDOW = { width: 1200, height: 800 };
test.use({ viewport: WINDOW, timezoneId: "America/Sao_Paulo" });

type Corners = { left: number; top: number; right: number; bottom: number; zoom: number; win: { w: number; h: number } };

async function openBigPage(page: Page) {
  // Set up: something drawn far out in a big window, then the window made
  // small, so the page is ~3x the window (as after drawing on a big screen).
  await page.setViewportSize({ width: 3400, height: 2400 });
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
  await page.evaluate(() => {
    const e = (window as any).editor;
    e.createShape({ type: "geo", x: 3200, y: 2200, props: { w: 100, h: 100 } });
    e.selectNone();
  });
  await page.waitForTimeout(300);
  await page.setViewportSize(WINDOW);
  await page.evaluate(() => void (window as any).editor.setCamera({ x: 0, y: 0, z: 1 }));
  await expect.poll(() => page.evaluate(() => (window as any).editor.getCameraOptions().constraints.bounds.w)).toBeGreaterThan(3000);
  expect(await page.evaluate(() => (window as any).editor.getZoomLevel())).toBe(1);
}

/** The shape's corners on screen (CSS px from the canvas's corner). */
const corners = (page: Page, id: string) =>
  page.evaluate((id) => {
    const e = (window as any).editor;
    const b = e.getShapePageBounds(id);
    const v = e.getViewportScreenBounds();
    const a = e.pageToScreen({ x: b.minX, y: b.minY });
    const z = e.pageToScreen({ x: b.maxX, y: b.maxY });
    return { left: a.x - v.x, top: a.y - v.y, right: z.x - v.x, bottom: z.y - v.y, zoom: e.getZoomLevel(), win: { w: v.w, h: v.h } };
  }, id) as Promise<Corners>;

function insideWindow(c: Corners, what: string) {
  expect(c.zoom, `${what}: still at 100%`).toBeCloseTo(1, 5);
  expect(c.left, `${what}: left`).toBeGreaterThanOrEqual(0);
  expect(c.top, `${what}: top`).toBeGreaterThanOrEqual(0);
  expect(c.right, `${what}: right`).toBeLessThanOrEqual(c.win.w);
  expect(c.bottom, `${what}: bottom`).toBeLessThanOrEqual(c.win.h);
}

const ids = (page: Page, type: string) =>
  page.evaluate((type) => ((window as any).editor.getCurrentPageShapes() as any[]).filter((s) => s.type === type).map((s) => s.id as string), type);

/** A new shape of `type`, once it has its size (`ready`). */
async function arrived(page: Page, type: string, before: string[], ready = "true"): Promise<string> {
  let id = "";
  await expect
    .poll(
      async () => {
        id = (await ids(page, type)).find((x) => !before.includes(x)) ?? "";
        return id ? page.evaluate(([id, ready]) => { const s = (window as any).editor.getShape(id); return new Function("s", `return ${ready}`)(s) as boolean; }, [id, ready]) : false;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  // Let the first sizing and the page's own pull-in finish.
  await page.waitForTimeout(400);
  return id;
}

/** A 3840 x 2160 PNG made in the page (a big screenshot). */
const bigPng = (page: Page) =>
  page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 3840;
    c.height = 2160;
    const g = c.getContext("2d")!;
    g.fillStyle = "#3a6";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#fff";
    g.fillRect(100, 100, 600, 300);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });

test("a pasted 4K screenshot, the cursor near the window's corner, arrives smaller with every corner in the window; one undo removes it", async ({ page }) => {
  await openBigPage(page);
  const bytes = await bigPng(page);
  await page.mouse.move(WINDOW.width - 30, WINDOW.height - 30);
  await page.evaluate((bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], "shot.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, bytes);
  const id = await arrived(page, "image", []);
  insideWindow(await corners(page, id), "pasted picture");
  // Smaller, same shape.
  const p = await page.evaluate((id) => (window as any).editor.getShape(id).props, id);
  expect(p.w).toBeLessThan(WINDOW.width);
  expect(p.w / p.h).toBeCloseTo(3840 / 2160, 2);
  // One undo step.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(() => ids(page, "image")).toEqual([]);
});

test("a picture dropped or inserted from the toolbar arrives with every corner in the window", async ({ page }) => {
  await openBigPage(page);
  const bytes = await bigPng(page);
  // Dropped near the bottom-right corner.
  await page.evaluate((bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], "drop.png", { type: "image/png" }));
    const canvas = document.querySelector(".tl-canvas")!;
    for (const type of ["dragenter", "dragover", "drop"]) canvas.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 1180, clientY: 780 }));
  }, bytes);
  const dropped = await arrived(page, "image", []);
  insideWindow(await corners(page, dropped), "dropped picture");

  // ⋮ → Insert image.
  const before = await ids(page, "image");
  await page.getByTestId("tools.more-button").click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("tools.more.asset").click()]);
  await chooser.setFiles({ name: "insert.png", mimeType: "image/png", buffer: Buffer.from(bytes) });
  const inserted = await arrived(page, "image", before);
  insideWindow(await corners(page, inserted), "inserted picture");
});

test("a small picture keeps its own size", async ({ page }) => {
  await openBigPage(page);
  await page.mouse.move(600, 400);
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 200;
    c.getContext("2d")!.fillRect(0, 0, 300, 200);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "small.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  });
  const id = await arrived(page, "image", []);
  expect(await page.evaluate((id) => (window as any).editor.getShape(id).props, id)).toMatchObject({ w: 300, h: 200 });
});

test("a new Slate starts at about a third of the window's width, every corner in the window", async ({ page }) => {
  await openBigPage(page);
  await page.getByTestId("tools.slate").click();
  const id = await arrived(page, "calendarkit-slate", [], "s.props.scale > 0 && s.props.cols > 0");
  const c = await corners(page, id);
  insideWindow(c, "Slate");
  const w = c.right - c.left;
  const h = c.bottom - c.top;
  // A third of the width, or less when the night is tall (then 90% of the height).
  expect(w).toBeLessThanOrEqual(WINDOW.width / 3 + 1);
  expect(Math.max(w / (WINDOW.width / 3), h / (WINDOW.height * 0.9))).toBeGreaterThan(0.97);
});

test("a board too big for the window arrives scaled down, every corner in the window", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  // Set up: its lists wide, so the board is ~3x the window's width.
  const bk = await context.newPage();
  await bk.goto("/");
  await bk.evaluate((id) => {
    const key = `boardkit:board:${id}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    for (const l of Object.values(rec.board.lists) as { width: number }[]) l.width = 900;
    rec.rev += 1;
    localStorage.setItem(key, JSON.stringify(rec));
  }, boardId);
  await bk.close();
  await openBigPage(page);
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  const id = await arrived(page, "boardkit-board", [], "s.props.scale > 0");
  insideWindow(await corners(page, id), "board");
  expect(await page.evaluate((id) => (window as any).editor.getShape(id).props.scale, id)).toBeLessThan(1);
});

test("a map too big for the window arrives scaled down, every corner in the window", async ({ page, context }) => {
  const mapId = await seedMap(context, "Big map");
  // Set up: 150 boxes over 2500 x 900.
  const lk = await context.newPage();
  await lk.goto("/");
  await lk.evaluate((id) => {
    const key = `linkkit:map:${id}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    const m = rec.map;
    m.nodes = {};
    m.links = {};
    for (let r = 0; r < 10; r++)
      for (let c = 0; c < 15; c++) m.nodes[`n${r}x${c}`] = { id: `n${r}x${c}`, name: `Game ${r * 15 + c + 1}`, x: 90 + c * 160, y: 60 + r * 80, color: null, status: null };
    m.page = { width: 2500, height: 900 };
    rec.rev += 1;
    localStorage.setItem(key, JSON.stringify(rec));
  }, mapId);
  await lk.close();
  await openBigPage(page);
  await openMapList(page);
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  const id = await arrived(page, "linkkit-map", [], "s.props.scale > 0");
  await expect(page.locator(".tl-html-container [data-linkkit-map] [data-map-view][data-ready]").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  insideWindow(await corners(page, id), "map");
  expect(await page.evaluate((id) => (window as any).editor.getShape(id).props.scale, id)).toBeLessThan(1);
});
