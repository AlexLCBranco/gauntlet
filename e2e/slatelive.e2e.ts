import { expect, test, type Page, type Route } from "./test";

/**
 * GT-5: what changes in calendarkit reaches a Slate on an open whiteboard,
 * without a reload (src/slate/kit.ts, SlateWidget.tsx):
 * - calendarkit's code: the widget draws with calendarkit's current Slate kit
 *   (/calendar/slatekit/, its manifest), and a newer one is picked up while
 *   the whiteboard is open; with no usable kit, the pinned copy;
 * - final scores as soon as ESPN has them (the odds answer's `finals`);
 * - a newer schedule snapshot (the morning's scores, a moved game).
 * The widget still stores only its date and size. Locally /calendar is
 * calendarkit's own build (scripts/local-e2e.mjs), kit included. A check is
 * started by the tab coming back (a `visibilitychange`), as the owner's
 * would; the 5-minute timer does the same.
 */

const TZ = "America/Sao_Paulo";
test.use({ timezoneId: TZ, viewport: { width: 1600, height: 1000 } });

type RawGame = { gameId: string; gameStatus: number; gameStatusText: string; gameDateEst: string; awayTeam: { teamTricode: string; score: number }; homeTeam: { teamTricode: string; score: number } };
type Raw = { meta: { time: string }; leagueSchedule: { gameDates: { games: RawGame[] }[] } };

/** The served snapshot, and a night in it not played yet (2 or more games). */
async function upcoming(page: Page) {
  const raw = (await (await page.request.get("/calendar/data/schedule.json")).json()) as Raw;
  const by: Record<string, RawGame[]> = {};
  for (const d of raw.leagueSchedule.gameDates) for (const g of d.games) if (/^00[2456]/.test(g.gameId)) (by[g.gameDateEst.slice(0, 10)] ??= []).push(g);
  const date = Object.keys(by)
    .sort()
    .find((d) => by[d]!.length >= 2 && by[d]!.every((g) => g.gameStatus === 1))!;
  return { raw, date, games: by[date]! };
}

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const widget = (page: Page) => page.locator('[data-testid="slate-widget"]');
/** A Slate on `date`, shown with its cards. */
async function placeSlate(page: Page, date: string) {
  await page.evaluate((date) => (window as any).editor.createShape({ id: "shape:live", type: "calendarkit-slate", x: 200, y: 150, props: { date } }), date);
  await expect(widget(page)).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
}
const card = (page: Page, gameId: string) => page.locator(`[data-testid="slate-widget"] [data-game-id="${gameId}"]`);
const scores = (page: Page, gameId: string) => card(page, gameId).locator(".ck-slate-score").allTextContents();
/** The tab coming back: the widget looks for a newer kit and schedule. */
const tabBack = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
/** What the shape stores: never games, only its date and size. */
const stored = (page: Page) => page.evaluate(() => Object.keys((window as any).editor.getShape("shape:live").props).sort());
const PROPS = ["date", "h", "hideNotes", "scale", "w"];

