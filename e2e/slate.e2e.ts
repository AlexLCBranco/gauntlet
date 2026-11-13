import { readFile, writeFile } from "node:fs/promises";

import { expect, test, type APIRequestContext, type Browser, type Page } from "./test";

import { box, whiteboardSaved } from "./helpers";

/**
 * calendarkit's Slate as a whiteboard widget (Slate widget step 2, static;
 * src/slate/). Fresh, empty browser profile per test, the owner's time
 * zone. The schedule is whatever /calendar serves (locally: calendarkit's
 * own build, scripts/local-e2e.mjs); the nights used are read from it.
 * `window.editor` is read to check, and used to set up what a person
 * can't make exactly by hand (a scale of 1, a position), where marked.
 */

const TZ = "America/Sao_Paulo";
test.use({ timezoneId: TZ });
// Each test sets the page's clock before the page opens (clock.install, a
// running clock): moving it back on an open whiteboard stalls tldraw (its
// ticks wait for the time to catch up), so only short moves forward later.

type Slate = { id: string; x: number; y: number; date: string; w: number; h: number; scale: number; cols: number };
type Night = { date: string; ids: string[]; keys: string[] };

const slates = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .filter((s: any) => s.type === "calendarkit-slate")
      .map((s: any) => ({ id: s.id, x: s.x, y: s.y, ...s.props })),
  ) as Promise<Slate[]>;

/** The schedule's nights (regular season, Cup, play-in, play-offs), each
    game's id in tip-off order, as the feed has them. */
async function nights(request: APIRequestContext): Promise<Night[]> {
  const raw = (await (await request.get("/calendar/data/schedule.json")).json()) as {
    leagueSchedule: { gameDates: { games: { gameId: string; gameDateEst: string; gameDateTimeUTC: string; awayTeam: { teamTricode: string }; homeTeam: { teamTricode: string } }[] }[] };
  };
  const by: Record<string, { gameId: string; t: string; key: string }[]> = {};
  for (const d of raw.leagueSchedule.gameDates)
    for (const g of d.games)
      if (/^00[2456]/.test(g.gameId)) (by[g.gameDateEst.slice(0, 10)] ??= []).push({ gameId: g.gameId, t: g.gameDateTimeUTC, key: `${g.awayTeam.teamTricode}@${g.homeTeam.teamTricode}` });
  return Object.keys(by)
    .sort()
    .map((date) => {
      const gs = by[date]!.sort((a, b) => a.t.localeCompare(b.t));
      return { date, ids: gs.map((g) => g.gameId), keys: gs.map((g) => g.key) };
    });
}

/** A night with `n` games (the first), else the night with the most. */
const nightWith = (all: Night[], n: number) => all.find((x) => x.ids.length === n) ?? [...all].sort((a, b) => b.ids.length - a.ids.length)[0]!;

/** The page's clock: 12:00 in São Paulo on `date`. */
const noonOn = (date: string) => new Date(`${date}T15:00:00Z`);

/** Opens the whiteboard, its clock at `time` (running). */
async function openWhiteboard(page: Page, time?: Date) {
  if (time) await page.clock.install({ time });
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const widgetOf = (page: Page, id: string) => page.locator(`[id="${id}"] [data-testid="slate-widget"]`);

/** Toolbar → Slate; waits until the new widget is sized and shown. */
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
  await expect(widgetOf(page, made!.id)).toBeVisible();
  return made!;
}

const cardIds = (page: Page, id: string) => widgetOf(page, id).locator(".ck-slate-card").evaluateAll((cs) => cs.map((c) => c.getAttribute("data-game-id")!));

/** calendarkit's copies' column rule (its layout.ts slateCopyColumns),
    written out here: the count whose image, fitted to the page, shows the
    cards largest; ties, fewer. Card 914 px wide, 24 px between. */
function copyColumns(n: number, cardH: number, page: { w: number; h: number }) {
  let best = 1;
  let bestScale = 0;
  for (let c = 1; c <= n; c++) {
    const s = Math.min(page.w / (c * 938), page.h / (Math.ceil(n / c) * (cardH + 24)));
    if (s > bestScale + 1e-9) [best, bestScale] = [c, s];
  }
  return best;
}

/** Where the page's 100% view starts and how big it is (page units). */
const view = (page: Page) => page.evaluate(() => { const b = (window as any).editor.getViewportPageBounds(); return { x: b.x, y: b.y, w: b.w, h: b.h }; });

test("Slate: one click puts tonight's games on the page, in tip-off order, in the copies' columns, a third of the window wide (speed session Part 3); one undo removes it", async ({ page, request }) => {
  const night = nightWith(await nights(request), 15);
  await openWhiteboard(page, noonOn(night.date));
  const v = await view(page);
  const s = await insertSlate(page);
  expect(s.date).toBe(night.date);
  expect(await cardIds(page, s.id)).toEqual(night.ids);

  // The room: a third of the window's width, 90% of its height (at 100%).
  const room = { w: v.w / 3, h: v.h * 0.9 };
  const cardH = await widgetOf(page, s.id).locator(".ck-slate-card").evaluateAll((cs) => Math.max(...cs.map((c) => (c as HTMLElement).offsetHeight)));
  expect(s.cols).toBe(copyColumns(night.ids.length, cardH, room));
  const grid = await widgetOf(page, s.id).locator(".ck-slate-copy").evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(" ").length);
  expect(grid).toBe(s.cols);
  // The whole night inside the window, filling the room one way.
  expect(s.x).toBeGreaterThanOrEqual(v.x - 0.5);
  expect(s.y).toBeGreaterThanOrEqual(v.y - 0.5);
  expect(s.x + s.w).toBeLessThanOrEqual(v.x + v.w + 0.5);
  expect(s.y + s.h).toBeLessThanOrEqual(v.y + v.h + 0.5);
  expect(s.w).toBeLessThanOrEqual(room.w + 0.5);
  expect(Math.max(s.w / room.w, s.h / room.h)).toBeGreaterThan(0.97);
  // Selected, as a board placed new is.
  expect(await page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([s.id]);

  await page.keyboard.press("Control+z");
  await expect.poll(() => slates(page)).toHaveLength(0);
});

