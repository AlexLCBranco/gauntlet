import { existsSync, readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/**
 * The owner's REAL data, restored into a fresh browser profile on a local
 * build: every whiteboard drawing, Boardkit board and Linkkit map loads,
 * and nothing is moved, resized or lost. The backup file (made on the live
 * /backup/ page) is read from the owner's Downloads folder at run time; it
 * is never copied into the repo. No file there: the test is skipped.
 *
 *   REAL_BACKUP=<path to a backup .json> overrides the path.
 *
 * Only for a local run (`node scripts/local-e2e.mjs gauntlet e2e/realdata.e2e.ts`):
 * it is skipped against any site that isn't localhost, so the owner's data
 * never goes to a preview or the live site.
 */

const FILE = process.env.REAL_BACKUP ?? "C:/Users/alexc/Downloads/gauntlet-backup-2026-10-19-1606.json";
const SITE = process.env.BRIDGE_SITE ?? "";
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SITE);

test.skip(!existsSync(FILE), `no backup file at ${FILE}`);
test.skip(!local, "real data is only restored on a local build");

type Backup = {
  localStorage: Record<string, string>;
  indexedDB: { name: string; version: number; stores: { name: string; keyPath: string | string[] | null; autoIncrement: boolean; indexes: { name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }[]; records: { key: unknown; value: unknown }[] }[] }[];
};
const backup = () => JSON.parse(readFileSync(FILE, "utf-8")) as Backup;

type Shape = { id: string; typeName: string; type: string; parentId: string; x: number; y: number; rotation: number; props: Record<string, unknown> };
type BoardRec = { board: { lists: Record<string, unknown>; cards: Record<string, unknown>; listOrder: string[]; cardOrder: Record<string, string[]>; trash: unknown[]; trashedLists?: unknown[] } };
type MapRec = { map: { nodes: Record<string, unknown>; links: Record<string, unknown>; hideCut?: boolean; collapsed?: unknown[] } };

/** The whiteboard's records in the file (tldraw's IndexedDB). */
function fileShapes(b: Backup) {
  const db = b.indexedDB.find((d) => d.name.startsWith("TLDRAW_DOCUMENT"))!;
  const values = db.stores.find((s) => s.name === "records")!.records.map((r) => r.value as Shape);
  return { pages: values.filter((v) => v.typeName === "page"), shapes: values.filter((v) => v.typeName === "shape") };
}

/** Writes the backup into this browser, as the /backup/ page's restore
    does: every localStorage key, every IndexedDB database with its stores
    and records (pictures decoded back into Blobs). On a blank page of the
    site, before any app has run. */
