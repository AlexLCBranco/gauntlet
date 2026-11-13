import { expect, test, type APIRequestContext, type Locator, type Page } from "./test";

import { box } from "./helpers";

/**
 * Slate widget step 3 (speed session Part 4, owner 2026-11-12): hovering a
 * Slate on the whiteboard feels like hovering it in /calendar — the same
 * popups, without selecting the widget first, never clipped by its box or
 * covered by other items, at reading size however small the widget is —
 * plus the ↗ and team links and ← / → changing its night (src/slate/
 * hover.tsx, SlateWidget.tsx DateBar). The schedule is whatever /calendar
 * serves; the nights used are read from it. `window.editor` sets up what a
 * person can't make exactly by hand (a scale, a position), where marked.
 */

const TZ = "America/Sao_Paulo";
test.use({ timezoneId: TZ, viewport: { width: 1920, height: 1080 } });

type Slate = { id: string; x: number; y: number; date: string; w: number; h: number; scale: number; cols: number };
type Night = { date: string; ids: string[] };

const slates = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "calendarkit-slate")
      .map((s: any) => ({ id: s.id, x: s.x, y: s.y, ...s.props })),
  ) as Promise<Slate[]>;

/** The schedule's nights (regular season on), each game's id in tip-off order. */
async function nights(request: APIRequestContext): Promise<Night[]> {
  const raw = (await (await request.get("/calendar/data/schedule.json")).json()) as {
    leagueSchedule: { gameDates: { games: { gameId: string; gameDateEst: string; gameDateTimeUTC: string; gameStatus: number }[] }[] };
  };
  const by: Record<string, { gameId: string; t: string }[]> = {};
  for (const d of raw.leagueSchedule.gameDates)
    for (const g of d.games) if (/^00[2456]/.test(g.gameId)) (by[g.gameDateEst.slice(0, 10)] ??= []).push({ gameId: g.gameId, t: g.gameDateTimeUTC });
  return Object.keys(by)
    .sort()
    .map((date) => ({ date, ids: by[date]!.sort((a, b) => a.t.localeCompare(b.t)).map((g) => g.gameId) }));
}

/** A night two weeks or more into the season, with 5+ games, and with
    games the night after (teams have records and streaks going in). */
async function midSeasonNight(request: APIRequestContext) {
  const all = await nights(request);
  const i = all.findIndex((n, k) => k >= 14 && n.ids.length >= 5 && all[k + 1]?.ids.length && addDays(n.date, 1) === all[k + 1]!.date);
  return { night: all[i]!, next: all[i + 1]! };
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const label = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));

async function openWhiteboard(page: Page, date: string) {
  await page.clock.install({ time: new Date(`${date}T15:00:00Z`) });
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const widgetOf = (page: Page, id: string) => page.locator(`[id="${id}"] [data-testid="slate-widget"]`);

async function insertSlate(page: Page): Promise<Slate> {
  const before = (await slates(page)).map((s) => s.id);
  await page.getByTestId("tools.slate").click();
  let made: Slate | undefined;
  await expect
    .poll(async () => {
      made = (await slates(page)).find((s) => !before.includes(s.id));
      return made ? made.scale > 0 && made.cols > 0 : false;
    })
    .toBe(true);
  await expect(widgetOf(page, made!.id)).toHaveAttribute("data-state", "ready");
  return made!;
}

const cardIds = (page: Page, id: string) => widgetOf(page, id).locator(".ck-slate-card").evaluateAll((cs) => cs.map((c) => c.getAttribute("data-game-id")!));
const selected = (page: Page) => page.evaluate(() => (window as any).editor.getSelectedShapeIds() as string[]);

/** The three hover targets of a card, as /calendar's Slate has them. */
const TARGETS = [
  { name: "record tooltip", sel: '[data-side="away"] .ck-slate-rec[data-tip]', popup: "tooltip" },
  { name: "streak popup", sel: '[data-side="away"] [data-testid="slate-streak"][data-streak]', popup: "streak-popup" },
  { name: "season-series popup", sel: '[data-testid="series-chip"]', popup: "series-popup" },
] as const;

/** Moves the pointer onto `target` from an empty corner, as a hand would. */
async function hover(page: Page, target: Locator) {
  const b = await box(target);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
}

/** A popup's text, size and font, and whether each of its corners is the
    popup itself on screen (not covered, not cut off). */
const popupFacts = (l: Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    // calendarkit's tooltip lets the pointer through (pointer-events: none):
    // hit-tested as if it didn't, to see what is on top at its corners.
    const pe = (el as HTMLElement).style.pointerEvents;
    (el as HTMLElement).style.pointerEvents = "auto";
    const corners = [
      [r.left + 3, r.top + 3],
      [r.right - 3, r.top + 3],
      [r.left + 3, r.bottom - 3],
      [r.right - 3, r.bottom - 3],
    ].map(([x, y]) => {
      const hit = document.elementFromPoint(x!, y!);
      return !!hit && el.contains(hit);
    });
    (el as HTMLElement).style.pointerEvents = pe;
    return { text: (el as HTMLElement).innerText, w: Math.round(r.width), h: Math.round(r.height), font: getComputedStyle(el).fontSize, inWindow: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, corners };
  });