test("Slate: a widget stays on its night after midnight and a reload; a new one takes the new day", async ({ page, request }) => {
  const all = await nights(request);
  const i = all.findIndex((n, k) => k > 0 && all[k + 1] && all[k + 1]!.date === addDay(n.date));
  const [day, next] = [all[i]!, all[i + 1]!];
  // 23:57 in São Paulo (UTC-3), a running clock.
  await openWhiteboard(page, new Date(`${next.date}T02:57:00Z`));
  const first = await insertSlate(page);
  expect(first.date).toBe(day.date);
  await whiteboardSaved(page);
  // Past midnight.
  await page.clock.fastForward("05:00");
  expect(await page.evaluate(() => new Date().toISOString())).toMatch(new RegExp(`^${next.date}T03:0`));
  await page.waitForTimeout(300);
  expect((await slates(page))[0]!.date).toBe(day.date);
  expect(await cardIds(page, first.id)).toEqual(day.ids);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(widgetOf(page, first.id).locator(".ck-slate-card")).toHaveCount(day.ids.length);
  expect(await cardIds(page, first.id)).toEqual(day.ids);

  await page.evaluate(() => void (window as any).editor.selectNone());
  const second = await insertSlate(page);
  expect(second.date).toBe(next.date);
  expect(await cardIds(page, second.id)).toEqual(next.ids);
  expect(await cardIds(page, first.id)).toEqual(day.ids);
});

const addDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Notes on a night's first three games: one per slot on show, the third
    long enough to grow its card (as calendarkit's round 10 tests). */
function notesFor(ids: string[]) {
  const [a, b, c] = ids;
  return {
    [a!]: { pre: "Watch the minutes of the starters", live: "", post: "", shown: "pre" },
    [b!]: { pre: "pre text", live: "Second unit run 12-2 in Q2", post: "", shown: "live" },
    [c!]: { pre: "", live: "", post: "Closing lineup:\nPG, SG, SF, PF, C\n— switched everything\n— zone in the 4th\nlast line", shown: "post" },
  };
}

/** The copies' pixel ratio for a 5-game night in a 1920 × 1080 window
    (calendarkit's slatePixelRatio: 4 unless fitted larger than 2×). */
const COPY_RATIO = 4;

/** calendarkit's copy of `night` (League → Slate → Copy view as image) in
    a 1920 × 1080 window, its notes `notes`: the PNG (base64), the pixel
    ratio, each card's and note box's rect in it (CSS px), and a
    screenshot of the copy's own layout (its capture stage, brought on
    screen) at that ratio. The clipboard write is held (never finishes), so
    the stage stays while it is shot. */
async function calendarkitCopy(browser: Browser, baseURL: string, night: Night, notes: object) {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: COPY_RATIO, timezoneId: TZ });
  const page = await ctx.newPage();
  await page.addInitScript(
    ({ date, notes }) => {
      (window as unknown as { __ckOpenDate?: string }).__ckOpenDate = date;
      localStorage.setItem("ck:notes:v1", notes);
      const w = window as unknown as { __png?: Promise<Blob> };
      Object.defineProperty(navigator, "clipboard", {
        value: {
          write: (items: ClipboardItem[]) => {
            w.__png = items[0]!.getType("image/png");
            return new Promise(() => {});
          },
          writeText: () => Promise.resolve(),
        },
      });
    },
    { date: night.date, notes: JSON.stringify(notes) },
  );
  await page.clock.setFixedTime(noonOn(night.date));
  await page.goto("/calendar/?view=league&layout=slate");
  await expect(page.locator('[data-testid="slate"] .ck-slate-card')).toHaveCount(night.ids.length);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await page.evaluate(() => {
    const w = window as unknown as { __stage?: unknown };
    const obs = new MutationObserver(() => {
      const root = document.querySelector<HTMLElement>(".ck-capture .ck-slate-copy");
      if (!root || w.__stage) return;
      const o = root.getBoundingClientRect();
      w.__stage = [...root.querySelectorAll(".ck-slate-card, .ck-gnote")].map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, text: (e as HTMLElement).innerText };
      });
      obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
  const button = page.getByTestId("copy-view");
  await button.click();
  await page.waitForFunction(() => (window as any).__png, null, { timeout: 60_000 });
  const ratio = Number((await button.getAttribute("data-captured"))!.split("@")[1]);
  const stage = (await page.evaluate(() => (window as any).__stage)) as { x: number; y: number; w: number; h: number; text: string }[];
  await page.addStyleTag({ content: ".ck-capture-stage { left: 0 !important; top: 0 !important; z-index: 2147483647; }" });
  await page.mouse.move(1919, 1079);
  const stageShot = (await page.locator(".ck-capture .ck-slate-copy").screenshot({ animations: "disabled", caret: "hide" })).toString("base64");
  const png = await page.evaluate(async () => {
    const bytes = new Uint8Array(await (await (window as any).__png as Blob).arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await ctx.close();
  return { png, ratio, stage, stageShot };
}

test("Slate: at 100% the widget is calendarkit's copy of that night: same cards and note boxes at the same places and sizes, same text, near-identical pixels; nothing between them; no ↗ or ⇄", async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  const night = nightWith(await nights(request), 5);
  const notes = notesFor(night.ids);
  const copy = await calendarkitCopy(browser, baseURL!, night, notes);
  expect(copy.ratio).toBe(COPY_RATIO);

  // The widget, at the copy's pixel ratio, scale 1, at the page's corner (set up).
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: copy.ratio, timezoneId: TZ });
  const page = await ctx.newPage();
  await page.addInitScript((n) => localStorage.setItem("ck:notes:v1", n), JSON.stringify(notes));
  await page.clock.install({ time: noonOn(night.date) });
  await openWhiteboard(page);
  const s = await insertSlate(page);
  await page.evaluate((id) => {
    const editor = (window as any).editor;
    editor.selectNone();
    const p = editor.getShape(id).props;
    editor.updateShape({ id, type: "calendarkit-slate", x: 0, y: 0, props: { scale: 1, w: p.w / p.scale, h: p.h / p.scale } });
    editor.setCamera({ x: 0, y: 0, z: 1 });
  }, s.id);
  await page.mouse.move(1919, 1079);
  const w = widgetOf(page, s.id);
  await expect.poll(async () => (await box(w)).width).toBeCloseTo(copy.png ? (await sizeOf(page, copy.png)).w / copy.ratio : 0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  // No controls of steps 3-4 yet: no ↗, no ⇄, no field.
  await expect(w.locator('[data-testid="game-link"], [data-testid="note-switch"], textarea, a, button')).toHaveCount(0);
  // Slot labels as saved.
  const slots = await w.locator('[data-testid="note-slot"]').allTextContents();
  expect(slots.slice(0, 3)).toEqual(["PRE", "LIVE", "POST"]);
  // Nothing drawn behind the cards: no background on the widget or its grid.
  for (const sel of [".gs-slate", ".ck-slate-copy"])
    expect(await page.locator(`[id="${s.id}"] ${sel}`).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await page.addStyleTag({ content: ".tlui-layout, .tl-user-indicator-bounds, [data-testid='backup-banner'] { visibility: hidden !important; }" });

  const { w: pw, h: ph } = await sizeOf(page, copy.png);
  const shot = (await page.screenshot({ clip: { x: 0, y: 0, width: pw / copy.ratio, height: ph / copy.ratio }, animations: "disabled", caret: "hide" })).toString("base64");
  // Layout and text: every card and note box where the copy has it, as
  // big, saying the same (CSS px, from the grid's corner).
  const mine = await w.locator(".ck-slate-copy").evaluate((root) => {
    const o = root.getBoundingClientRect();
    return [...root.querySelectorAll(".ck-slate-card, .ck-gnote")].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, text: (e as HTMLElement).innerText };
    });
  });
  expect(mine.length).toBe(copy.stage.length);
  mine.forEach((m, i) => {
    const c = copy.stage[i]!;
    for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(m[k] - c[k]), `${k} of item ${i}`).toBeLessThan(0.01);
    expect(m.text).toBe(c.text);
  });
  // Pixels where the copy has a card (opaque), less each card's and note
  // box's 10 px corners: not all equal. Card heights are fractional, so the
  // rows' edges fall between device pixels, and calendarkit's copy
  // (html-to-image, through an SVG), its stage on screen and the widget on
  // the whiteboard each round them their own way: text and logos rasterize
  // a little differently (measured 2026-10-31: 1.7-2.4% of card pixels
  // more than 32 levels apart). Held under 5%, a real change (a missing
  // label, a colour, a shifted row) is far more. Between the cards
  // (transparent in the copy) the widget shows the page itself.
  const sheet = await page.evaluate(() => getComputedStyle(document.querySelector(".tl-background") ?? document.body).backgroundColor);
  // The copy's layout as calendarkit draws it on screen.
  const r = await comparePng(page, copy.png, copy.stageShot, shot, copy.stage, copy.ratio);
  // The copied PNG itself.
  const viaPng = await comparePng(page, copy.png, copy.png, shot, copy.stage, copy.ratio);
  test.info().annotations.push({ type: "pixels", description: JSON.stringify({ stage: r, png: viaPng, ratio: copy.ratio, sheet }) });
  await writeFile(test.info().outputPath("calendarkit-copy.png"), Buffer.from(copy.png, "base64"));
  await writeFile(test.info().outputPath("widget.png"), Buffer.from(shot, "base64"));
  await writeFile(test.info().outputPath("calendarkit-stage.png"), Buffer.from(copy.stageShot, "base64"));
  console.log("pixels", JSON.stringify({ stage: r, png: viaPng, ratio: copy.ratio, sheet }));
  expect(r.size).toBe("same");
  expect(r.cardPixels).toBeGreaterThan(100_000);
  expect(r.bigDiff / r.cardPixels).toBeLessThan(0.05);
  expect(r.gapNotBackground).toBe(0);
  expect(viaPng.gapNotBackground).toBe(0);
  expect(viaPng.bigDiff / viaPng.cardPixels).toBeLessThan(0.05);
  await ctx.close();
});