async function restore(page: Page, b: Backup) {
  await page.goto("/__blank-for-restore");
  await page.evaluate(async (b: Backup) => {
    const TAG = "$gauntletBackup";
    const bytes = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const decode = (v: unknown): unknown => {
      if (v === null || typeof v !== "object") return v;
      if (Array.isArray(v)) return v.map(decode);
      const r = v as Record<string, unknown>;
      const t = r[TAG] as Record<string, string> | undefined;
      if (t && Object.keys(r).length === 1) {
        if (t.kind === "undefined") return undefined;
        if (t.kind === "number") return Number(t.value);
        if (t.kind === "date") return new Date(t.value);
        if (t.kind === "blob") return t.name !== undefined ? new File([bytes(t.data)], t.name, { type: t.type }) : new Blob([bytes(t.data)], { type: t.type });
        if (t.kind === "bytes") return bytes(t.data).buffer;
      }
      return Object.fromEntries(Object.entries(r).map(([k, x]) => [k, decode(x)]));
    };
    localStorage.clear();
    for (const [k, v] of Object.entries(b.localStorage)) localStorage.setItem(k, v);
    for (const dump of b.indexedDB) {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dump.name, dump.version);
        req.onupgradeneeded = () => {
          for (const s of dump.stores) {
            const store = req.result.createObjectStore(s.name, { keyPath: s.keyPath ?? undefined, autoIncrement: s.autoIncrement });
            for (const i of s.indexes) store.createIndex(i.name, i.keyPath, { unique: i.unique, multiEntry: i.multiEntry });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const s of dump.stores) {
        if (s.records.length === 0) continue;
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(s.name, "readwrite");
          const store = tx.objectStore(s.name);
          for (const r of s.records) {
            if (s.keyPath === null) store.put(decode(r.value), decode(r.key) as IDBValidKey);
            else store.put(decode(r.value));
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
      db.close();
    }
  }, b);
}

const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) =>
  page.evaluate(([src, a]) => new Function("e", "a", `return (${src})(e, a)`)((window as any).editor, a), [fn.toString(), arg] as const) as Promise<T>;

const shapesNow = (page: Page) =>
  ed(page, (e) =>
    e.getPages().flatMap((p: any) =>
      [...e.getPageShapeIds(p.id)].map((id: string) => {
        const s = e.getShape(id);
        return { id, parentId: s.parentId, x: s.x, y: s.y, rotation: s.rotation, props: s.props };
      }),
    ),
  ) as Promise<Pick<Shape, "id" | "parentId" | "x" | "y" | "rotation" | "props">[]>;

const comparable = (s: Pick<Shape, "id" | "parentId" | "x" | "y" | "rotation" | "props">) => ({ id: s.id, parentId: s.parentId, x: s.x, y: s.y, rotation: s.rotation, props: s.props });

async function openWhiteboard(page: Page) {
  await page.goto("/whiteboard/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** No bars, the view inside the page, the page covering every shape. */
async function expectPageRules(page: Page) {
  const size = page.viewportSize()!;
  const sheet = (await page.getByTestId("sheet").boundingBox())!;
  expect(sheet.x).toBeLessThanOrEqual(0.5);
  expect(sheet.y).toBeLessThanOrEqual(0.5);
  expect(sheet.x + sheet.width).toBeGreaterThanOrEqual(size.width - 0.5);
  expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(size.height - 0.5);
  const r = await ed(page, (e) => {
    const p = e.getCameraOptions().constraints.bounds;
    const v = e.getViewportPageBounds();
    const out = e
      .getCurrentPageShapes()
      .map((s: any) => e.getShapePageBounds(s.id))
      .filter((b: any) => b.x < p.x - 0.01 || b.y < p.y - 0.01 || b.maxX > p.x + p.w + 0.01 || b.maxY > p.y + p.h + 0.01)
      .map((b: any) => JSON.stringify({ shape: [b.x, b.y, b.w, b.h], page: p }));
    return { inView: v.x >= p.x - 0.5 && v.y >= p.y - 0.5 && v.maxX <= p.x + p.w + 0.5 && v.maxY <= p.y + p.h + 0.5, out };
  });
  expect(r).toEqual({ inView: true, out: [] });
}

const SIZES = [
  { width: 1915, height: 910 },
  { width: 957, height: 910 },
  { width: 1366, height: 768 },
];

test("real data: every whiteboard drawing loads, nothing moved, resized or lost, pictures show, pages behave in every window size", async ({ page }) => {
  const b = backup();
  const { pages, shapes } = fileShapes(b);
  await restore(page, b);
  const expected = shapes.map(comparable).sort((a, c) => a.id.localeCompare(c.id));
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await openWhiteboard(page);
    await page.waitForTimeout(800);
    expect(await ed(page, (e) => e.getPages().length)).toBe(pages.length);
    expect((await shapesNow(page)).map(comparable).sort((a, c) => a.id.localeCompare(c.id))).toEqual(expected);
    await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
    for (const p of pages) {
      await ed(page, (e, id: string) => void e.setCurrentPage(id), p.id);
      await page.waitForTimeout(200);
      await expectPageRules(page);
      // Every picture on the page shows (its file was restored and loads).
      const pictures = shapes.filter((s) => s.parentId === p.id && s.type === "image").length;
      if (pictures > 0) {
        // Pan across the page so every picture has been on screen.
        await page.mouse.move(size.width / 2, size.height / 2);
        for (let i = 0; i < 20; i++) await page.mouse.wheel(300, 300);
        await page.waitForTimeout(300);
        await expectPageRules(page);
        for (let i = 0; i < 20; i++) await page.mouse.wheel(-300, -300);
        await expect
          .poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".tl-image, .tl-image-container img, [data-shape-type='image'] img")].filter((i) => i.complete && i.naturalWidth > 0).length), { timeout: 10_000 })
          .toBeGreaterThan(0);
        const broken = await ed(page, (e) => e.getCurrentPageShapes().filter((s: any) => s.type === "image" && !e.getAsset(s.props.assetId)?.props.src).length);
        expect(broken).toBe(0);
      }
    }
  }
  // The page with the most on it, for the rest.
  const busiest = [...pages].sort((a, c) => shapes.filter((s) => s.parentId === c.id).length - shapes.filter((s) => s.parentId === a.id).length)[0];
  // Panning reaches the page's far corner and stops there, in the half window.
  await page.setViewportSize(SIZES[1]);
  await openWhiteboard(page);
  await ed(page, (e, id: string) => void e.setCurrentPage(id), busiest.id);
  await page.mouse.move(400, 400);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(400, 400);
  await page.waitForTimeout(200);
  const corner = await ed(page, (e) => {
    const p = e.getCameraOptions().constraints.bounds;
    const v = e.getViewportPageBounds();
    return { dx: p.x + p.w - v.maxX, dy: p.y + p.h - v.maxY };
  });
  expect(Math.abs(corner.dx)).toBeLessThan(0.5);
  expect(Math.abs(corner.dy)).toBeLessThan(0.5);

  // The edge wall on a real shape: dragged far past the right edge it stays
  // on the page every step of the way; Ctrl+Z puts it back.
  const far = await ed(page, (e) => {
    const s = e.getCurrentPageShapes().filter((s: any) => s.type === "geo" || s.type === "image").sort((a: any, b: any) => e.getShapePageBounds(b.id).maxX - e.getShapePageBounds(a.id).maxX)[0];
    e.select(s.id);
    const b = e.getShapePageBounds(s.id);
    const c = e.pageToScreen({ x: b.midX, y: b.midY });
    return { id: s.id as string, x: c.x, y: c.y };
  });
  const before = (await shapesNow(page)).find((s) => s.id === far.id)!;
  await page.mouse.move(far.x, far.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(Math.min(far.x + i * 60, SIZES[1].width - 2), far.y);
    const ok = await ed(page, (e, id: string) => {
      const p = e.getCameraOptions().constraints.bounds;
      const b = e.getShapePageBounds(id);
      return b.x >= p.x - 0.01 && b.maxX <= p.x + p.w + 0.01;
    }, far.id);
    expect(ok).toBe(true);
  }
  await page.mouse.up();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await shapesNow(page)).find((s) => s.id === far.id)).toEqual(before);
});