test("Slate hover: the same popups as /calendar (record tooltip, streak, season series), without selecting; at reading size on a widget scaled to 0.3; never clipped or covered by an item on top", async ({ page, context, request }) => {
  test.setTimeout(120_000);
  const { night } = await midSeasonNight(request);

  // /calendar's Slate of that night: what each hover shows there.
  const ck = await context.newPage();
  await ck.addInitScript((d) => ((window as unknown as { __ckOpenDate?: string }).__ckOpenDate = d), night.date);
  await ck.goto("/calendar/?view=league&layout=slate");
  await expect(ck.locator('[data-testid="slate"] .ck-slate-card').first()).toBeVisible();
  await ck.evaluate(() => document.fonts.ready);
  // The night's last game with all three targets (its popups open below
  // the widget's box, over the rectangle drawn there).
  const game = await ck.locator('[data-testid="slate"] .ck-slate-card').evaluateAll(
    (cs, sels) => cs.reverse().find((c) => sels.every((s) => c.querySelector(s)))?.getAttribute("data-game-id"),
    TARGETS.map((t) => t.sel),
  );
  expect(game, "a card with a record, a streak and a series chip").toBeTruthy();
  const want: Record<string, Awaited<ReturnType<typeof popupFacts>>> = {};
  for (const t of TARGETS) {
    await ck.mouse.move(5, 1075);
    await hover(ck, ck.locator(`[data-testid="slate"] [data-game-id="${game}"] ${t.sel}`).first());
    want[t.name] = await popupFacts(ck.getByTestId(t.popup));
  }
  await ck.close();

  // The whiteboard: the night's widget at scale 0.3, top-left of the view,
  // not selected; a rectangle drawn after it, from just under it (set up).
  await openWhiteboard(page, night.date);
  const s = await insertSlate(page);
  await page.evaluate(({ id }) => {
    const editor = (window as any).editor;
    const p = editor.getShape(id).props;
    const v = editor.getViewportPageBounds();
    const scale = 0.3;
    editor.updateShape({ id, type: "calendarkit-slate", x: v.x + 80, y: v.y + 120, props: { scale, w: (p.w / p.scale) * scale, h: (p.h / p.scale) * scale } });
    const b = editor.getShapePageBounds(id);
    editor.createShape({ type: "geo", x: v.x + 40, y: b.maxY + 2, props: { w: 900, h: 600, fill: "solid", color: "grey" } });
    editor.selectNone();
  }, { id: s.id });
  const w = widgetOf(page, s.id);
  await expect.poll(async () => (await box(w)).width).toBeLessThan(700);
  await page.evaluate(() => document.fonts.ready);
  const card = w.locator(`[data-game-id="${game}"]`);
  const widgetBottom = (await box(w)).y + (await box(w)).height;

  for (const t of TARGETS) {
    await page.mouse.move(1900, 1060, { steps: 2 });
    await expect(page.getByTestId(t.popup)).toHaveCount(0);
    await hover(page, card.locator(t.sel).first());
    const pop = page.getByTestId(t.popup);
    await expect(pop, t.name).toBeVisible();
    const got = await popupFacts(pop);
    expect(got.text, `${t.name}: the same content as /calendar`).toBe(want[t.name]!.text);
    expect(got.font, `${t.name}: reading size`).toBe(want[t.name]!.font);
    expect(Math.abs(got.w - want[t.name]!.w), `${t.name}: width as in /calendar`).toBeLessThanOrEqual(1);
    expect(Math.abs(got.h - want[t.name]!.h), `${t.name}: height as in /calendar`).toBeLessThanOrEqual(1);
    expect(got.inWindow, `${t.name}: inside the window`).toBe(true);
    expect(got.corners, `${t.name}: nothing covers or cuts it`).toEqual([true, true, true, true]);
    // A popup reaches out of the widget's box, over the rectangle.
    if (t.popup !== "tooltip") expect((await box(pop)).y + got.h, `${t.name}: past the widget's box`).toBeGreaterThan(widgetBottom + 20);
    expect(await selected(page), "hovering selects nothing").toEqual([]);
  }

  // The series popup stays open while the pointer goes into it; a popup
  // never stays behind when the page moves.
  await page.mouse.move(1900, 1060, { steps: 2 });
  await hover(page, card.locator(TARGETS[2].sel).first());
  const series = page.getByTestId("series-popup");
  await expect(series).toBeVisible();
  const sq = series.getByTestId("series-square").first();
  await hover(page, sq);
  await page.waitForTimeout(400);
  await expect(series).toBeVisible();
  await page.mouse.move(1900, 1060, { steps: 2 });
  await expect(series).toHaveCount(0);
  const streakEl = card.locator(TARGETS[1].sel).first();
  await hover(page, streakEl);
  await expect(page.getByTestId("streak-popup")).toBeVisible();
  // A zoom around the still pointer (set up; the same streak stays under
  // it, so the browser sends no new hover): the popup doesn't stay behind.
  const sb = await box(streakEl);
  await page.evaluate(({ x, y }) => {
    const editor = (window as any).editor;
    const c = editor.getCamera();
    const v = editor.getViewportScreenBounds();
    const p = editor.screenToPage({ x, y });
    const z = c.z * 1.05;
    editor.setCamera({ x: (x - v.x) / z - p.x, y: (y - v.y) / z - p.y, z });
  }, { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 });
  await expect(page.getByTestId("streak-popup")).toHaveCount(0, { timeout: 1000 });
  // The browser then hovers what is under the pointer now (as in /calendar):
  // a popup that opens again sits under that streak, not where the old one was.
  await page.waitForTimeout(1500);
  const again = await page.evaluate(({ x, y }) => {
    const pop = document.querySelector("[data-testid=streak-popup]");
    if (!pop) return "closed";
    const el = document.elementFromPoint(x, y)?.closest("[data-streak]");
    if (!el) return "open, with no streak under the pointer";
    const [p, r] = [pop.getBoundingClientRect(), el.getBoundingClientRect()];
    return Math.abs(p.top - (r.bottom + 6)) < 2 || Math.abs(p.bottom - (r.top - 6)) < 2 ? "closed" : "open, away from the streak under the pointer";
  }, { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 });
  expect(again).toBe("closed");
  expect(await selected(page)).toEqual([]);
});

