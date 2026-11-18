import { expect, test, type Page } from "./test";

import { seedBoard } from "./helpers";

/**
 * The style panel: collapse and left/right (owner, Edges round item 5;
 * src/style/panelPlace.ts). Fresh profile, 1600 × 1000.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const select = (page: Page, id: string) => page.evaluate((id) => void (window as any).editor.select(id), id);
const rect = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
  }, sel);
const overlap = (a: { l: number; t: number; r: number; b: number }, b: { l: number; t: number; r: number; b: number }) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

async function twoRects(page: Page) {
  await page.evaluate(() => {
    const e = (window as any).editor;
    e.createShapes([
      { id: "shape:s1", type: "geo", x: 600, y: 300, props: { w: 200, h: 120 } },
      { id: "shape:s2", type: "geo", x: 900, y: 300, props: { w: 200, h: 120 } },
    ]);
  });
}

test("collapse to a tab at the edge, stays collapsed while other things are selected, one click opens it; switch sides; both remembered after a reload", async ({ page }) => {
  await open(page);
  await twoRects(page);
  await select(page, "shape:s1");
  const panel = page.getByTestId("style-panel");
  await expect(panel).toHaveAttribute("data-side", "left");
  expect((await rect(page, '[data-testid="style-panel"]'))!.l).toBeLessThan(20);

  await page.getByTestId("style-panel-collapse").click();
  await expect(panel).toHaveCount(0);
  const tab = page.getByTestId("style-panel-tab");
  await expect(tab).toBeVisible();
  expect((await rect(page, '[data-testid="style-panel-tab"]'))!.l).toBe(0);
  await select(page, "shape:s2");
  await expect(panel).toHaveCount(0);
  await expect(tab).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await select(page, "shape:s1");
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(panel).toBeVisible();

  // To the right, and remembered.
  await page.getByTestId("style-panel-side").click();
  await expect(panel).toHaveAttribute("data-side", "right");
  expect((await rect(page, '[data-testid="style-panel"]'))!.r).toBeGreaterThan(1580);
  await page.getByTestId("style-panel-collapse").click();
  expect((await rect(page, '[data-testid="style-panel-tab"]'))!.r).toBe(1600);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await select(page, "shape:s2");
  await expect(page.getByTestId("style-panel-tab")).toHaveAttribute("data-side", "right");
  await page.getByTestId("style-panel-tab").click();
  await expect(panel).toHaveAttribute("data-side", "right");
});

test("on either side, the panel covers neither the toolbar, the page arrows and save status, the zoom, nor tldraw's watermark; a selection's handle under it still takes the press", async ({ page }) => {
  await open(page);
  await twoRects(page);
  for (const side of ["left", "right"] as const) {
    await select(page, "shape:s1");
    const panel = page.getByTestId("style-panel");
    if ((await panel.getAttribute("data-side")) !== side) await page.getByTestId("style-panel-side").click();
    await expect(panel).toHaveAttribute("data-side", side);
    const p = (await rect(page, '[data-testid="style-panel"]'))!;
    for (const sel of ['[data-testid="toolbar"]', ".gauntlet-pages", ".gauntlet-zoom-undo .gauntlet-island", ".tl-watermark_SEE-LICENSE"]) {
      const r = await rect(page, sel);
      if (r) expect(overlap(p, r), `${side}: the panel over ${sel}`).toBe(false);
    }
    // A rectangle whose left edge lies under the panel: its handle takes the press.
    await page.evaluate(({ side, p }) => {
      const e = (window as any).editor;
      const x = side === "left" ? p.r - 40 : p.l - 160;
      e.updateShape({ id: "shape:s1", type: "geo", x, y: 400, props: { w: 200, h: 120 } });
      e.select("shape:s1");
    }, { side, p });
    const edgeX = side === "left" ? p.r - 40 : p.l - 160 + 200;
    const before = await page.evaluate(() => (window as any).editor.getShapePageBounds("shape:s1").w);
    await page.mouse.move(edgeX + (side === "left" ? 3 : -3), 460, { steps: 3 });
    await page.mouse.down();
    await page.mouse.move(edgeX + (side === "left" ? 40 : -40), 460, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.up();
    const after = await page.evaluate(() => (window as any).editor.getShapePageBounds("shape:s1").w);
    expect(after, `${side}: resized from the edge under the panel`).toBeLessThan(before - 20);
  }
  // The save status never runs over the watermark.
  const pages = (await rect(page, ".gauntlet-pages"))!;
  const wm = await rect(page, ".tl-watermark_SEE-LICENSE");
  if (wm) expect(overlap(pages, wm)).toBe(false);
});

// GT-12: the style panel hides while a widget under it is edited, and comes back when the editing ends.
test.describe("GT-12: the style panel gives way to an edited widget under it", () => {
  const panel = (page: Page) => page.getByTestId("style-panel");
  const editingId = (page: Page) => page.evaluate(() => (window as any).editor.getEditingShapeId() as string | null);
  /** The widget's box on screen. */
  const onScreen = (page: Page, id: string) =>
    page.evaluate((id) => {
      const e = (window as any).editor;
      const b = e.getShapePageBounds(id);
      const a = e.pageToScreen({ x: b.minX, y: b.minY });
      const c = e.pageToScreen({ x: b.maxX, y: b.maxY });
      return { x: a.x, y: a.y, r: c.x, b: c.y };
    }, id);

  async function boardAt(page: Page, boardId: string, x: number) {
    await page.evaluate(
      ({ boardId, x }) => {
        const e = (window as any).editor;
        e.setCamera({ x: 0, y: 0, z: 1 });
        e.createShapes([{ id: "shape:gb", type: "boardkit-board", x, y: 120, props: { boardId } }]);
        e.select("shape:gb");
      },
      { boardId, x },
    );
    await expect(page.locator('[id="shape:gb"] [data-boardkit-board]')).toBeVisible();
    // its lists (the seeded board may open on its linked map)
    const list = page.locator('[id="shape:gb"] [data-testid="view-switch"] [data-view="list"]');
    if (await list.count()) {
      await list.click();
      await expect(list).toHaveAttribute("aria-pressed", "true");
      await page.evaluate(() => void (window as any).editor.select("shape:gb"));
    }
    await expect(panel(page)).toBeVisible();
  }
  /** A double-click on the board's own empty area, at its right end: editing it. */
  async function editBoard(page: Page) {
    const b = await onScreen(page, "shape:gb");
    // inside its visible part, clear of the edge handles (it may run past the window)
    await page.mouse.dblclick(Math.min(b.r, page.viewportSize()!.width) - 60, b.b - 30);
    await expect.poll(() => editingId(page)).toBe("shape:gb");
  }

  test("a board under the panel, opened for editing: the panel hides; left: it is back. A board away from it: the panel stays", async ({ page, context }) => {
    const boardId = await seedBoard(context);
    await open(page);
    await boardAt(page, boardId, 60);
    const p = (await panel(page).boundingBox())!;
    const b = await onScreen(page, "shape:gb");
    expect(b.x < p.x + p.width && b.r > p.x && b.y < p.y + p.height && b.b > p.y, "the board lies under the panel").toBe(true);
    await editBoard(page);
    await expect(panel(page)).toHaveAttribute("data-hidden-for-editing", "");
    await expect(panel(page)).toBeHidden();
    // editing ends: the panel is back (the board still selected)
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect.poll(() => editingId(page)).toBeNull();
    await page.evaluate(() => void (window as any).editor.select("shape:gb"));
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).not.toHaveAttribute("data-hidden-for-editing", "");

    // the same board far from the panel: editing it leaves the panel as it is
    await page.evaluate(() => {
      const e = (window as any).editor;
      e.updateShape({ id: "shape:gb", type: "boardkit-board", x: 900 });
      e.select("shape:gb");
    });
    await editBoard(page);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).not.toHaveAttribute("data-hidden-for-editing", "");
  });

  test("typing in a Slate note under the panel hides it; leaving the note brings it back", async ({ page }) => {
    // a night with games, from the schedule served
    const raw = (await (await page.request.get("/calendar/data/schedule.json")).json()) as { leagueSchedule: { gameDates: { games: { gameId: string; gameDateEst: string }[] }[] } };
    const date = raw.leagueSchedule.gameDates.flatMap((d) => d.games).find((g) => /^002/.test(g.gameId))!.gameDateEst.slice(0, 10);
    await open(page);
    await page.evaluate((date) => {
      const e = (window as any).editor;
      e.setCamera({ x: 0, y: 0, z: 1 });
      e.createShapes([{ id: "shape:gs", type: "calendarkit-slate", x: 60, y: 140, props: { date } }]);
    }, date);
    const w = page.locator('[id="shape:gs"] [data-testid="slate-widget"]');
    await expect(w).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
    await page.evaluate(() => void (window as any).editor.select("shape:gs"));
    await expect(panel(page)).toBeVisible();
    // a note right of the panel, under the panel's band (the widget overlaps the panel)
    const p = (await panel(page).boundingBox())!;
    const notes = w.getByTestId("note");
    const n = await notes.count();
    let target = notes.first();
    for (let i = 0; i < n; i++) {
      const r = (await notes.nth(i).boundingBox())!;
      if (r.x > p.x + p.width + 4) {
        target = notes.nth(i);
        break;
      }
    }
    await target.click();
    await expect(w.locator("textarea")).toBeFocused();
    await expect(panel(page)).toHaveAttribute("data-hidden-for-editing", "");
    await page.keyboard.press("Escape");
    await expect(w.locator("textarea")).toHaveCount(0);
    // the Slate selected again: the panel is there
    await page.evaluate(() => void (window as any).editor.select("shape:gs"));
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).not.toHaveAttribute("data-hidden-for-editing", "");
  });
});
