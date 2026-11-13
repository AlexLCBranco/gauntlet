import { expect, test, type Page } from "./test";

import { box, seedBoard, openBoardList, openMapList, whiteboardSaved } from "./helpers";

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
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  await expect(page.getByTestId("board-picker")).toHaveCount(0);
  await expect(boardEl(page)).toBeVisible();
  await expect.poll(async () => (await shapeOf(page))?.scale ?? 0).toBeGreaterThan(0);
}

/** Frame times while `act` runs: median and 95th percentile of the frame
    gaps, and the longest stall (long task). */
async function measureFrames(page: Page, act: () => Promise<void>) {
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

  // Drag the board around for about 2 s.
  const b = await box(boardEl(page));
  const drag = await measureFrames(page, async () => {
    await page.mouse.move(b.x + 20, b.y + 10);
    await page.mouse.down();
    for (let i = 1; i <= 120; i++) await page.mouse.move(b.x + 20 + Math.sin(i / 15) * 200, b.y + 10 + i);
    await page.mouse.up();
  });
  // Zoom in and out with the wheel.
  const zoom = await measureFrames(page, async () => {
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

test("a big map (150 boxes, 100 arrows) stays smooth on the whiteboard: dragging it and zooming keep the big board's limits", async ({ page, context }) => {
  // A plain Linkkit map, made in Linkkit; then (setting up what a person
  // can't make by hand quickly) 150 boxes in a grid and 100 arrows.
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await expect(lk.locator("[data-ready]")).toBeVisible({ timeout: 30_000 });
  await lk.getByRole("button", { name: /^Switch map/ }).click();
  await lk.getByRole("menuitem", { name: "+ New", exact: true }).click();
  await lk.getByRole("menuitem", { name: /^Free map/ }).click();
  await lk.keyboard.press("Escape");
  await lk.waitForTimeout(800);
  const mapId = await lk.evaluate(() => localStorage.getItem("linkkit:active")!);
  await lk.close();
  await openWhiteboard(page);
  await page.evaluate((id) => {
    const key = `linkkit:map:${id}`;
    const rec = JSON.parse(localStorage.getItem(key)!);
    const m = rec.map;
    m.nodes = {};
    m.links = {};
    const ids: string[] = [];
    for (let r = 0; r < 10; r++)
      for (let c = 0; c < 15; c++) {
        const nid = `pn${r}x${c}`;
        ids.push(nid);
        m.nodes[nid] = { id: nid, name: `Game ${r * 15 + c + 1}`, x: 90 + c * 160, y: 60 + r * 80, color: ["red", "blue", "green", null][(r + c) % 4], status: null };
      }
    for (let i = 0; i < 100; i++) {
      const lid = `pl${i}`;
      const from = ids[i];
      const to = ids[i % 15 === 14 ? i + 15 : i + 1];
      m.links[lid] = { id: lid, from, to, label: "" };
    }
    m.page = { width: 2500, height: 900 };
    rec.rev += 1;
    localStorage.setItem(key, JSON.stringify(rec));
  }, mapId);
  await openMapList(page);
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  const mapEl = page.locator(".tl-html-container [data-linkkit-map]").first();
  await expect(mapEl.locator("[data-map-view][data-ready]")).toBeVisible({ timeout: 15_000 });
  await expect(mapEl.locator("[data-box-id]")).toHaveCount(150);

  const b = await box(mapEl);
  const drag = await measureFrames(page, async () => {
    await page.mouse.move(b.x + 20, b.y + 10);
    await page.mouse.down();
    for (let i = 1; i <= 120; i++) await page.mouse.move(b.x + 20 + Math.sin(i / 15) * 200, b.y + 10 + i);
    await page.mouse.up();
  });
  // Zooming is measured 5 times (each zooms in and back out, so every run
  // is the same), and each measure's median over the runs is judged: one
  // run alone went over the limit now and then from the machine's own
  // noise (owner, 2026-10-22: less noisy, same limits).
  const zooms = [];
  for (let run = 0; run < 5; run++)
    zooms.push(
      await measureFrames(page, async () => {
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.keyboard.down("Control");
        for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i < 10 ? -120 : 120);
        await page.keyboard.up("Control");
      }),
    );
  const mid = (xs: number[]) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)];
  const zoom = { median: mid(zooms.map((z) => z.median)), p95: mid(zooms.map((z) => z.p95)), longest: mid(zooms.map((z) => z.longest)) };
  console.log(`big map: drag ${JSON.stringify(drag)}, zoom (median of 5) ${JSON.stringify(zoom)}, zoom p95 per run ${JSON.stringify(zooms.map((z) => z.p95))} (ms)`);
  // The big board's limits (see above).
  const REFRESH = 1000 / 60;
  for (const [m, p95] of [[drag, 4.5 * REFRESH], [zoom, 6.5 * REFRESH]] as const) {
    expect(m.median).toBeLessThan(2.5 * REFRESH);
    expect(m.p95).toBeLessThan(p95);
    expect(m.longest).toBeLessThan(250);
  }
});