const sizeOf = (page: Page, png: string) =>
  page.evaluate(async (png) => {
    const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    return { w: b.width, h: b.height };
  }, png);

/** `copy` (calendarkit's PNG, transparent around the cards) against `shot`
    (the widget on the page): how many card pixels differ (corners left
    out), and how many gap pixels (transparent in the copy, more than 2 px
    from a card) aren't the page's background colour in the shot. */
const comparePng = (page: Page, mask: string, ref: string, shot: string, rects: { x: number; y: number; w: number; h: number }[], ratio: number) =>
  page.evaluate(
    async ({ mask, ref, shot, rects, ratio }) => {
      const read = async (s: string) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const x = c.getContext("2d")!;
        x.drawImage(bmp, 0, 0);
        return x.getImageData(0, 0, bmp.width, bmp.height);
      };
      const [m, p, q] = [await read(mask), await read(ref), await read(shot)];
      // A screenshot of the copy's stage may run 1 px past the PNG (a
      // fractional height rounded up): compared over the PNG's area.
      if (p.width < m.width || p.height < m.height) return { size: `ref ${p.width}×${p.height} vs copy ${m.width}×${m.height}`, cardPixels: 0, cardDiff: -1, bigDiff: -1, maxDelta: -1, gapNotBackground: -1 };
      if (m.width !== q.width || m.height !== q.height) return { size: `${p.width}×${p.height} vs ${q.width}×${q.height}`, cardPixels: 0, cardDiff: -1, bigDiff: -1, maxDelta: -1, gapNotBackground: -1 };
      const corner = 10 * ratio;
      const inCorner = (x: number, y: number) =>
        rects.some((k) => {
          const [x0, y0, x1, y1] = [k.x * ratio, k.y * ratio, (k.x + k.w) * ratio, (k.y + k.h) * ratio];
          return (x < x0 + corner || x >= x1 - corner) && (y < y0 + corner || y >= y1 - corner) && x >= x0 - 2 && x < x1 + 2 && y >= y0 - 2 && y < y1 + 2;
        });
      const nearCard = (x: number, y: number) => rects.some((k) => x >= (k.x - 2) * ratio && x < (k.x + k.w + 2) * ratio && y >= (k.y - 2) * ratio && y < (k.y + k.h + 2) * ratio);
      // the page's colour: the shot's top-left pixel (half a gap from any card)
      const bg = [q.data[0], q.data[1], q.data[2]];
      let cardPixels = 0;
      let cardDiff = 0;
      let bigDiff = 0;
      let maxDelta = 0;
      let gapNotBackground = 0;
      for (let i = 0; i < m.data.length; i += 4) {
        const [x, y] = [(i / 4) % m.width, Math.floor(i / 4 / m.width)];
        const j = (y * p.width + x) * 4;
        if (m.data[i + 3] === 255) {
          if (inCorner(x, y)) continue;
          cardPixels++;
          const d = Math.max(Math.abs(p.data[j]! - q.data[i]!), Math.abs(p.data[j + 1]! - q.data[i + 1]!), Math.abs(p.data[j + 2]! - q.data[i + 2]!));
          if (d) cardDiff++;
          if (d > 32) bigDiff++;
          maxDelta = Math.max(maxDelta, d);
        } else if (m.data[i + 3] === 0 && !nearCard(x, y)) {
          if (q.data[i] !== bg[0] || q.data[i + 1] !== bg[1] || q.data[i + 2] !== bg[2]) gapNotBackground++;
        }
      }
      return { size: "same", cardPixels, cardDiff, bigDiff, maxDelta, gapNotBackground };
    },
    { mask, ref, shot, rects, ratio },
  );

test("Slate: notes are read only: one typed in calendarkit (same browser) shows in the widget at once, with its slot; the widget never writes them", async ({ page, context, request }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __noteWrites: string[] };
    w.__noteWrites = [];
    for (const m of ["setItem", "removeItem"] as const) {
      const own = Storage.prototype[m];
      Storage.prototype[m] = function (this: Storage, key: string, ...rest: string[]) {
        if (key === "ck:notes:v1") w.__noteWrites.push(m);
        return (own as (...a: string[]) => void).call(this, key, ...rest);
      };
    }
  });
  const night = nightWith(await nights(request), 5);
  await openWhiteboard(page, noonOn(night.date));
  const s = await insertSlate(page);
  const firstNote = widgetOf(page, s.id).locator(`[data-game-id="${night.ids[0]}"] [data-testid="note"]`);
  await expect(firstNote.getByTestId("note-slot")).toHaveText("PRE");
  await expect(firstNote.getByTestId("note-text")).toHaveText("");

  const ck = await context.newPage();
  await ck.addInitScript((d) => ((window as unknown as { __ckOpenDate?: string }).__ckOpenDate = d), night.date);
    await ck.goto("/calendar/?view=league&layout=slate");
  const box1 = ck.locator(`[data-testid="slate"] [data-game-id="${night.ids[0]}"]`);
  await box1.getByTestId("note-text").fill("Typed in calendarkit");
  await box1.getByTestId("note-text").blur();
  await expect(firstNote.getByTestId("note-text")).toHaveText("Typed in calendarkit");
  await box1.getByTestId("note-switch").click();
  await box1.getByTestId("note-text").fill("Live one");
  await box1.getByTestId("note-text").blur();
  await expect(firstNote.getByTestId("note-slot")).toHaveText("LIVE");
  await expect(firstNote.getByTestId("note-text")).toHaveText("Live one");
  await ck.close();

  // Nothing to type in, and nothing written from the whiteboard.
  await expect(widgetOf(page, s.id).locator("textarea, button")).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(firstNote.getByTestId("note-text")).toHaveText("Live one");
  expect(await page.evaluate(() => (window as any).__noteWrites)).toEqual([]);
});

