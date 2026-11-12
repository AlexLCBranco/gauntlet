import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "./test";

import { whiteboardSaved } from "./helpers";
import { buildScreenshots, screenshotsStored } from "./screenshots";

/**
 * Saving that scales (speed session, Parts 0 and 1): the permanent speed
 * test of the save, with limits.
 *
 * Builds a throwaway whiteboard like the owner's slow one: 19 pages, each
 * with 4 screenshots (generated 1920 x 1080 PNGs, pasted through tldraw's
 * own file handler; 76 pictures, about 87 MB), then checks
 *   - a save after a small edit: no picture is read or written again, the
 *     page's own thread never stalls (no task over 50 ms), the file is
 *     small;
 *   - dragging a screenshot stays smooth: alone, with the save that
 *     follows it, and while a save runs;
 *   - opening the site, and the automatic backup 3 s after: kept in the
 *     browser (it failed at this size before), without stalling;
 *   - the folder after 20 more saves: pictures once, small copies.
 *
 * Before Part 1 (2026-11-12, docs/HISTORY.md "Speed session"): every save
 * re-read all 76 pictures (87 MB), wrote a 117 MB file, and stalled the
 * page 2-3 times, up to 340-530 ms.
 *
 * What a save does is read from the app's own `performance` measures
 * ("gauntlet:snapshot": reading the site, in the backup worker;
 * "gauntlet:folder-write": the folder). The probes below also wrap the
 * browser functions the old save used on the page (JSON.stringify of big
 * text, Blob.arrayBuffer, btoa), to show the page no longer does any of it.
 *
 * The "picked folder" is a folder in the browser's private file system
 * (OPFS), as in save.e2e.ts: the picker can't be clicked by a test. A real
 * disk folder is measured by e2e/disk-save.manual.ts (run by hand).
 *
 * Runs in the "perf" project (alone, one worker): playwright.config.ts.
 */

const PAGES = 19;
const PER_PAGE = 4;
const PICTURES = PAGES * PER_PAGE;
const FOLDER_DB = "gauntlet-backup-folder";
const DIR = "perf-saves";
const OUT = path.resolve("node_modules/.tmp/perf-save.json");
const REFRESH = 1000 / 60;

/** Installed before the page's code. */
function probes() {
  if (window.top !== window || location.pathname !== "/") return;
  const w = window as any;
  w.__ev = [];
  w.__long = [];
  w.__f = [];
  w.__open = {};
  const ev = (kind: string, extra: object = {}) => w.__ev.push({ kind, t: performance.now(), ...extra });
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push({ start: e.startTime, dur: e.duration }))).observe({ type: "longtask", buffered: true });
  } catch {
    // No long-task observer: frames still tell.
  }
  // Frame gaps, all the time (60 a second: small).
  let last = performance.now();
  const frame = (t: number) => {
    w.__f.push([t, t - last]);
    last = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // Opening: the editor and its sheet there; every picture of the page drawn.
  const opening = () => {
    const e = w.editor;
    if (e && !w.__open.editor && document.querySelector('[data-testid="sheet"]')) w.__open.editor = performance.now();
    if (w.__open.editor) {
      const want = e.getCurrentPageShapes().filter((s: any) => s.type === "image").length;
      const got = [...document.querySelectorAll<HTMLImageElement>(".tl-canvas img")].filter((i) => i.complete && i.naturalWidth > 0).length;
      if (got >= want) {
        w.__open.images = performance.now();
        w.__open.want = want;
        return;
      }
    }
    requestAnimationFrame(opening);
  };
  requestAnimationFrame(opening);
  // What the old save did on the page's own thread.
  const stringify = JSON.stringify;
  JSON.stringify = function (this: unknown, ...a: unknown[]) {
    const start = performance.now();
    const out = (stringify as any).apply(this, a);
    const dur = performance.now() - start;
    if (typeof out === "string" && out.length > 1e6) ev("big-stringify", { start, dur, len: out.length });
    return out;
  } as typeof JSON.stringify;
  const read = Blob.prototype.arrayBuffer;
  Blob.prototype.arrayBuffer = function (this: Blob) {
    ev("blob-read", { bytes: this.size });
    return read.call(this);
  };
  const b64 = window.btoa;
  window.btoa = (s: string) => {
    if (s.length > 1e5) ev("btoa", { chars: s.length });
    return b64(s);
  };
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    if (key === "gauntlet:auto-backup") ev("auto-note", { value });
    return setItem.call(this, key, value);
  };
}