test("hovering over many items stays smooth (the resize cursor on unselected edges, hand-test round item 3)", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openWhiteboard(page);
  // 400 rectangles in a grid, pointer swept across them, over edges and middles.
  await page.evaluate(() => {
    const e = (window as any).editor;
    const shapes = [];
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) shapes.push({ type: "geo", x: 40 + i * 75, y: 60 + j * 45, props: { w: 60, h: 34, fill: "solid" } });
    e.createShapes(shapes);
    e.selectNone();
  });
  await page.mouse.move(40, 60);
  const m = await measureFrames(page, async () => {
    for (let k = 0; k < 3; k++) for (let i = 0; i <= 120; i++) await page.mouse.move(40 + i * 12, 60 + i * 7 + k * 20);
  });
  console.log(`hover over 400 items: ${JSON.stringify(m)} (ms)`);
  const REFRESH = 1000 / 60;
  // Without the edge check p95 is one frame; setting the cursor through
  // tldraw's instance state made it 2-3 frames (2026-10-21).
  expect(m.median).toBeLessThan(1.5 * REFRESH);
  expect(m.p95).toBeLessThan(1.5 * REFRESH);
  expect(m.longest).toBeLessThan(100);
});

// ---- Slate widget (Slate widget step 2, src/slate/) ----

/** The schedule's nights as `date -> game count` (regular season, Cup,
    play-in, play-offs), read from what /calendar serves. */
async function nightSizes(page: Page) {
  return page.evaluate(async () => {
    const raw = (await (await fetch("/calendar/data/schedule.json")).json()) as { leagueSchedule: { gameDates: { games: { gameId: string; gameDateEst: string }[] }[] } };
    const n: Record<string, number> = {};
    for (const d of raw.leagueSchedule.gameDates) for (const g of d.games) if (/^00[2456]/.test(g.gameId)) n[g.gameDateEst.slice(0, 10)] = (n[g.gameDateEst.slice(0, 10)] ?? 0) + 1;
    return n;
  });
}

/** Toolbar → Slate, from the click to the cards drawn (ms, in the page). */
const timedInsert = (page: Page) =>
  page.evaluate(async () => {
    const before = document.querySelectorAll('[data-testid="slate-widget"]').length;
    const t0 = performance.now();
    (document.querySelector('[data-testid="tools.slate"]') as HTMLElement).click();
    await new Promise<void>((done) => {
      const check = () => {
        const ws = [...document.querySelectorAll<HTMLElement>('[data-testid="slate-widget"]')];
        if (ws.length > before && ws.every((w) => w.dataset.state === "ready" && getComputedStyle(w).visibility === "visible" && w.querySelector(".ck-slate-card"))) done();
        else requestAnimationFrame(check);
      };
      check();
    });
    return performance.now() - t0;
  });

const mid = (xs: number[]) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)]!;