test("Slate links: ↗ opens the game's hoopsjunkie page, a team name its /calendar Team Calendar, in a new tab; a drag that starts on a team name moves the widget and opens nothing", async ({ page, context, request }) => {
  const { night } = await midSeasonNight(request);
  await context.route("https://hoopsjunkie.io/**", (r) => r.fulfill({ contentType: "text/html", body: "<title>hj</title>" }));
  await openWhiteboard(page, night.date);
  const s = await insertSlate(page);
  await page.evaluate(() => (window as any).editor.selectNone());
  const w = widgetOf(page, s.id);
  await expect(w.getByTestId("game-link")).toHaveCount(night.ids.length);

  const first = w.locator(`[data-game-id="${night.ids[0]}"]`);
  const [hj] = await Promise.all([context.waitForEvent("page"), first.getByTestId("game-link").click()]);
  await hj.waitForLoadState();
  expect(hj.url()).toMatch(new RegExp(`^https://hoopsjunkie\\.io/games/${night.date}/[a-z]{3}-vs-[a-z]{3}$`));
  await hj.close();
  expect(page.url()).not.toContain("hoopsjunkie");

  const name = first.locator('[data-side="home"] .ck-slate-name');
  const tri = (await name.getAttribute("data-tricode"))!;
  const [team] = await Promise.all([context.waitForEvent("page"), name.click()]);
  await team.waitForLoadState();
  const u = new URL(team.url());
  expect(u.pathname).toBe("/calendar/");
  expect(Object.fromEntries(u.searchParams)).toMatchObject({ view: "team", layout: "calendar", team: tri, on: night.date });
  await expect(team.getByTestId("team-header")).toBeVisible();
  await team.close();

  // A drag from a team name moves the widget (a hand moving it by its cards).
  await page.evaluate(() => (window as any).editor.selectNone());
  const before = (await slates(page)).find((t) => t.id === s.id)!;
  const pages = context.pages().length;
  const b = await box(name);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  const zoom = await page.evaluate(() => (window as any).editor.getZoomLevel() as number);
  const after = (await slates(page)).find((t) => t.id === s.id)!;
  expect(after.x - before.x).toBeCloseTo(60 / zoom, 0);
  expect(after.y - before.y).toBeCloseTo(40 / zoom, 0);
  await page.waitForTimeout(500);
  expect(context.pages().length).toBe(pages);
});