test("GT-5: the Slate draws with calendarkit's current kit from /calendar, with its stylesheet first; with no usable kit, the pinned copy", async ({ page }) => {
  const manifest = (await (await page.request.get("/calendar/slatekit/manifest.json")).json()) as { api: number; version: string; js: string; css: string };
  expect(manifest.api).toBe(1);
  await open(page);
  const { date } = await upcoming(page);
  await placeSlate(page, date);
  await expect(widget(page)).toHaveAttribute("data-kit", "live");
  await expect(widget(page)).toHaveAttribute("data-kit-version", manifest.version);
  // the kit's stylesheet is the first in <head> (the whiteboard's overrides come after it); no pinned copy's
  expect(await page.evaluate(() => (document.head.firstElementChild as HTMLLinkElement).getAttribute("href"))).toBe(manifest.css);
  expect(await page.locator("style[data-slatekit]").count()).toBe(0);
  // the cards look as calendarkit's (its font, its card class)
  expect(await widget(page).locator(".ck-slate-card").count()).toBeGreaterThan(1);
  expect(await widget(page).locator(".ck-slate-card").first().evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Inter ck");

  // No usable kit (none, or another API version): the pinned copy, same cards.
  for (const answer of [{ status: 404, body: "" }, { status: 200, body: JSON.stringify({ ...manifest, api: 2 }) }]) {
    const p = await page.context().newPage();
    await p.route("**/calendar/slatekit/manifest.json", (r) => r.fulfill(answer));
    await open(p);
    await placeSlate(p, date);
    await expect(widget(p)).toHaveAttribute("data-kit", "pinned");
    expect(await p.locator("style[data-slatekit]").count()).toBe(1);
    expect(await p.locator("link[data-slatekit]").count()).toBe(0);
    expect(await widget(p).locator(".ck-slate-card").count()).toBe(await widget(page).locator(".ck-slate-card").count());
    await p.close();
  }
});

test("GT-5: a newer kit deployed while the whiteboard is open is picked up without a reload; the widget keeps its date and size", async ({ page }) => {
  await open(page);
  const { date } = await upcoming(page);
  await placeSlate(page, date);
  const before = await page.evaluate(() => (window as any).editor.getShape("shape:live").props);
  const manifest = (await (await page.request.get("/calendar/slatekit/manifest.json")).json()) as { js: string; css: string; version: string };
  // calendarkit deploys: a new version (its files at new addresses)
  await page.route("**/calendar/slatekit/manifest.json", (r: Route) => r.fulfill({ json: { ...manifest, version: "99.0.0", js: `${manifest.js}?v=99`, css: `${manifest.css}?v=99` } }));
  await tabBack(page);
  await expect(widget(page)).toHaveAttribute("data-kit-version", "99.0.0");
  await expect(widget(page)).toHaveAttribute("data-state", "ready");
  expect(await widget(page).locator(".ck-slate-card").count()).toBeGreaterThan(1);
  // one kit stylesheet, the new one, still first
  expect(await page.locator("link[data-slatekit]").count()).toBe(1);
  expect(await page.evaluate(() => (document.head.firstElementChild as HTMLLinkElement).getAttribute("href"))).toBe(`${manifest.css}?v=99`);
  expect(await page.evaluate(() => (window as any).editor.getShape("shape:live").props)).toEqual(before);
  expect(await stored(page)).toEqual(PROPS);
});

test("GT-5: a game over tonight shows its final score once ESPN has it (the odds answer), before the morning snapshot", async ({ page }) => {
  await open(page);
  const { date, games } = await upcoming(page);
  const [g, other] = games;
  await page.route("**/calendar/api/odds**", (r) =>
    r.fulfill({ json: { date, games: {}, live: true, finals: { [`${g!.awayTeam.teamTricode}@${g!.homeTeam.teamTricode}`]: { away: 117, home: 109, statusText: "Final" } } } }),
  );
  await placeSlate(page, date);
  await expect.poll(() => scores(page, g!.gameId)).toEqual(["117", "109"]);
  expect(await scores(page, other!.gameId)).toEqual(["", ""]);
  expect(await stored(page)).toEqual(PROPS);
});

test("GT-5: a newer schedule snapshot (the morning's scores) reaches an open whiteboard without a reload", async ({ page }) => {
  await page.route("**/calendar/api/odds**", (r) => r.fulfill({ status: 404, body: "" })); // only the snapshot brings scores here
  await open(page);
  const { raw, date, games } = await upcoming(page);
  await placeSlate(page, date);
  const g = games[0]!;
  expect(await scores(page, g.gameId)).toEqual(["", ""]);
  // the next morning's snapshot: that game played
  const next = structuredClone(raw);
  next.meta.time = "2099-01-01T11:00:00Z";
  for (const d of next.leagueSchedule.gameDates)
    for (const x of d.games)
      if (x.gameId === g.gameId) Object.assign(x, { gameStatus: 3, gameStatusText: "Final", awayTeam: { ...x.awayTeam, score: 101 }, homeTeam: { ...x.homeTeam, score: 99 } });
  await page.route("**/calendar/data/schedule.json", (r) => r.fulfill({ json: next }));
  await tabBack(page);
  await expect.poll(() => scores(page, g.gameId)).toEqual(["101", "99"]);
  expect(await stored(page)).toEqual(PROPS);
});