test("Slate widgets: a page with 3 of them (15-game nights) and a board zooms, pans and follows the pointer as smoothly as the same page without them; inserting is quick", async ({ page, context }) => {
  test.setTimeout(300_000);
  const id = await seedBoard(context);
  await page.setViewportSize({ width: 1600, height: 1000 });
  // The clock runs from noon on a 15-game night (set before the page opens).
  await page.goto("/calendar/data/schedule.json");
  const sizes = await nightSizes(page);
  const date = Object.keys(sizes).sort().find((d) => sizes[d] === 15)!;
  await page.clock.install({ time: new Date(`${date}T15:00:00Z`) });
  await openWhiteboard(page);

  // First insert on a page that never had one: loads calendarkit's code and
  // the schedule. Then two more: near-instant.
  const first = await timedInsert(page);
  const second = await timedInsert(page);
  const third = await timedInsert(page);
  // Side by side, each a third of the page wide (set up), and a board.
  await page.evaluate(() => {
    const editor = (window as any).editor;
    const v = editor.getViewportPageBounds();
    const ws = editor.getCurrentPageShapes().filter((s: any) => s.type === "calendarkit-slate");
    ws.forEach((s: any, i: number) => {
      const k = (v.w / 3 - 20) / (s.props.w / s.props.scale);
      editor.updateShape({ id: s.id, type: s.type, x: v.x + 10 + i * (v.w / 3), y: v.y + 60, props: { scale: k, w: (s.props.w / s.props.scale) * k, h: (s.props.h / s.props.scale) * k } });
    });
    editor.selectNone();
  });
  await placeBoard(page, id);
  await page.evaluate(() => void (window as any).editor.selectNone());
  await expect(page.locator(".ck-slate-card")).toHaveCount(45);
  // The same page without the Slate widgets: a copy of it, Slates left out.
  const pages = await page.evaluate(() => {
    const editor = (window as any).editor;
    const with_ = editor.getCurrentPageId();
    editor.duplicatePage(with_);
    const without = editor.getPages().at(-1).id;
    editor.setCurrentPage(without);
    editor.deleteShapes(editor.getCurrentPageShapes().filter((s: any) => s.type === "calendarkit-slate").map((s: any) => s.id));
    editor.selectNone();
    return { with: with_, without };
  });

  const REFRESH = 1000 / 60;
  const runs: Record<"with" | "without", { zoom: any[]; pan: any[]; hover: any[] }> = { with: { zoom: [], pan: [], hover: [] }, without: { zoom: [], pan: [], hover: [] } };
  for (let r = 0; r < 3; r++)
    for (const v of ["with", "without"] as const) {
      await page.evaluate((p) => {
        const editor = (window as any).editor;
        editor.setCurrentPage(p);
        editor.selectNone();
        editor.setCamera({ x: 0, y: 0, z: 1 });
      }, pages[v]);
      await page.waitForTimeout(400);
      if (v === "with") await expect(page.locator(".ck-slate-card")).toHaveCount(45);
      runs[v].zoom.push(
        await measureFrames(page, async () => {
          await page.mouse.move(800, 500);
          await page.keyboard.down("Control");
          for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i < 10 ? -120 : 120);
          await page.keyboard.up("Control");
        }),
      );
      // Panning: zoomed in to 200%, the wheel moves the view.
      await page.evaluate(() => void (window as any).editor.setCamera({ x: 0, y: 0, z: 2 }));
      await page.waitForTimeout(200);
      runs[v].pan.push(
        await measureFrames(page, async () => {
          for (let i = 0; i < 30; i++) await page.mouse.wheel(i % 10 < 5 ? 80 : -80, i < 15 ? 60 : -60);
        }),
      );
      await page.evaluate(() => void (window as any).editor.setCamera({ x: 0, y: 0, z: 1 }));
      await page.waitForTimeout(200);
      // The pointer swept across the widgets (the hover and cursor checks).
      runs[v].hover.push(
        await measureFrames(page, async () => {
          for (let k = 0; k < 2; k++) for (let i = 0; i <= 120; i++) await page.mouse.move(20 + i * 13, 80 + i * 6 + k * 30);
        }),
      );
    }
  const summary = (xs: any[]) => ({ median: mid(xs.map((x) => x.median)), p95: mid(xs.map((x) => x.p95)), longest: mid(xs.map((x) => x.longest)) });
  const out = Object.fromEntries((["with", "without"] as const).map((v) => [v, { zoom: summary(runs[v].zoom), pan: summary(runs[v].pan), hover: summary(runs[v].hover) }]));
  console.log(`slate page: inserts ${JSON.stringify({ first: Math.round(first), second: Math.round(second), third: Math.round(third) })} ms; frames (median of 3 interleaved runs, ms) ${JSON.stringify(out)}`);
  test.info().annotations.push({ type: "slate perf", description: JSON.stringify({ first, second, third, ...out }) });

  // The existing limits (big board above; hover test below), with the widgets.
  const w = out.with!;
  for (const [m, p95] of [[w.zoom, 6.5 * REFRESH], [w.pan, 4.5 * REFRESH]] as const) {
    expect(m.median).toBeLessThan(2.5 * REFRESH);
    expect(m.p95).toBeLessThan(p95);
    expect(m.longest).toBeLessThan(250);
  }
  expect(w.hover.median).toBeLessThan(1.5 * REFRESH);
  expect(w.hover.p95).toBeLessThan(1.5 * REFRESH);
  expect(w.hover.longest).toBeLessThan(100);
  // Inserting: a later one doesn't load anything again.
  expect(second).toBeLessThan(1000);
  expect(third).toBeLessThan(1000);
  expect(first).toBeLessThan(10_000);
});