interface Ev {
  kind: string;
  t: number;
  bytes?: number;
  value?: string;
}
interface Measure {
  name: string;
  start: number;
  dur: number;
  detail: { ms?: number; pictures?: number; sampledBytes?: number; jsonChars?: number; file?: string; picturesWritten?: number; chars?: number };
}
interface Snap {
  now: number;
  ev: Ev[];
  long: { start: number; dur: number }[];
  frames: [number, number][];
  open: { editor?: number; images?: number; want?: number };
  measures: Measure[];
}

const snap = (page: Page) =>
  page.evaluate(() => {
    const w = window as any;
    const measures = performance
      .getEntriesByType("measure")
      .filter((m) => m.name.startsWith("gauntlet:"))
      .map((m) => ({ name: m.name, start: m.startTime, dur: m.duration, detail: (m as PerformanceMeasure).detail }));
    return { now: performance.now(), ev: w.__ev, long: w.__long, frames: w.__f, open: w.__open, measures };
  }) as Promise<Snap>;
const now = (page: Page) => page.evaluate(() => performance.now());
const r = (n: number) => Math.round(n);
const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** Frames and stalls between two page times. */
function windowStats(s: Snap, a: number, b: number) {
  const gaps = s.frames.filter(([t]) => t >= a && t <= b).map(([, g]) => g).sort((x, y) => x - y);
  const long = s.long.filter((l) => l.start + l.dur > a && l.start < b).map((l) => l.dur);
  return {
    ms: r(b - a),
    frames: gaps.length,
    frameMedian: r(gaps[Math.floor(gaps.length / 2)] ?? 0),
    frameP95: r(gaps[Math.floor(gaps.length * 0.95)] ?? 0),
    frameMax: r(Math.max(0, ...gaps)),
    over50: gaps.filter((g) => g > 50).length,
    longTasks: long.length,
    longSum: r(long.reduce((x, y) => x + y, 0)),
    longMax: r(Math.max(0, ...long)),
  };
}

async function useTestFolder(page: Page) {
  await page.evaluate(
    async ({ db: name, dir }) => {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle(dir, { create: true });
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(name, 1);
        open.onupgradeneeded = () => open.result.createObjectStore("handles");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("handles", "readwrite");
        tx.objectStore("handles").put(folder, "folder");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      window.dispatchEvent(new Event("gauntlet:backup-folder-changed"));
    },
    { db: FOLDER_DB, dir: DIR },
  );
}

/** The folder's files (name → bytes), its pictures folder's apart. */
const folderSizes = (page: Page) =>
  page.evaluate(async (dir) => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle(dir, { create: true });
    const files: Record<string, number> = {};
    const pictures: Record<string, number> = {};
    for await (const entry of (folder as any).values()) {
      if (entry.kind === "file") files[entry.name] = (await entry.getFile()).size;
      else for await (const p of entry.values()) if (p.kind === "file") pictures[p.name] = (await p.getFile()).size;
    }
    return { files, pictures };
  }, DIR);

const status = (page: Page) => page.getByTestId("save-status");

/** The whiteboard, opened: when its editor was there and when the page's
    pictures were drawn (ms from the navigation's start). */
async function openSite(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__open?.images !== undefined, null, { timeout: 120_000, polling: 50 });
  const o = (await snap(page)).open;
  return { editor: r(o.editor!), pictures: r(o.images!), want: o.want! };
}

/** A small edit: one short text on the current page. */
const addText = (page: Page, t: string) =>
  page.evaluate((t) => {
    const e = (window as any).editor;
    e.createShape({ type: "text", x: 1000 + Math.random() * 600, y: 620 + Math.random() * 300, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] } } });
    e.selectNone();
  }, t);

