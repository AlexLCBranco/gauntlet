import { expect, test, type Page } from "@playwright/test";

import { box, seedBoard } from "./helpers";

/**
 * Speed checks. They measure frame times, so they run alone: Playwright
 * runs this file as the "perf" project, after every other e2e has finished
 * (also when some failed), with one worker (playwright.config.ts). Run
 * among other tests, the browser shares the CPU and a frame budget
 * measures the machine's load, not the whiteboard (the board test missed
 * its 60 ms by 6 ms once that way, 2026-10-19).
 */

const shapeOf = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).editor.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board");
    return s ? { scale: s.props.scale as number } : null;
  });

const boardEl = (page: Page) => page.locator(".tl-html-container [data-boardkit-board]").first();

async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

async function placeBoard(page: Page, id: string) {
  await page.getByTestId("tools.board").click();
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  await expect(page.getByTestId("board-picker")).toHaveCount(0);
  await expect(boardEl(page)).toBeVisible();
  await expect.poll(async () => (await shapeOf(page))?.scale ?? 0).toBeGreaterThan(0);
}

test("a big board (8 lists, 240 cards) stays smooth: dragging it and zooming keep frames short, no long stalls", async ({ page, context }) => {
  const id = await seedBoard(context);
  await openWhiteboard(page);
  await page.evaluate((id) => {
    const key = `boardkit:board:${id}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    const b = rec.board;
    b.lists = {};
    b.cards = {};
    b.cardOrder = {};
    b.listOrder = [];
    for (let l = 0; l < 8; l++) {
      const lid = `perf-l${l}`;
      b.listOrder.push(lid);
      b.lists[lid] = { id: lid, title: `List ${l + 1}`, color: ["red", "blue", "green", "yellow"][l % 4] };
      b.cardOrder[lid] = [];
      for (let c = 0; c < 30; c++) {
        const cid = `perf-c${l}-${c}`;
        b.cards[cid] = { id: cid, title: `Game ${c + 1}: Team ${l}A vs Team ${l}B, 7:05pm`, ...(c % 7 === 0 ? { highlight: "red" } : {}) };
        b.cardOrder[lid].push(cid);
      }
    }
    rec.rev += 1;
    localStorage.setItem(key, JSON.stringify(rec));
  }, id);
  await placeBoard(page, id);
  await expect(page.locator("[data-boardkit-board] article[data-card-id]")).toHaveCount(240);

  const measure = async (act: () => Promise<void>) => {
    await page.evaluate(() => {
      const w = window as any;
      w.__frames = [];
      w.__long = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ type: "longtask" });
      let last = performance.now();
      w.__on = true;
      const loop = (t: number) => {
        w.__frames.push(t - last);
        last = t;
        if (w.__on) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await act();
    return page.evaluate(() => {
      const w = window as any;
      w.__on = false;
      const f = (w.__frames as number[]).slice(2).sort((a, b) => a - b);
      return { median: f[Math.floor(f.length / 2)], p95: f[Math.floor(f.length * 0.95)], longest: Math.max(0, ...(w.__long as number[])) };
    });
  };

  // Drag the board around for about 2 s.
  const b = await box(boardEl(page));
  const drag = await measure(async () => {
    await page.mouse.move(b.x + 20, b.y + 10);
    await page.mouse.down();
    for (let i = 1; i <= 120; i++) await page.mouse.move(b.x + 20 + Math.sin(i / 15) * 200, b.y + 10 + i);
    await page.mouse.up();
  });
  // Zoom in and out with the wheel.
  const zoom = await measure(async () => {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.keyboard.down("Control");
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i < 10 ? -120 : 120);
    await page.keyboard.up("Control");
  });
  console.log(`big board: drag ${JSON.stringify(drag)}, zoom ${JSON.stringify(zoom)} (ms)`);
  // Frame times come in whole screen refreshes (16.7, 33.4, 50, 66.8 ms
  // at 60 Hz), so each limit sits half a refresh past a whole number of
  // them, never on one. Measured alone, 8 runs (2026-10-19, Boardkit's own
  // components): median 1 refresh (once 2), p95 2 (drag) and 3 (zoom),
  // once 4. Limits: median at most 2 refreshes (30+ frames a second), p95
  // at most 4, no stall of a quarter second. They catch a board that
  // stutters (5+ refreshes at p95, 20 fps median), not the machine's jitter.
  // Zoom's p95 limit is 6.5 refreshes (108 ms) instead (2026-10-20): it
  // measures 50-67 ms (3-4 refreshes), and once 83.3 (5) on a busy
  // machine, so 4.5 left one refresh of margin and failed on jitter. Not
  // 100 ms: that is exactly 6 refreshes, so a 6-refresh run would pass or
  // fail on rounding. A real regression shows as a large jump, well past
  // 6 refreshes.
  const REFRESH = 1000 / 60;
  for (const [m, p95] of [[drag, 4.5 * REFRESH], [zoom, 6.5 * REFRESH]] as const) {
    expect(m.median).toBeLessThan(2.5 * REFRESH);
    expect(m.p95).toBeLessThan(p95);
    expect(m.longest).toBeLessThan(250);
  }
});