test("real data: every Boardkit board loads in Boardkit and as a whiteboard widget, every list and card there; nothing changed", async ({ page }) => {
  const b = backup();
  await restore(page, b);
  const registry = JSON.parse(b.localStorage["boardkit:registry"]) as { boards: { id: string; name: string }[] };
  expect(registry.boards.length).toBeGreaterThan(0);
  const visible = (id: string) => {
    const r = (JSON.parse(b.localStorage[`boardkit:board:${id}`]) as BoardRec).board;
    return { lists: r.listOrder.length, cards: r.listOrder.reduce((n, l) => n + (r.cardOrder[l] ?? []).length, 0) };
  };
  // Cards shown, plus the cards in collapsed lists (their strip says how
  // many: "tools wishlist, 1 card, collapsed"; collapsing is kept per
  // browser, apart from the board).
  const counts = (scope: string) =>
    page.evaluate((scope) => {
      const root = document.querySelector(scope) ?? document;
      const folded = [...root.querySelectorAll("[aria-label$=', collapsed']")]
        .map((el) => /, (\d+) cards?, collapsed$/.exec(el.getAttribute("aria-label")!))
        .reduce((n, m) => n + (m ? Number(m[1]) : 0), 0);
      return { lists: root.querySelectorAll("section[data-list-id]").length, cards: root.querySelectorAll("article[data-card-id]").length + folded };
    }, scope);

  // In Boardkit itself (its embed view: one board per page).
  for (const { id, name } of registry.boards) {
    await page.goto(`/boardkit/?embed=1&id=${encodeURIComponent(id)}`);
    await expect(page.locator("section[data-list-id]").first(), `board ${name}`).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => counts("body"), { message: `board ${name}` }).toEqual(visible(id));
  }

  // On the whiteboard: each board as a widget, on a page of its own.
  await page.setViewportSize(SIZES[0]);
  await openWhiteboard(page);
  for (const { id, name } of registry.boards) {
    await ed(page, (e, boardId: string) => {
      const pageId = `page:real-${boardId}`;
      e.createPage({ id: pageId, name: `real ${boardId}` });
      e.setCurrentPage(pageId);
      e.createShapes([{ id: `shape:real-${boardId}`, type: "boardkit-board", x: 40, y: 40, props: { boardId } }]);
    }, id);
    const scope = `.tl-html-container [data-boardkit-board]`;
    await expect(page.locator(scope).first(), `widget ${name}`).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => counts(scope), { message: `widget ${name}` }).toEqual(visible(id));
    // (A new board sizes itself from the middle, then settles inside.)
    await expect(() => expectPageRules(page)).toPass({ timeout: 5_000 });
  }

  // Nothing changed in any board's record (lists, cards, order, trash), and
  // the board pictures are still there.
  const after = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("boardkit:board:")).map((k) => [k, localStorage.getItem(k)!])));
  for (const k of Object.keys(b.localStorage).filter((k) => k.startsWith("boardkit:board:"))) {
    expect(after[k], k).toBeDefined();
    expect((JSON.parse(after[k]) as BoardRec).board, k).toEqual((JSON.parse(b.localStorage[k]) as BoardRec).board);
  }
  const pictures = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("boardkit");
        req.onsuccess = () => {
          const tx = req.result.transaction("kv", "readonly");
          const all = tx.objectStore("kv").getAllKeys();
          all.onsuccess = () => resolve((all.result as string[]).filter((k) => String(k).startsWith("boardImage:")).length);
        };
        req.onerror = () => resolve(-1);
      }),
  );
  const filePictures = b.indexedDB.find((d) => d.name === "boardkit")!.stores[0].records.filter((r) => String(r.key).startsWith("boardImage:")).length;
  expect(pictures).toBe(filePictures);
});