/** A widget of `night` at `scale`, its top-left at (`x`, `y`) on the page
    (set up), not selected. */
async function placed(page: Page, night: Night, scale: number, x: number, y: number) {
  expect(await page.evaluate(() => new Date().toISOString().slice(0, 10))).toBe(night.date);
  const s = await insertSlate(page);
  await page.evaluate(({ id, scale, x, y }) => {
    const editor = (window as any).editor;
    const p = editor.getShape(id).props;
    editor.updateShape({ id, type: "calendarkit-slate", x, y, props: { scale, w: (p.w / p.scale) * scale, h: (p.h / p.scale) * scale } });
    editor.selectNone();
  }, { id: s.id, scale, x, y });
  await expect.poll(async () => (await slates(page)).find((t) => t.id === s.id)!.w).toBeCloseTo(s.w * (scale / s.scale), 0);
  return (await slates(page)).find((t) => t.id === s.id)!;
}

test("Slate: scaled from its corner like a picture, text stays text, proportions kept; zooms with the page", async ({ page, request }) => {
  const night = nightWith(await nights(request), 5);
  await openWhiteboard(page, noonOn(night.date));
  const s = await placed(page, night, 0.4, 100, 100);
  const w = widgetOf(page, s.id);
  const name = w.locator(".ck-slate-name").first();
  const before = { card: await box(w.locator(".ck-slate-card").first()), font: (await box(name)).height };

  // Select it, then drag its bottom-right corner out.
  await page.mouse.click(100 + s.w / 2, 100 + s.h / 2);
  await expect.poll(() => page.evaluate(() => (window as any).editor.getSelectedShapeIds())).toEqual([s.id]);
  await page.mouse.move(100 + s.w, 100 + s.h);
  await page.mouse.down();
  await page.mouse.move(100 + s.w * 1.4, 100 + s.h * 1.4, { steps: 8 });
  await page.mouse.up();
  const t = (await slates(page))[0]!;
  expect(t.scale / s.scale).toBeCloseTo(1.4, 1);
  expect(t.w / t.h).toBeCloseTo(s.w / s.h, 2);
  const after = await box(w.locator(".ck-slate-card").first());
  expect(after.width / before.card.width).toBeCloseTo(t.scale / s.scale, 2);
  expect(after.height / before.card.height).toBeCloseTo(t.scale / s.scale, 2);
  // Real text, scaled: no canvas or picture of it.
  await expect(name).not.toHaveText("");
  await expect(w.locator("canvas")).toHaveCount(0);
  expect((await box(name)).height / before.font).toBeCloseTo(t.scale / s.scale, 1);

  // Zoom in: it grows on screen with the page.
  const z0 = await box(w);
  await page.mouse.move(5, 500);
  await page.keyboard.press("Control+Equal");
  await expect.poll(async () => (await box(w)).width / z0.width).toBeCloseTo(1.1, 1);
});

