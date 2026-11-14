import { writeFile } from "node:fs/promises";

import { expect, test, type APIRequestContext, type Page, type TestInfo } from "./test";

import { openBoardList, openMapList, seedBoard, seedMap } from "./helpers";

/**
 * Speed session Part 9 (owner, 2026-11-09 / 2026-11-14): a page exported to
 * PNG looks exactly like the page on screen. A page with a board, a map and
 * a Slate is exported as tldraw's own "Export as PNG" does it (editor.toImage,
 * every shape on the page), over the part of the page the window shows, at
 * 100% and one image pixel per screen pixel, so each widget can be laid
 * over a screenshot of itself and compared pixel by pixel, with a small
 * tolerance for text antialiasing. Fresh, empty browser profile; the board
 * is Boardkit's first-visit board, the map a new one made in Linkkit.
 */

const TZ = "America/Sao_Paulo";
test.use({ timezoneId: TZ, viewport: { width: 1920, height: 1080 } });

type Shape = { id: string; type: string; x: number; y: number; w: number; h: number; scale: number };

const shapes = (page: Page) =>
  page.evaluate(() =>
    (window as any).editor.getCurrentPageShapes().map((s: any) => ({ id: s.id, type: s.type, x: s.x, y: s.y, w: s.props.w, h: s.props.h, scale: s.props.scale })),
  ) as Promise<Shape[]>;

async function placed(page: Page, type: string, ready: (s: Shape) => boolean = (s) => s.scale > 0): Promise<Shape> {
  let made: Shape | undefined;
  await expect
    .poll(async () => {
      made = (await shapes(page)).find((s) => s.type === type);
      return !!made && ready(made);
    })
    .toBe(true);
  return made!;
}

/** A night two weeks or more into the season with 5+ games (a full Slate). */
async function fullNight(request: APIRequestContext): Promise<string> {
  const raw = (await (await request.get("/calendar/data/schedule.json")).json()) as {
    leagueSchedule: { gameDates: { games: { gameId: string; gameDateEst: string }[] }[] };
  };
  const by: Record<string, number> = {};
  for (const d of raw.leagueSchedule.gameDates) for (const g of d.games) if (/^00[2456]/.test(g.gameId)) by[g.gameDateEst.slice(0, 10)] = (by[g.gameDateEst.slice(0, 10)] ?? 0) + 1;
  const dates = Object.keys(by).sort();
  return dates.find((d, i) => i >= 14 && by[d]! >= 5)!;
}

/**
 * How far an export of `box` (page coordinates, at 100%) is from the
 * screenshot of the same box: the share of pixels whose colour differs by
 * more than `near` on any channel. Compared in the page (a canvas), so no
 * image library is needed. The export is laid over the screen's own
 * background colour where it is transparent.
 */
async function difference(page: Page, shot: Buffer, exported: string, at: { x: number; y: number; w: number; h: number }, testInfo: TestInfo, name: string) {
  const result = await page.evaluate(
    async ({ shot, exported, at }) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const [a, b] = await Promise.all([load(`data:image/png;base64,${shot}`), load(exported)]);
      const w = Math.round(at.w);
      const h = Math.round(at.h);
      const draw = (img: HTMLImageElement, x: number, y: number, bg?: string) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const g = c.getContext("2d")!;
        if (bg) {
          g.fillStyle = bg;
          g.fillRect(0, 0, w, h);
        }
        g.drawImage(img, x, y, w, h, 0, 0, w, h);
        return c;
      };
      const screen = draw(a, 0, 0);
      const sd = screen.getContext("2d")!.getImageData(0, 0, w, h).data;
      // The page's own colour behind the widgets, as the screen shows it.
      const sheet = getComputedStyle(document.querySelector('[data-testid="sheet"]') ?? document.body).backgroundColor;
      const out = draw(b, at.x, at.y, sheet);
      const od = out.getContext("2d")!.getImageData(0, 0, w, h).data;
      let off = 0;
      const diff = document.createElement("canvas");
      diff.width = w;
      diff.height = h;
      const dg = diff.getContext("2d")!;
      const dd = dg.createImageData(w, h);
      for (let i = 0; i < sd.length; i += 4) {
        const d = Math.max(Math.abs(sd[i]! - od[i]!), Math.abs(sd[i + 1]! - od[i + 1]!), Math.abs(sd[i + 2]! - od[i + 2]!));
        const bad = d > 64;
        if (bad) off++;
        dd.data[i] = bad ? 255 : sd[i]! / 3;
        dd.data[i + 1] = bad ? 0 : sd[i + 1]! / 3;
        dd.data[i + 2] = bad ? 0 : sd[i + 2]! / 3;
        dd.data[i + 3] = 255;
      }
      dg.putImageData(dd, 0, 0);
      return { share: off / (w * h), exported: out.toDataURL("image/png"), diff: diff.toDataURL("image/png") };
    },
    { shot: shot.toString("base64"), exported, at },
  );
  // What was compared, kept with the test's results (test-results/).
  await writeFile(testInfo.outputPath(`${name}-screen.png`), shot);
  await writeFile(testInfo.outputPath(`${name}-export.png`), Buffer.from(result.exported.split(",")[1]!, "base64"));
  await writeFile(testInfo.outputPath(`${name}-diff.png`), Buffer.from(result.diff.split(",")[1]!, "base64"));
  return result.share;
}