test("Slate widgets: a file with one on each of 30 pages opens about as fast as the same file without them", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  // Two browsers: one whose whiteboard has 30 pages, each with a Slate
  // widget (as inserted, set up by copying one), one with the same 30 pages
  // and a rectangle on each instead.
  const make = async (slates: boolean) => {
    const ctx = await browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto("/calendar/data/schedule.json");
    const sizes = await nightSizes(page);
    const date = Object.keys(sizes).sort().find((d) => sizes[d] === 15)!;
    await page.clock.install({ time: new Date(`${date}T15:00:00Z`) });
    await openWhiteboard(page);
    let props: unknown = null;
    if (slates) {
      await timedInsert(page);
      props = await page.evaluate(() => (window as any).editor.getCurrentPageShapes().find((s: any) => s.type === "calendarkit-slate").props);
    }
    await page.evaluate((props) => {
      const editor = (window as any).editor;
      const first = editor.getCurrentPageId();
      if (!props) editor.createShape({ type: "geo", x: 100, y: 100, props: { w: 300, h: 200 } });
      for (let i = 2; i <= 30; i++) {
        editor.createPage({ name: `Page ${i}` });
        const p = editor.getPages().at(-1).id;
        editor.setCurrentPage(p);
        if (props) editor.createShape({ type: "calendarkit-slate", x: 0, y: 0, props });
        else editor.createShape({ type: "geo", x: 100, y: 100, props: { w: 300, h: 200 } });
      }
      editor.setCurrentPage(first);
    }, props);
    await whiteboardSaved(page);
    return { ctx, page };
  };
  const files = { with: await make(true), without: await make(false) };
  /** Reload: time (wall clock, from here: the page's own clock is faked)
      to the whiteboard drawn (its sheet), and, with Slates, to the first
      page's cards. */
  const open = async (page: Page) => {
    const t0 = Date.now();
    await page.reload();
    await page.waitForFunction(() => "editor" in window && document.querySelector('[data-testid="sheet"]'), null, { polling: 16 });
    const ready = Date.now() - t0;
    await page.waitForFunction(() => {
      const w = document.querySelector<HTMLElement>('[data-testid="slate-widget"]');
      return !w || (w.dataset.state === "ready" && getComputedStyle(w).visibility === "visible");
    }, null, { polling: 16 });
    return { ready, cards: Date.now() - t0 };
  };
  const times: Record<"with" | "without", { ready: number; cards: number }[]> = { with: [], without: [] };
  for (let r = 0; r < 4; r++) for (const v of ["with", "without"] as const) times[v].push(await open(files[v].page));
  const result = Object.fromEntries((["with", "without"] as const).map((v) => [v, { ready: Math.round(mid(times[v].map((t) => t.ready))), cards: Math.round(mid(times[v].map((t) => t.cards))) }]));
  console.log(`30 pages: open (median of 4 interleaved, ms from reload) ${JSON.stringify(result)}; runs ${JSON.stringify(times)}`);
  test.info().annotations.push({ type: "30 pages", description: JSON.stringify(result) });
  expect(await files.with.page.evaluate(() => (window as any).editor.getPages().length)).toBe(30);
  // The whiteboard itself is ready no later than 25% after the file without
  // Slates (other pages' widgets are never drawn).
  expect(result.with!.ready).toBeLessThan(result.without!.ready * 1.25 + 100);
  await files.with.ctx.close();
  await files.without.ctx.close();
});