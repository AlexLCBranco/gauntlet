import { readFile } from "node:fs/promises";

import { expect, test, type BrowserContext, type Page } from "./test";

import { box, seedBoard, seedMap } from "./helpers";

/**
 * GT-10: "Save board to file" keeps the current page with a frozen copy of
 * every widget's data; "Open board file…" opens it as a new page whose
 * widgets draw from that copy (never the live data), are edited there only,
 * show a "Frozen" badge, and "Go live" (one undo step) shows the live data
 * again (src/archive/). Fresh profile; the schedule is what /calendar serves
 * (locally calendarkit's own build), mocked where a test says so.
 */

test.use({ timezoneId: "America/Sao_Paulo", viewport: { width: 1600, height: 1000 } });

type RawGame = { gameId: string; gameStatus: number; gameStatusText: string; gameDateEst: string; awayTeam: { score: number }; homeTeam: { score: number } };
type Raw = { meta: { time: string }; leagueSchedule: { gameDates: { games: RawGame[] }[] } };
type Rec = { name?: string; board: { lists: Record<string, { title: string }>; cards: Record<string, { title: string }>; listOrder: string[]; cardOrder: Record<string, string[]> } };

const boardRecord = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem(`boardkit:board:${id}`)!), id) as Promise<Rec>;
const boardName = (page: Page, id: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem("boardkit:registry")!) as { boards: { id: string; name: string }[] }).boards.find((b) => b.id === id)?.name, id);

/** A night not played yet in the served snapshot, with its games. */
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

const shapes = (page: Page) =>
  page.evaluate(() =>
    ((window as any).editor.getCurrentPageShapes() as any[]).map((s) => ({ id: s.id as string, type: s.type as string, props: s.props, frozen: (s.meta?.frozen ?? undefined) as { kind: string; liveId?: string; bundle?: string } | undefined })),
  );
const one = async (page: Page, type: string) => (await shapes(page)).find((s) => s.type === type)!;