test("Slate ← / →: the selected widget steps its night (keys and ‹ ›, one undo step each, kept after a reload); Shift+arrows and a mixed selection still nudge; the date bar keeps reading size and clears the resize handles", async ({ page, request }) => {
  const { night, next } = await midSeasonNight(request);
  await openWhiteboard(page, night.date);
  const s = await insertSlate(page);
  const w = widgetOf(page, s.id);
  const bar = page.getByTestId("slate-date-bar");
  await expect(bar.getByTestId("slate-date")).toHaveText(label(night.date));
  // Clear of the widget's resize zones (8 px out) and of the toolbar (a new
  // tall night reaches the window's top: the bar goes under it then).
  const fontAt1 = await bar.evaluate((e) => getComputedStyle(e).fontSize);
  const hAt1 = (await box(bar)).height;
  const clear = async () => {
    const [b, wb, tb] = [await box(bar), await box(w), await box(page.locator(".gk-toolbar").first())];
    const offToolbar = b.x + b.width <= tb.x || b.x >= tb.x + tb.width || b.y + b.height <= tb.y || b.y >= tb.y + tb.height;
    return { offWidget: b.y + b.height <= wb.y - 8 || b.y >= wb.y + wb.height + 8, offToolbar };
  };
  expect(await clear()).toEqual({ offWidget: true, offToolbar: true });
  const shape = async () => (await slates(page)).find((t) => t.id === s.id)!;

  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await shape()).date).toBe(next.date);
  await expect(bar.getByTestId("slate-date")).toHaveText(label(next.date));
  await expect.poll(() => cardIds(page, s.id)).toEqual(next.ids);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await shape()).date).toBe(night.date);
  await expect.poll(() => cardIds(page, s.id)).toEqual(night.ids);
  await bar.getByTestId("slate-next").click();
  await expect.poll(async () => (await shape()).date).toBe(next.date);
  expect(await selected(page)).toEqual([s.id]);
  // One undo step per change.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await shape()).date).toBe(night.date);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await shape()).date).toBe(next.date);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await shape()).date).toBe(night.date);
  await bar.getByTestId("slate-prev").click();
  await expect.poll(async () => (await shape()).date).toBe(addDays(night.date, -1));
  await bar.getByTestId("slate-next").click();
  await expect.poll(async () => (await shape()).date).toBe(night.date);

  // Shift+→ nudges, the night stays.
  const x0 = (await shape()).x;
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await shape()).x).toBeGreaterThan(x0);
  expect((await shape()).date).toBe(night.date);
  // With another item selected too, → nudges both.
  const other = await page.evaluate(() => {
    const editor = (window as any).editor;
    const v = editor.getViewportPageBounds();
    editor.createShape({ type: "geo", x: v.x + 20, y: v.y + 20, props: { w: 60, h: 60 } });
    return editor.getCurrentPageShapes().at(-1).id as string;
  });
  await page.evaluate(({ a, b }) => void (window as any).editor.select(a, b), { a: s.id, b: other });
  await expect(bar).toHaveCount(0);
  const x1 = (await shape()).x;
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await shape()).x).toBeGreaterThan(x1);
  expect((await shape()).date).toBe(night.date);

  // Zoomed out to 25%: the bar keeps its size.
  await page.evaluate(({ id }) => {
    const editor = (window as any).editor;
    editor.select(id);
    editor.setCamera({ ...editor.getCamera(), z: 0.25 });
  }, { id: s.id });
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((e) => getComputedStyle(e).fontSize)).toBe(fontAt1);
  expect((await box(bar)).height).toBeCloseTo(hAt1, 0);

  expect(await clear()).toEqual({ offWidget: true, offToolbar: true });

  // The night is kept.
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await shape()).date).toBe(next.date);
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(widgetOf(page, s.id)).toHaveAttribute("data-date", next.date);
});