// Linkkit itself (standalone, the same on the live site; phase 2 doesn't
// change Linkkit or put maps on the whiteboard yet) moves boxes when a map
// is opened, and saves that: a bracket map is laid out again on every open
// (its `refitBracket`: box positions and page size follow the window),
// and in a window smaller than the map's page a tree map's box can be
// nudged (seen at 1366x768). Reported to the owner (HANDOFF.md). So this
// checks nothing is LOST (every box, name, arrow, player, setting), and that
// no position changes at all in a 1920 window except a bracket's layout.
const LAYOUT = new Set(["page"]);
const withoutLayout = (m: MapRec["map"] & { kind?: string }, all: boolean) =>
  !all && m.kind !== "bracket"
    ? m
    : { ...Object.fromEntries(Object.entries(m).filter(([k]) => !LAYOUT.has(k))), nodes: Object.fromEntries(Object.entries(m.nodes).map(([k, n]) => [k, { ...(n as object), x: 0, y: 0 }])) };

for (const [size, strict] of [[{ width: 1920, height: 1080 }, true], [{ width: 1366, height: 768 }, false]] as const)
test(`real data: every Linkkit map loads with all its boxes at ${size.width}x${size.height}; nothing lost`, async ({ page }) => {
  const b = backup();
  await page.setViewportSize(size);
  await restore(page, b);
  const registry = JSON.parse(b.localStorage["linkkit:registry"]) as { maps: { id: string; name: string }[] };
  expect(registry.maps.length).toBeGreaterThan(0);
  for (const { id, name } of registry.maps) {
    const m = (JSON.parse(b.localStorage[`linkkit:map:${id}`]) as MapRec).map;
    await page.goto(`/linkkit/?embed=1&id=${encodeURIComponent(id)}`);
    const nodes = Object.keys(m.nodes).length;
    if (nodes === 0) {
      // An empty map: it opens (its start hint shows), with no boxes.
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1_000);
      expect(await page.locator("[data-box-id]").count(), `map ${name}`).toBe(0);
      continue;
    }
    await expect(page.locator("[data-box-id]").first(), `map ${name}`).toBeVisible({ timeout: 15_000 });
    const shown = () => page.locator("[data-box-id]").count();
    if (m.hideCut || (m.collapsed?.length ?? 0) > 0) await expect.poll(shown, { message: `map ${name}` }).toBeGreaterThan(0);
    else await expect.poll(shown, { message: `map ${name}` }).toBe(nodes);
  }
  const after = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("linkkit:map:")).map((k) => [k, localStorage.getItem(k)!])));
  for (const k of Object.keys(b.localStorage).filter((k) => k.startsWith("linkkit:map:"))) {
    expect(after[k], k).toBeDefined();
    // Settings Linkkit fills in with their defaults when it saves a map
    // written by an older Linkkit (arrow and label style) aren't a change.
    const was = { arrowStyle: "straight", labelStyle: "linkkit", ...(JSON.parse(b.localStorage[k]) as MapRec).map };
    const now = { arrowStyle: "straight", labelStyle: "linkkit", ...(JSON.parse(after[k]) as MapRec).map };
    // A map linked to a Boardkit board takes its boxes' names from the
    // board's lists and cards when it opens (Linkkit's bridge): a name may
    // change, but only to a title on that board.
    const linked = (was as { linkedBoard?: string }).linkedBoard;
    if (linked) {
      const board = (JSON.parse(b.localStorage[`boardkit:board:${linked}`]) as BoardRec).board;
      const titles = new Set([...Object.values(board.lists), ...Object.values(board.cards)].map((x) => (x as { title: string }).title));
      for (const [id, n] of Object.entries(now.nodes) as [string, { name: string }][]) {
        const old = (was.nodes as Record<string, { name: string }>)[id];
        if (old && old.name !== n.name) {
          expect(titles.has(n.name), `${k}: box renamed to a title not on its board`).toBe(true);
          n.name = old.name;
        }
      }
    }
    expect(withoutLayout(now, !strict), k).toEqual(withoutLayout(was, !strict));
  }
});