/** A page with a board, a map, a Slate, a web embed and a text, every widget drawn. */
async function dayBoard(page: Page, context: BrowserContext) {
  const boardId = await seedBoard(context);
  const mapId = await seedMap(context, "Archive map");
  await open(page);
  const { date, games, raw } = await upcoming(page);
  await page.evaluate(
    ({ boardId, mapId, date }) => {
      const e = (window as any).editor;
      e.createShapes([
        { id: "shape:b", type: "boardkit-board", x: 100, y: 100, props: { boardId } },
        { id: "shape:m", type: "linkkit-map", x: 100, y: 700, props: { mapId } },
        { id: "shape:s", type: "calendarkit-slate", x: 900, y: 100, props: { date } },
        { id: "shape:e", type: "web-embed", x: 900, y: 700, props: { url: "https://example.com/" } },
        { id: "shape:t", type: "text", x: 100, y: 40, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Day 1" }] }] } } },
      ]);
    },
    { boardId, mapId, date },
  );
  await expect(page.locator('[id="shape:b"] [data-boardkit-board]')).toBeVisible();
  await expect(page.locator('[id="shape:s"] [data-testid="slate-widget"]')).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
  await expect(page.locator('[id="shape:m"] .react-flow, [id="shape:m"] [data-testid]').first()).toBeVisible();
  return { boardId, mapId, date, games, raw };
}

/** Main menu → Save board to file: the file, read back. */
async function saveToFile(page: Page) {
  await page.getByTestId("main-menu.button").click();
  const download = page.waitForEvent("download");
  await page.getByTestId("main-menu.save-board-file").click();
  const d = await download;
  const path = await d.path();
  return { name: d.suggestedFilename(), path, json: JSON.parse(await readFile(path, "utf8")) as any };
}

/** Main menu → Open board file…: the new page. */
async function openFile(page: Page, path: string) {
  const before = await page.evaluate(() => (window as any).editor.getPages().length);
  await page.getByTestId("main-menu.button").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("main-menu.open-board-file").click();
  await (await chooser).setFiles(path);
  await expect.poll(() => page.evaluate(() => (window as any).editor.getPages().length)).toBe(before + 1);
  return page.evaluate(() => (window as any).editor.getCurrentPage() as { id: string; name: string });
}

test("save → open: the page comes back as a new page with every widget, each drawn from its frozen copy; the badge is on frozen widgets only", async ({ page, context }) => {
  const day = await dayBoard(page, context);
  const liveBoard = await boardRecord(page, day.boardId);
  const file = await saveToFile(page);
  expect(file.name).toMatch(/^gauntlet-board-Page 1-\d{4}-\d{2}-\d{2}\.json$/);
  expect(file.json.format).toBe("gauntlet-archive");
  // the frozen data is in the file
  expect(file.json.boards[day.boardId].board).toEqual(liveBoard.board);
  expect(file.json.maps[day.mapId].name).toBe("Archive map");
  expect(file.json.slates.live.schedule.meta.time).toBe(day.raw.meta.time);
  expect(file.json.content.shapes).toHaveLength(5);

  const pg = await openFile(page, file.path);
  expect(pg.name).toBe("Page 1 (archive)");
  const got = await shapes(page);
  expect(got.map((s) => s.type).sort()).toEqual(["boardkit-board", "calendarkit-slate", "linkkit-map", "text", "web-embed"]);
  // the board and map are copies, named as archives; the live ones untouched
  const b = got.find((s) => s.type === "boardkit-board")!;
  const m = got.find((s) => s.type === "linkkit-map")!;
  expect(b.props.boardId).not.toBe(day.boardId);
  expect(b.frozen).toMatchObject({ kind: "board", liveId: day.boardId });
  expect(await boardName(page, b.props.boardId)).toMatch(/ \(archive \d+\/\d+\)$/);
  expect((await boardRecord(page, b.props.boardId)).board.cardOrder).toEqual(liveBoard.board.cardOrder);
  expect(m.props.mapId).not.toBe(day.mapId);
  expect(m.frozen).toMatchObject({ kind: "map", liveId: day.mapId });
  // drawn: the board's lists, the Slate's games
  await expect(page.locator(`[id="${b.id}"] section[data-list-id]`)).toHaveCount(liveBoard.board.listOrder.length);
  const slate = got.find((s) => s.type === "calendarkit-slate")!;
  await expect(page.locator(`[id="${slate.id}"] [data-testid="slate-widget"]`)).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
  expect(await page.locator(`[id="${slate.id}"] [data-game-id]`).count()).toBe(day.games.length);
  // its hover popups still work, from the frozen data
  // (pointed at where it is now: a widget just drawn may still be settling its size)
  const recEl = page.locator(`[id="${slate.id}"] [data-side="away"] .ck-slate-rec[data-tip]`).first();
  await expect(async () => {
    await page.mouse.move(5, 500);
    const rec = await box(recEl);
    await page.mouse.move(rec.x + rec.width / 2, rec.y + rec.height / 2, { steps: 3 });
    await expect(page.getByTestId("tooltip")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await page.mouse.move(5, 500, { steps: 2 });
  // badges: board, map, Slate; not the text or the web embed
  await expect(page.getByTestId("frozen-badge")).toHaveCount(3);
  expect((await page.getByTestId("frozen-badge").evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")))).sort()).toEqual(["board", "map", "slate"]);
  // and none on the original page
  await page.evaluate(() => void (window as any).editor.setCurrentPage((window as any).editor.getPages()[0].id));
  await expect(page.locator('[id="shape:b"] [data-boardkit-board]')).toBeVisible();
  await expect(page.getByTestId("frozen-badge")).toHaveCount(0);
});

test("a frozen Slate shows the games as saved after the live schedule changes; a live Slate shows the change", async ({ page, context }) => {
  // No odds answer at all, saved or live: only the snapshot brings scores here (on the live site ESPN may already
  // have the finals of a night the snapshot still lists as upcoming, and the file rightly keeps them).
  await page.route("**/calendar/api/odds**", (r) => r.fulfill({ status: 404, body: "" }));
  const day = await dayBoard(page, context);
  const file = await saveToFile(page);
  // the next morning: the first game of that night was played
  const g = day.games[0]!;
  const next = structuredClone(day.raw);
  next.meta.time = "2099-01-01T11:00:00Z";
  for (const d of next.leagueSchedule.gameDates) for (const x of d.games) if (x.gameId === g.gameId) Object.assign(x, { gameStatus: 3, gameStatusText: "Final", awayTeam: { ...x.awayTeam, score: 101 }, homeTeam: { ...x.homeTeam, score: 99 } });
  await page.route("**/calendar/data/schedule.json", (r) => r.fulfill({ json: next }));
  await page.route("**/calendar/api/odds**", (r) => r.fulfill({ status: 404, body: "" }));
  // a fresh page load: the live schedule is the changed one
  await open(page);
  await openFile(page, file.path);
  const slate = await one(page, "calendarkit-slate");
  const frozenCard = page.locator(`[id="${slate.id}"] [data-game-id="${g.gameId}"]`);
  await expect(frozenCard).toBeVisible({ timeout: 20_000 });
  expect(await frozenCard.locator(".ck-slate-score").allTextContents()).toEqual(["", ""]);
  // a live Slate of the same night on the same page: the played game
  await page.evaluate((date) => void (window as any).editor.createShape({ id: "shape:liveslate", type: "calendarkit-slate", x: 900, y: 1400, props: { date } }), day.date);
  const liveCard = page.locator(`[id="shape:liveslate"] [data-game-id="${g.gameId}"]`);
  await expect.poll(() => liveCard.locator(".ck-slate-score").allTextContents(), { timeout: 20_000 }).toEqual(["101", "99"]);
  expect(await frozenCard.locator(".ck-slate-score").allTextContents()).toEqual(["", ""]);
});

test("editing a frozen board changes only its copy; Go live shows the live board, Ctrl+Z puts the frozen copy back", async ({ page, context }) => {
  const day = await dayBoard(page, context);
  const liveBefore = await boardRecord(page, day.boardId);
  const file = await saveToFile(page);
  await openFile(page, file.path);
  const b = await one(page, "boardkit-board");
  const copyId = b.props.boardId as string;

  // add a card to the frozen board's first list, as the owner would
  const list = page.locator(`[id="${b.id}"] section[data-list-id]`).first();
  const listId = (await list.getAttribute("data-list-id"))!;
  const r = await box(list);
  await page.mouse.move(r.x + r.width / 2, r.y + 20, { steps: 3 });
  const plus = list.locator('[data-add="card"]');
  await expect.poll(() => plus.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
  const p = await box(plus);
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 3 });
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByRole("textbox", { name: "Add a card" })).toBeFocused();
  await page.keyboard.type("Archive-only card");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await boardRecord(page, copyId)).board.cardOrder[listId]!.length).toBe(liveBefore.board.cardOrder[listId]!.length + 1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // the live board is exactly as it was
  expect((await boardRecord(page, day.boardId)).board).toEqual(liveBefore.board);

  // Go live: the live board, no badge on it; one undo: the frozen copy again
  await page.evaluate(() => void (window as any).editor.selectNone());
  const badge = page.locator(`[id="${b.id}"] [data-testid="frozen-badge"]`);
  await badge.getByTestId("go-live").click();
  await expect.poll(async () => (await one(page, "boardkit-board")).props.boardId).toBe(day.boardId);
  expect((await one(page, "boardkit-board")).frozen).toBeUndefined();
  await expect(badge).toHaveCount(0);
  await expect(page.locator(`[id="${b.id}"] article[data-card-id]`, { hasText: "Archive-only card" })).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await one(page, "boardkit-board")).props.boardId).toBe(copyId);
  await expect(badge).toHaveCount(1);
  await expect(page.locator(`[id="${b.id}"] article[data-card-id]`, { hasText: "Archive-only card" })).toHaveCount(1);
});

test("a frozen Slate goes live too (one undo step), and a file that isn't a board file says so", async ({ page, context }) => {
  const day = await dayBoard(page, context);
  const file = await saveToFile(page);
  await openFile(page, file.path);
  const slate = await one(page, "calendarkit-slate");
  expect(slate.frozen?.kind).toBe("slate");
  await page.locator(`[id="${slate.id}"] [data-testid="go-live"]`).click();
  await expect.poll(async () => (await one(page, "calendarkit-slate")).frozen).toBeUndefined();
  await expect(page.locator(`[id="${slate.id}"] [data-testid="slate-widget"]`)).toHaveAttribute("data-state", "ready");
  expect((await one(page, "calendarkit-slate")).props.date).toBe(day.date);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await one(page, "calendarkit-slate")).frozen?.kind).toBe("slate");

  // not a board file: nothing is added, and the reason is shown
  const pages = await page.evaluate(() => (window as any).editor.getPages().length);
  await page.getByTestId("main-menu.button").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("main-menu.open-board-file").click();
  await (await chooser).setFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByTestId("board-file-notice")).toContainText("Couldn't open that file.");
  await expect(page.getByTestId("board-file-notice")).toContainText("This is not a board file saved by the gauntlet.");
  await expect(page.getByTestId("board-file-notice")).toHaveAttribute("data-error", "");
  expect(await page.evaluate(() => (window as any).editor.getPages().length)).toBe(pages);
});