test("Slate: box select, lasso, duplicate (same night), delete, undo and redo; an arrow attached to it follows it", async ({ page, request }) => {
  const night = nightWith(await nights(request), 5);
  await openWhiteboard(page, noonOn(night.date));
  const s = await placed(page, night, 0.35, 200, 150);
  const sel = () => page.evaluate(() => (window as any).editor.getSelectedShapeIds() as string[]);

  // Box select: a drag from empty page round it.
  await page.mouse.move(150, 100);
  await page.mouse.down();
  await page.mouse.move(200 + s.w + 40, 150 + s.h + 40, { steps: 10 });
  await page.mouse.up();
  await expect.poll(sel).toEqual([s.id]);
  await page.keyboard.press("Escape");
  await expect.poll(sel).toEqual([]);

  // Lasso (W): a loop round it (an ellipse 1.5× the box holds its corners).
  await page.keyboard.press("w");
  const [cx, cy, rx, ry] = [200 + s.w / 2, 150 + s.h / 2, s.w * 0.75 + 10, s.h * 0.75 + 10];
  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  for (let a = 0; a <= 2 * Math.PI + 0.2; a += 0.2) await page.mouse.move(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  await page.mouse.up();
  await expect.poll(sel).toEqual([s.id]);

  // Duplicate keeps the night.
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await slates(page)).length).toBe(2);
  const copy = (await slates(page)).find((t) => t.id !== s.id)!;
  expect(copy.date).toBe(s.date);
  expect(copy.cols).toBe(s.cols);
  await expect(widgetOf(page, copy.id).locator(".ck-slate-card")).toHaveCount(night.ids.length);

  // Delete it; undo brings it back; redo deletes it again.
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await slates(page)).length).toBe(1);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await slates(page)).length).toBe(2);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await slates(page)).length).toBe(1);

  // An arrow from empty page into the widget is attached to it, and
  // follows it when it moves.
  await page.keyboard.press("Escape");
  await page.keyboard.press("a");
  await page.mouse.move(60, 60);
  await page.mouse.down();
  await page.mouse.move(200 + s.w / 2, 150 + s.h / 2, { steps: 10 });
  await page.mouse.up();
  const arrowEnd = () =>
    page.evaluate((id) => {
      const editor = (window as any).editor;
      const b = editor.getBindingsToShape(id, "arrow")[0];
      if (!b) return null;
      const arrow = editor.getShape(b.fromId);
      // The arrow runs down-right into the widget: its drawn box's far
      // corner is its end.
      const r = editor.getShapePageBounds(arrow);
      return { x: r.maxX, y: r.maxY };
    }, s.id) as Promise<{ x: number; y: number } | null>;
  await expect.poll(arrowEnd).not.toBeNull();
  const end0 = (await arrowEnd())!;
  await page.keyboard.press("Escape");
  await page.mouse.move(200 + s.w / 2 + 30, 150 + s.h / 2 + 30);
  await page.mouse.down();
  await page.mouse.move(200 + s.w / 2 + 130, 150 + s.h / 2 + 80, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await slates(page))[0]!.x).toBeCloseTo(300, 0);
  const end1 = (await arrowEnd())!;
  // Still bound, and its end went along (its bend may change a little).
  expect(await page.evaluate((id) => (window as any).editor.getBindingsToShape(id, "arrow").length, s.id)).toBe(1);
  expect(Math.abs(end1.x - end0.x - 100)).toBeLessThan(15);
  expect(Math.abs(end1.y - end0.y - 50)).toBeLessThan(15);
});