/** What one save did: the first one that began at or after `from`. */
function saveOf(s: Snap, from: number) {
  const reading = s.measures.find((m) => m.name === "gauntlet:snapshot" && m.start >= from);
  const write = reading && s.measures.find((m) => m.name === "gauntlet:folder-write" && m.detail.file === "gauntlet-save.json" && m.start >= reading.start);
  if (!reading || !write) return null;
  const end = write.start + write.dur;
  const onPage = s.ev.filter((e) => e.t >= reading.start && e.t <= end);
  return {
    readingMs: r(reading.dur),
    writeMs: r(write.dur),
    totalMs: r(end - reading.start),
    jsonChars: reading.detail.jsonChars!,
    pictures: reading.detail.pictures!,
    picturesWritten: write.detail.picturesWritten!,
    pictureBytesSampled: reading.detail.sampledBytes!,
    // On the page's own thread: none of the old save's work.
    pagePictureReads: onPage.filter((e) => e.kind === "blob-read").length,
    pageBigStringifies: onPage.filter((e) => e.kind === "big-stringify").length,
    pageBase64: onPage.filter((e) => e.kind === "btoa").length,
    stalls: windowStats(s, reading.start, end),
    window: [reading.start, end] as const,
  };
}

/** Presses on the first screenshot's middle and drags it about for `moves`
    pointer moves (about 60 a second). Returns the drag's page times. */
async function dragPicture(page: Page, moves = 120, midway?: () => Promise<void>) {
  const c = await page.evaluate(() => {
    const e = (window as any).editor;
    const s = e.getCurrentPageShapes().find((s: any) => s.type === "image");
    const b = e.getShapePageBounds(s.id);
    const p = e.pageToViewport({ x: b.midX, y: b.midY });
    return { x: p.x as number, y: p.y as number };
  });
  await page.mouse.move(c.x, c.y);
  const a = await now(page);
  await page.mouse.down();
  for (let i = 1; i <= moves; i++) {
    await page.mouse.move(c.x + Math.sin(i / 15) * 200, c.y + Math.sin(i / 40) * 150);
    if (i % 60 === 0 && i < moves) await midway?.();
  }
  await page.mouse.up();
  return [a, await now(page)] as const;
}

/** A drag is smooth: frames as the big board's drag (perf.e2e.ts), and no
    stall a person feels. */
function expectSmooth(s: ReturnType<typeof windowStats>, what: string) {
  expect(s.frameMedian, `${what}: median frame`).toBeLessThan(2.5 * REFRESH);
  expect(s.frameP95, `${what}: 95th percentile frame`).toBeLessThan(4.5 * REFRESH);
  expect(s.longMax, `${what}: longest stall`).toBeLessThan(100);
}