test("Part 9: a page exported to PNG shows its board, map and Slate exactly as the screen does", async ({ page, context, request }, testInfo) => {
  const boardId = await seedBoard(context);
  const mapId = await seedMap(context, "Export check");
  const date = await fullNight(request);
  await page.clock.install({ time: new Date(`${date}T15:00:00Z`) });
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();

  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  await placed(page, "boardkit-board");
  await openMapList(page);
  await page.getByTestId("map-picker").locator(`[data-map="${mapId}"]`).click();
  const map = await placed(page, "linkkit-map");
  await expect(page.locator(`[id="${map.id}"] [data-map-view][data-ready]`)).toBeVisible();
  await page.getByTestId("tools.slate").click();
  const slate = await placed(page, "calendarkit-slate");
  await expect(page.locator(`[id="${slate.id}"] .ck-slate-card`).first()).toBeVisible();

  // At 100%; the Slate made small enough to fit the window (set here: a
  // person can't size it exactly). Nothing selected, the pointer away.
  await page.evaluate((slate) => {
    const editor = (window as any).editor;
    const p = editor.getShape(slate).props;
    const k = Math.min(1, 850 / p.h, 1700 / p.w);
    editor.updateShape({ id: slate, type: "calendarkit-slate", props: { scale: p.scale * k, w: p.w * k, h: p.h * k } });
    editor.selectNone();
  }, slate.id);
  await page.mouse.move(1910, 1070);

  const shares: Record<string, number> = {};
  for (const type of ["boardkit-board", "linkkit-map", "calendarkit-slate"]) {
    // This widget in the window's free middle; the others there too but
    // hidden (opacity 0: neither the screen nor the export draws them).
    const s = (await shapes(page)).find((x) => x.type === type)!;
    const at = { x: 40, y: 120, w: Math.floor(s.w), h: Math.floor(s.h) };
    const origin = await page.evaluate(
      ({ id, at }) => {
        const editor = (window as any).editor;
        for (const o of editor.getCurrentPageShapes()) editor.updateShape({ id: o.id, type: o.type, x: at.x, y: at.y, opacity: o.id === id ? 1 : 0 });
        editor.setCamera({ x: 0, y: 0, z: 1 });
        return editor.pageToScreen({ x: at.x, y: at.y });
      },
      { id: s.id, at },
    );
    expect(origin.x + at.w, `${type} fits the window`).toBeLessThan(1920);
    expect(origin.y + at.h, `${type} fits the window`).toBeLessThan(1080);
    await page.waitForTimeout(600);
    const shot = await page.screenshot({ clip: { x: origin.x, y: origin.y, width: at.w, height: at.h }, animations: "disabled", caret: "hide" });
    // The page as tldraw's "Export as PNG" draws it (every shape on it),
    // over the widget's box, at 100%.
    const before = await shapes(page);
    const exported = await page.evaluate(async (at) => {
      const editor = (window as any).editor;
      const ids = [...editor.getCurrentPageShapeIds()];
      const Box = editor.getViewportPageBounds().constructor;
      const { blob } = await editor.toImage(ids, { format: "png", scale: 1, pixelRatio: 1, padding: 0, background: false, bounds: new Box(at.x, at.y, at.w, at.h) });
      return await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(blob);
      });
    }, at);
    // Exporting leaves every widget's place and size as they were.
    await page.waitForTimeout(300);
    expect(await shapes(page)).toEqual(before);
    shares[type] = await difference(page, shot, exported, { x: 0, y: 0, w: at.w, h: at.h }, testInfo, type);
  }
  console.log("export vs screen, share of pixels off:", JSON.stringify(shares));
  for (const [type, share] of Object.entries(shares)) expect(share, `${type}: share of pixels that differ`).toBeLessThan(0.02);
});