test("Slate: the widget and its night survive a reload and a backup restored into a fresh browser", async ({ page, browser, baseURL, request }) => {
  const night = nightWith(await nights(request), 5);
  await openWhiteboard(page, noonOn(night.date));
  const s = await placed(page, night, 0.5, 120, 80);
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(widgetOf(page, s.id).locator(".ck-slate-card")).toHaveCount(night.ids.length);
  expect((await slates(page))[0]).toMatchObject({ date: night.date, scale: 0.5, x: 120, y: 80 });

  await page.goto("/backup/");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save a backup" }).click()]);
  const file = await readFile((await download.path())!, "utf-8");

  const ctx = await browser.newContext({ baseURL, timezoneId: TZ });
  const fresh = await ctx.newPage();
  // A later day: the widget keeps its own night.
  await fresh.clock.install({ time: noonOn(addDay(addDay(night.date))) });
  await fresh.goto("/backup/");
  await fresh.getByLabel("Backup file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(file) });
  const dialog = fresh.getByRole("dialog", { name: "Replace what's here with this backup?" });
  await Promise.all([fresh.waitForEvent("download"), dialog.getByRole("button", { name: "Replace with this backup" }).click()]);
  await expect(fresh.getByRole("status")).toContainText("Restored");
  await openWhiteboard(fresh);
  await expect(widgetOf(fresh, s.id).locator(".ck-slate-card")).toHaveCount(night.ids.length);
  expect((await slates(fresh))[0]).toMatchObject({ date: night.date, scale: 0.5, x: 120, y: 80 });
  expect(await cardIds(fresh, s.id)).toEqual(night.ids);
  await ctx.close();
});

test("Slate: when the schedule can't load the widget keeps its place and size, says so, and Try again works; a night with no games says so", async ({ page, browser, baseURL, request }) => {
  const night = nightWith(await nights(request), 5);
  await openWhiteboard(page, noonOn(night.date));
  const s = await placed(page, night, 0.5, 120, 80);
  await whiteboardSaved(page);

  let fail = true;
  await page.route("**/calendar/data/schedule.json*", (r) => (fail ? r.fulfill({ status: 503, body: "down" }) : r.continue()));
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  const w = widgetOf(page, s.id);
  await expect(w).toHaveAttribute("data-state", "failed");
  await expect(w.getByTestId("slate-message")).toContainText("Schedule unavailable");
  await expect(w.getByTestId("slate-message")).toContainText(new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${night.date}T12:00:00Z`)));
  expect((await slates(page))[0]).toMatchObject({ x: 120, y: 80, w: s.w, h: s.h, scale: 0.5, date: night.date });
  expect(await box(w.getByTestId("slate-message"))).toMatchObject({ width: expect.closeTo(s.w, 0), height: expect.closeTo(s.h, 0) });
  // A new one while it's down: placed, kept, waiting.
  await page.evaluate(() => void (window as any).editor.selectNone());
  await page.getByTestId("tools.slate").click();
  await expect.poll(async () => (await slates(page)).length).toBe(2);
  await expect(page.locator('[data-testid="slate-widget"][data-state="failed"]')).toHaveCount(2);

  fail = false;
  // Nothing selected: the style panel (top left) would cover the button.
  await page.evaluate(() => void (window as any).editor.selectNone());
  await w.getByTestId("slate-retry").click();
  await expect(page.locator('[data-testid="slate-widget"][data-state="ready"]')).toHaveCount(2);
  await expect(w.locator(".ck-slate-card")).toHaveCount(night.ids.length);
  expect((await slates(page)).find((t) => t.id === s.id)).toMatchObject({ x: 120, y: 80, scale: 0.5 });

  // A night without games (mid-July, another browser): the date and "No games".
  const ctx = await browser.newContext({ baseURL, timezoneId: TZ });
  const july = await ctx.newPage();
  await openWhiteboard(july, noonOn(`${night.date.slice(0, 4)}-07-15`));
  await july.getByTestId("tools.slate").click();
  await expect(july.locator('[data-testid="slate-widget"][data-state="empty"]')).toHaveCount(1);
  const empty = (await slates(july))[0]!;
  expect(empty.date).toBe(`${night.date.slice(0, 4)}-07-15`);
  await expect(widgetOf(july, empty.id).getByTestId("slate-message")).toContainText("No games");
  await expect(widgetOf(july, empty.id).getByTestId("slate-message")).toContainText("Jul 15");
  await ctx.close();
});

test("Slate: one schedule request for every widget on every page; no timers or requests at rest; calendarkit isn't loaded on a page without a Slate", async ({ page, request }) => {
  const asked: string[] = [];
  page.on("request", (r) => asked.push(new URL(r.url()).pathname));
  // Timers and frames asked for by the Slate's code (its lazy chunk).
  await page.addInitScript(() => {
    const w = window as unknown as { __slateTimers: string[] };
    w.__slateTimers = [];
    const mine = () => /SlateWidget|[\\/]slate[\\/]|calendarkit/.test(new Error().stack ?? "");
    const w2 = window as unknown as { __slateStorage: number };
    w2.__slateStorage = 0;
    const add = window.addEventListener;
    window.addEventListener = function (this: Window, type: string, ...rest: unknown[]) {
      if (type === "storage" && mine()) w2.__slateStorage++;
      return (add as (...a: unknown[]) => void).call(this, type, ...rest);
    } as typeof window.addEventListener;
    for (const name of ["setTimeout", "setInterval", "requestAnimationFrame", "requestIdleCallback"] as const) {
      const own = (window as any)[name];
      if (!own) continue;
      (window as any)[name] = function (...args: unknown[]) {
        if (mine()) w.__slateTimers.push(name);
        return own.apply(this, args);
      };
    }
  });
  const night = nightWith(await nights(request), 5);
  await openWhiteboard(page, noonOn(night.date));
  await page.waitForTimeout(1000);
  const slateCode = () => asked.filter((p) => /SlateWidget|\/src\/slate\/(SlateWidget|calendarkit)|\/node_modules\/calendarkit\//.test(p));
  expect(slateCode()).toEqual([]);
  expect(asked.filter((p) => p.endsWith("/schedule.json"))).toEqual([]);

  asked.length = 0;
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => void (window as any).editor.selectNone());
    await insertSlate(page);
  }
  // A second page with one more.
  await page.evaluate(() => {
    const editor = (window as any).editor;
    editor.createPage({ name: "Two" });
    editor.setCurrentPage(editor.getPages().at(-1).id);
  });
  await insertSlate(page);
  expect(slateCode().length).toBeGreaterThan(0);
  expect(asked.filter((p) => p.endsWith("/calendar/data/schedule.json"))).toHaveLength(1);
  // Odds: one request for the night per page shown (3 widgets on page 1,
  // 1 on page 2: 2 requests, not 4), at most one 10-min refresh timer
  // running for it (only while the night isn't over).
  expect(asked.filter((p) => p.endsWith("/calendar/api/odds"))).toHaveLength(2);
  const timers = (await page.evaluate(() => (window as any).__slateTimers)) as string[];
  expect(timers.filter((t) => t === "setInterval").length).toBeLessThanOrEqual(1);
  expect(timers.filter((t) => t === "requestAnimationFrame" || t === "requestIdleCallback")).toEqual([]);

  // At rest: nothing asked of the network, no timer or frame from the Slate's code.
  await page.evaluate(() => void (window as any).editor.selectNone());
  await page.mouse.move(5, 500);
  await page.waitForTimeout(500);
  const n = asked.length;
  await page.evaluate(() => ((window as any).__slateTimers.length = 0));
  await page.waitForTimeout(3000);
  // (The backup worker is the save's, not the Slate's: its script is asked
  // for once, when the page's first backup runs.)
  expect(asked.slice(n).filter((p) => !/^\/assets\/worker-[^/]+\.js$/.test(p))).toEqual([]);
  expect(await page.evaluate(() => (window as any).__slateTimers)).toEqual([]);
  // One `storage` listener for the notes on the page, for all 4 widgets.
  expect(await page.evaluate(() => (window as any).__slateStorage)).toBe(1);
});

// ---- Edges round, item 0: the calendarkit pin moved to v1.40.1 (7c606c6) ----

test("Slate pin: the calendarkit the whiteboard draws with is the one /calendar serves (same version)", async ({ request }) => {
  const pinned = JSON.parse(await readFile("node_modules/calendarkit/package.json", "utf-8")).version as string;
  const served = (await (await request.get("/calendar/version.json")).json()) as { version: string; commit: string };
  // The live site serves calendarkit's main; locally scripts/local-e2e.mjs builds ../calendarkit.
  expect(served.version, `whiteboard pins calendarkit ${pinned}, /calendar serves ${served.version} (${served.commit})`).toBe(pinned);
});

test("Slate: tight cards (calendarkit round 14): a 68 px strip, short info, the season-series chip; teams stay plain text (no team links before Slate step 3)", async ({ page, request }) => {
  const night = nightWith(await nights(request), 5);
  await openWhiteboard(page, noonOn(night.date));
  const s = await insertSlate(page);
  const w = widgetOf(page, s.id);
  const card = w.locator(".ck-slate-card").first();
  const info = await card.locator(".ck-slate-info").evaluate((e) => ({ h: (e as HTMLElement).offsetHeight, strip: (e.querySelector(".ck-slate-strip") as HTMLElement | null)?.offsetWidth ?? 0 }));
  expect(info.strip).toBe(68);
  expect(info.h).toBeLessThanOrEqual(62); // a 78 px card less 2 × (8 px padding + 1 px border); the old cards were 117 px
  await expect(w.getByTestId("series-chip").first()).toBeVisible();
  await expect(w.locator("a, [data-team-link]")).toHaveCount(0);
});

test("Slate: odds (calendarkit's /calendar/api/odds) show on the cards; one request per night however many widgets; none on failure, nothing breaks", async ({ page, request }) => {
  const all = await nights(request);
  const night = nightWith(all, 5);
  const other = all.find((n) => n.date > night.date && n.ids.length > 0)!;
  const asked: string[] = [];
  let fail = false;
  await page.route("**/calendar/api/odds*", (r) => {
    const date = new URL(r.request().url()).searchParams.get("date")!;
    asked.push(date);
    if (fail) return r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "down" }) });
    const n = date === night.date ? night : other;
    const games = Object.fromEntries(n.keys.map((k, i) => [k, { away: 2 + i / 10, home: 1.5 + i / 100, provider: "Test" }]));
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ date, games }) });
  });
  await openWhiteboard(page, noonOn(night.date));
  const a = await insertSlate(page);
  await page.evaluate(() => void (window as any).editor.selectNone());
  const b = await insertSlate(page);
  // A third on another night (set up: changing a widget's date is step 3).
  await page.evaluate(() => void (window as any).editor.selectNone());
  const c = await insertSlate(page);
  await page.evaluate(({ id, date }) => void (window as any).editor.updateShape({ id, type: "calendarkit-slate", props: { date } }), { id: c.id, date: other.date });
  for (const id of [a.id, b.id, c.id]) await expect(widgetOf(page, id).getByTestId("slate-odds").first()).toHaveText("2.00");
  await expect(widgetOf(page, a.id).getByTestId("slate-odds").nth(1)).toHaveText("1.50");
  await page.waitForTimeout(500);
  expect(asked.filter((d) => d === night.date)).toHaveLength(1);
  expect(asked.filter((d) => d === other.date)).toHaveLength(1);

  // The odds service down: after a reload the cards show, without odds.
  fail = true;
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(widgetOf(page, a.id)).toHaveAttribute("data-state", "ready");
  await expect(widgetOf(page, a.id).locator(".ck-slate-card")).toHaveCount(night.ids.length);
  await expect.poll(() => asked.length).toBeGreaterThan(2);
  await page.waitForTimeout(300);
  expect(await widgetOf(page, a.id).getByTestId("slate-odds").allTextContents()).toEqual(Array(night.ids.length * 2).fill(""));
});

test("Slate: notes stored before the pin move (ck:notes:v1) show in the widget and survive calendarkit v1.40 untouched; a note typed in /calendar keeps the same format", async ({ page, context, request }) => {
  const night = nightWith(await nights(request), 5);
  const before = notesFor(night.ids) as Record<string, { pre: string; live: string; post: string; shown: string }>;
  const raw = JSON.stringify(before);
  await page.addInitScript((n) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("ck:notes:v1", n);
      sessionStorage.setItem("seeded", "1");
    }
  }, raw);
  await openWhiteboard(page, noonOn(night.date));
  const s = await insertSlate(page);
  const note = (i: number) => widgetOf(page, s.id).locator(`[data-game-id="${night.ids[i]}"] [data-testid="note"]`);
  await expect(note(0).getByTestId("note-text")).toHaveText(before[night.ids[0]!]!.pre);
  await expect(note(1).getByTestId("note-slot")).toHaveText("LIVE");
  await expect(note(2).getByTestId("note-slot")).toHaveText("POST");

  const ck = await context.newPage();
  await ck.addInitScript((d) => ((window as unknown as { __ckOpenDate?: string }).__ckOpenDate = d), night.date);
  await ck.goto("/calendar/?view=league&layout=slate");
  await expect(ck.locator(`[data-testid="slate"] [data-game-id="${night.ids[0]}"] [data-testid="note-text"]`)).toHaveValue(before[night.ids[0]!]!.pre);
  // Opening calendarkit rewrote nothing.
  expect(await ck.evaluate(() => localStorage.getItem("ck:notes:v1"))).toBe(raw);
  const box4 = ck.locator(`[data-testid="slate"] [data-game-id="${night.ids[3]}"]`);
  await box4.getByTestId("note-text").fill("new one");
  await box4.getByTestId("note-text").blur();
  await expect(note(3).getByTestId("note-text")).toHaveText("new one");
  const after = JSON.parse((await ck.evaluate(() => localStorage.getItem("ck:notes:v1")))!);
  expect(after).toEqual({ ...before, [night.ids[3]!]: { pre: "new one", live: "", post: "", shown: "pre" } });
  await ck.close();
});