test("19 pages of screenshots: a save re-reads no picture and never stalls the page; drags stay smooth; the automatic backup is kept; the folder stays small", async ({ page }) => {
  test.setTimeout(40 * 60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(probes);
  const report: Record<string, unknown> = {};
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 400));
  });

  // ---- Opening an empty whiteboard (3 times) ----
  const emptyOpens = [];
  for (let i = 0; i < 3; i++) emptyOpens.push(await openSite(page));
  report.openEmpty = { editorMs: mid(emptyOpens.map((o) => o.editor)), runs: emptyOpens.map((o) => o.editor) };

  // ---- The fixture: 19 pages x 4 screenshots ----
  const built = await buildScreenshots(page, PAGES, PER_PAGE);
  const stored = () => screenshotsStored(page);
  await whiteboardSaved(page);
  const mounted = await page.evaluate(() => {
    const e = (window as any).editor;
    return {
      pages: e.getPages().length,
      shapesInFile: e.store.allRecords().filter((r: any) => r.typeName === "shape").length,
      shapesOnThisPage: e.getCurrentPageShapes().length,
      shapeElementsInDom: document.querySelectorAll(".tl-shape").length,
      imgElementsInDom: document.querySelectorAll(".tl-canvas img").length,
    };
  });
  report.fixture = { ...built, MB: +(built.bytes / 1e6).toFixed(1), avgKB: r(built.bytes / built.pictures / 1e3), ...(await stored()), ...mounted };
  console.log(`fixture: ${JSON.stringify(report.fixture)}`);
  expect(mounted.pages).toBe(PAGES);
  // Only the current page's items are in the page (Part 2).
  expect(mounted.shapeElementsInDom).toBe(mounted.shapesOnThisPage);
  expect(mounted.imgElementsInDom).toBe(PER_PAGE);

  // ---- The half-size copies (Part 2, src/images/smaller.ts): made quietly after the pictures arrive ----
  {
    const copies = () =>
      page.evaluate(async () => {
        if (!(await indexedDB.databases()).some((d) => d.name === "gauntlet-picture-cache")) return { n: 0, bytes: 0 };
        const db = await new Promise<IDBDatabase>((res, rej) => {
          const o = indexedDB.open("gauntlet-picture-cache");
          o.onsuccess = () => res(o.result);
          o.onerror = () => rej(o.error);
        });
        try {
          if (!db.objectStoreNames.contains("smaller")) return { n: 0, bytes: 0 };
          const blobs = await new Promise<Blob[]>((res) => (db.transaction("smaller").objectStore("smaller").getAll().onsuccess = (e) => res((e.target as IDBRequest).result)));
          return { n: blobs.length, bytes: blobs.reduce((x, b) => x + b.size, 0) };
        } finally {
          db.close();
        }
      });
    const a = await now(page);
    await expect.poll(async () => (await copies()).n, { timeout: 300_000, intervals: [500] }).toBe(PICTURES);
    const s = await snap(page);
    const made = await copies();
    report.smallerCopies = { copies: made.n, MB: +(made.bytes / 1e6).toFixed(1), waitedMs: r(s.now - a), stallsWhileMaking: windowStats(s, a, s.now) };
    console.log(`smaller copies: ${JSON.stringify(report.smallerCopies)}`);
    // Made in a worker: the page never stalls for them.
    expect(windowStats(s, a, s.now).longMax, "longest stall while the copies are made").toBeLessThan(100);
  }

  // ---- Going to another page: until its pictures are drawn, and what is decoded for them ----
  {
    const switches = await page.evaluate(async () => {
      const editor = (window as any).editor;
      const pages = editor.getPages() as { id: string }[];
      const out: { ms: number; decodedMB: number; widths: number[] }[] = [];
      for (const p of pages.slice(1, 7)) {
        const t0 = performance.now();
        editor.setCurrentPage(p.id);
        const want = editor.getCurrentPageShapes().filter((s: any) => s.type === "image").length;
        let imgs: HTMLImageElement[] = [];
        while (performance.now() - t0 < 20_000) {
          await new Promise((r) => requestAnimationFrame(r));
          imgs = [...document.querySelectorAll<HTMLImageElement>(".tl-canvas img")].filter((i) => i.complete && i.naturalWidth > 0);
          if (imgs.length >= want) break;
        }
        await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
        await new Promise((r) => requestAnimationFrame(r));
        out.push({ ms: Math.round(performance.now() - t0), decodedMB: +(imgs.reduce((x, i) => x + i.naturalWidth * i.naturalHeight * 4, 0) / 1e6).toFixed(1), widths: imgs.map((i) => i.naturalWidth) });
        // What tldraw settles on a moment later (it asks again for the right size).
        await new Promise((r) => setTimeout(r, 1200));
        const settled = [...document.querySelectorAll<HTMLImageElement>(".tl-canvas img")].filter((i) => i.complete && i.naturalWidth > 0);
        out.at(-1)!.widths = settled.map((i) => i.naturalWidth);
        out.at(-1)!.decodedMB = +(settled.reduce((x, i) => x + i.naturalWidth * i.naturalHeight * 4, 0) / 1e6).toFixed(1);
      }
      editor.setCurrentPage(pages[0]!.id);
      return out;
    });
    report.pageSwitch = { ms: mid(switches.map((s) => s.ms)), decodedMB: mid(switches.map((s) => s.decodedMB)), runs: switches };
    console.log(`going to a page of 4 screenshots (6 pages): ${JSON.stringify(report.pageSwitch)}`);
    // Shown 900 wide, a 1920 px screenshot is drawn from its 960 px copy:
    // a quarter of the pixels decoded (was 33.2 MB a page, 219 ms).
    for (const sw of switches) {
      expect(sw.widths).toEqual([960, 960, 960, 960]);
      expect(sw.decodedMB).toBeLessThan(10);
      expect(sw.ms).toBeLessThan(1500);
    }
  }

  // ---- Drag, no save in play (no folder picked yet) ----
  await page.waitForTimeout(3000);
  {
    const [a, b] = await dragPicture(page);
    await page.waitForTimeout(6000);
    const s = await snap(page);
    const during = windowStats(s, a, b);
    report.dragNoSave = { during, after6s: windowStats(s, b, b + 6000) };
    console.log(`drag, no save in play: ${JSON.stringify(report.dragNoSave)}`);
    expectSmooth(during, "drag with no save");
  }

  // ---- The first save into the folder: every picture written, once ----
  await useTestFolder(page);
  await expect(status(page)).not.toHaveText(/Choose a save folder/, { timeout: 15_000 });
  await page.waitForTimeout(1000);
  {
    const from = await now(page);
    await addText(page, "first save");
    await expect(status(page)).toHaveText("Saving…", { timeout: 15_000 });
    await expect(status(page)).toHaveText("Saved", { timeout: 300_000 });
    const s = await snap(page);
    const save = saveOf(s, from)!;
    expect(save, "the first save wrote gauntlet-save.json").not.toBeNull();
    const { window: _w, ...first } = save;
    report.firstSave = { ...first, editToSavedMs: r(s.now - from) };
    console.log(`first save into the folder (writes the ${PICTURES} pictures): ${JSON.stringify(report.firstSave)}`);
    expect(save.picturesWritten).toBe(PICTURES);
    // Even this one hands the pictures over without reading them on the page.
    expect(save.pagePictureReads).toBe(0);
    expect(save.stalls.longMax).toBeLessThan(100);
  }

  // ---- A save after a small edit (3 times) ----
  const saves = [];
  for (let i = 0; i < 3; i++) {
    const from = await now(page);
    await addText(page, `edit ${i}`);
    await expect(status(page)).toHaveText("Saving…", { timeout: 15_000 });
    await expect(status(page)).toHaveText("Saved", { timeout: 300_000 });
    const s = await snap(page);
    const save = saveOf(s, from);
    expect(save, "the save wrote gauntlet-save.json").not.toBeNull();
    saves.push({ ...save!, editToSavedMs: r(s.now - from) });
  }
  const sizes = await folderSizes(page);
  report.save = {
    fileKB: r(sizes.files["gauntlet-save.json"]! / 1e3),
    readingMs: mid(saves.map((s) => s.readingMs)),
    writeMs: mid(saves.map((s) => s.writeMs)),
    totalMs: mid(saves.map((s) => s.totalMs)),
    editToSavedMs: mid(saves.map((s) => s.editToSavedMs)),
    picturesWritten: saves.map((s) => s.picturesWritten),
    pictureKBSampled: r(saves[0]!.pictureBytesSampled / 1e3),
    longestStallMs: saves.map((s) => s.stalls.longMax),
    longestFrameMs: saves.map((s) => s.stalls.frameMax),
    runs: saves.map(({ window: _w, ...s }) => s),
  };
  console.log(`save after a small edit (3 runs): ${JSON.stringify(report.save)}`);
  for (const s of saves) {
    // No picture read or written again: a few KB of each to name it, in the worker.
    expect(s.pictures).toBe(PICTURES);
    expect(s.picturesWritten).toBe(0);
    expect(s.pictureBytesSampled).toBeLessThanOrEqual(PICTURES * 3 * 4096);
    expect(s.pagePictureReads).toBe(0);
    expect(s.pageBigStringifies).toBe(0);
    expect(s.pageBase64).toBe(0);
    // Never a stall a person can feel.
    expect(s.stalls.longMax, "longest stall during a save").toBeLessThan(100);
    // "Saved" within the wait after an edit (2.5 s) plus a moment.
    expect(s.editToSavedMs).toBeLessThan(6000);
  }
  // The target: no task over 50 ms from saving (a long task is one over 50 ms).
  expect(mid(saves.map((s) => s.stalls.longTasks)), "tasks over 50 ms during a save (median of 3)").toBe(0);
  // The file: the whiteboard's records and settings, no pictures (was 117 MB).
  expect(sizes.files["gauntlet-save.json"]!).toBeLessThan(2e6);
  expect(Object.keys(sizes.pictures)).toHaveLength(PICTURES);
  expect(Object.values(sizes.pictures).reduce((x, y) => x + y, 0)).toBe(built.bytes);

  // ---- Drag, then the save that follows it ----
  {
    const [a, b] = await dragPicture(page);
    await expect(status(page)).toHaveText("Saved", { timeout: 300_000 });
    await page.waitForTimeout(500);
    const s = await snap(page);
    const save = saveOf(s, b);
    const during = windowStats(s, a, b);
    const after = windowStats(s, b, s.now);
    report.dragThenSave = { during, afterUntilSaved: after, saveStartedMsAfterRelease: save ? r(save.window[0] - b) : null };
    console.log(`drag, then its save: ${JSON.stringify(report.dragThenSave)}`);
    expect(save, "the drag was saved").not.toBeNull();
    expectSmooth(during, "drag before its save");
    expect(after.longMax, "longest stall after letting go, until saved").toBeLessThan(100);
  }

  // ---- Drag while a save is running ----
  {
    const from = await now(page);
    // A save waits for 2.5 s without a change, so none starts by itself
    // during a drag: Ctrl+S, pressed three times while dragging, saves at once.
    const [a, b] = await dragPicture(page, 240, () => page.keyboard.press("Control+s"));
    await expect(status(page)).toHaveText("Saved", { timeout: 300_000 });
    const s = await snap(page);
    const during = windowStats(s, a, b);
    const savesInDrag = s.measures.filter((m) => m.name === "gauntlet:snapshot" && m.start >= from && m.start <= b).length;
    report.dragDuringSave = { during, savesStartedBeforeItEnded: savesInDrag, asked: "240 pointer moves, about 4 s when nothing stalls" };
    console.log(`drag while a save runs: ${JSON.stringify(report.dragDuringSave)}`);
    expect(savesInDrag, "a save ran during the drag").toBeGreaterThan(0);
    expectSmooth(during, "drag while a save runs");
  }

  // ---- Opening with the 19 pages, and the automatic backup 3 s after ----
  await whiteboardSaved(page);
  const fullOpens = [];
  for (let i = 0; i < 3; i++) fullOpens.push(await openSite(page));
  report.openFull = {
    editorMs: mid(fullOpens.map((o) => o.editor)),
    picturesMs: mid(fullOpens.map((o) => o.pictures)),
    picturesOnPage: fullOpens[0]!.want,
    runs: fullOpens,
  };
  console.log(`open: empty ${JSON.stringify(report.openEmpty)}, 19 pages ${JSON.stringify(report.openFull)}`);
  expect((report.openFull as { picturesMs: number }).picturesMs).toBeLessThan(3000);
  {
    // The page is open again: its automatic backup starts 3 s in and notes
    // its outcome (the data changed since the first one, of an empty page).
    await expect.poll(async () => (await snap(page)).ev.some((e) => e.kind === "auto-note"), { timeout: 120_000, intervals: [500] }).toBe(true);
    const s = await snap(page);
    const note = s.ev.find((e) => e.kind === "auto-note")!;
    const reading = s.measures.find((m) => m.name === "gauntlet:snapshot" && m.start > 2500)!;
    const write = s.measures.find((m) => m.name === "gauntlet:folder-write" && m.detail.file!.startsWith("gauntlet-auto-"));
    const kept = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("gauntlet-auto-backups");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        const all = await new Promise<{ size: number; at: number }[]>((resolve, reject) => {
          const req = db.transaction("backups").objectStore("backups").getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const { usage, quota } = await navigator.storage.estimate();
        return { count: all.length, newestKB: Math.round(all.sort((x, y) => y.at - x.at)[0]!.size / 1e3), usageMB: Math.round((usage ?? 0) / 1e6), quotaMB: Math.round((quota ?? 0) / 1e6) };
      } finally {
        db.close();
      }
    });
    const stalls = windowStats(s, reading.start, note.t);
    report.autoBackup = {
      startedMsAfterOpen: r(reading.start),
      totalMs: r(note.t - reading.start),
      outcome: JSON.parse(note.value!),
      readingMs: r(reading.dur),
      folderWriteMs: write ? r(write.dur) : null,
      picturesWritten: write?.detail.picturesWritten ?? null,
      stalls,
      keptInBrowser: kept,
    };
    console.log(`automatic backup after opening: ${JSON.stringify(report.autoBackup)}`);
    // Kept (it failed at this size before: the browser refused the 117 MB), small, no stall.
    expect(JSON.parse(note.value!).warning).toBeUndefined();
    expect(kept.count).toBeGreaterThanOrEqual(2);
    expect(kept.newestKB).toBeLessThan(2000);
    expect(write?.detail.picturesWritten).toBe(0);
    expect(stalls.longMax, "longest stall during the automatic backup").toBeLessThan(100);
  }

  // ---- The folder after 20 more saves (Ctrl+S: each leaves a dated copy) ----
  {
    const before = await folderSizes(page);
    for (let i = 0; i < 20; i++) {
      await addText(page, `save ${i}`);
      await whiteboardSaved(page);
      await page.keyboard.press("Control+s");
      await expect(status(page)).toHaveText("Saved to folder", { timeout: 60_000 });
      // A dated copy's name is to the second.
      await page.waitForTimeout(1050);
    }
    await expect(status(page)).toHaveText("Saved", { timeout: 60_000 });
    const after = await folderSizes(page);
    const sum = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0);
    const dated = Object.entries(after.files).filter(([n]) => n.startsWith("gauntlet-auto-"));
    report.folderAfter20Saves = {
      totalMB: +((sum(after.files) + sum(after.pictures)) / 1e6).toFixed(1),
      picturesMB: +(sum(after.pictures) / 1e6).toFixed(1),
      pictureFiles: Object.keys(after.pictures).length,
      savesMB: +(sum(after.files) / 1e6).toFixed(2),
      saveFiles: Object.keys(after.files).length,
      datedCopies: dated.length,
      datedCopiesAdded: dated.length - Object.keys(before.files).filter((n) => n.startsWith("gauntlet-auto-")).length,
      biggestSaveKB: r(Math.max(...Object.values(after.files)) / 1e3),
      before1WouldBeMB: r(((dated.length + 1) * 116.7)),
    };
    console.log(`the folder after 20 more saves: ${JSON.stringify(report.folderAfter20Saves)}`);
    expect((report.folderAfter20Saves as { datedCopiesAdded: number }).datedCopiesAdded).toBe(20);
    // Pictures once, whatever the number of copies; every copy small.
    expect(after.pictures).toEqual(before.pictures);
    expect(Math.max(...Object.values(after.files))).toBeLessThan(2e6);
    expect(sum(after.files) + sum(after.pictures)).toBeLessThan(built.bytes + 40e6);
  }

  report.consoleErrors = errors;
  console.log(`console errors: ${JSON.stringify(errors)}`);
  expect(errors.filter((e) => e.startsWith("Gauntlet:"))).toEqual([]);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  test.info().annotations.push({ type: "speed session: saving", description: JSON.stringify(report) });
});
