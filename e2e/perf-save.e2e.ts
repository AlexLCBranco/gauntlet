import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "./test";

import { whiteboardSaved } from "./helpers";

/**
 * Speed session, Part 0: MEASURE ONLY (no limits yet; Part 1 adds them).
 *
 * Builds a throwaway whiteboard like the owner's slow one: 19 pages, each
 * with 4 screenshots (generated 1920 x 1080 PNGs, pasted through tldraw's
 * own file handler), then measures
 *   - a save after a small edit (src/backup/save.ts): reading everything
 *     (makeBackup), JSON.stringify, the folder write, the file's size, and
 *     the main-thread stalls it causes;
 *   - frames and stalls while dragging a screenshot and after letting go:
 *     with no save in play, with a save following the drag, and while a
 *     save is running;
 *   - opening the site: empty, and with the 19 pages; and the automatic
 *     backup that runs 3 s after opening (src/backup/auto.ts).
 *
 * The app is not changed for this: the probes below wrap browser functions
 * the save uses (indexedDB.databases, JSON.stringify, Blob.arrayBuffer,
 * btoa, the folder's writable) before the page's own code loads.
 *
 * The "picked folder" is a folder in the browser's private file system
 * (OPFS), as in save.e2e.ts: the picker can't be clicked by a test. A real
 * folder (Google Drive's, say) writes slower, never faster.
 *
 * Runs in the "perf" project (alone, one worker): playwright.config.ts.
 */

const PAGES = 19;
const PER_PAGE = 4;
const FOLDER_DB = "gauntlet-backup-folder";
const DIR = "perf-saves";
const OUT = path.resolve("node_modules/.tmp/perf-save.json");

/** Installed before the page's code: a timeline of what a save does. */
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
  // makeBackup starts by listing the databases.
  const dbs = IDBFactory.prototype.databases;
  IDBFactory.prototype.databases = function (this: IDBFactory) {
    ev("dump-start");
    return dbs.call(this);
  };
  const stringify = JSON.stringify;
  JSON.stringify = function (this: unknown, ...a: unknown[]) {
    const start = performance.now();
    const out = (stringify as any).apply(this, a);
    const dur = performance.now() - start;
    if (typeof out === "string" && (out.length > 1e6 || dur > 5)) ev("stringify", { start, dur, len: out.length });
    return out;
  } as typeof JSON.stringify;
  const read = Blob.prototype.arrayBuffer;
  Blob.prototype.arrayBuffer = function (this: Blob) {
    ev("blob-read", { bytes: this.size });
    return read.call(this);
  };
  const b64 = window.btoa;
  window.btoa = (s: string) => {
    const start = performance.now();
    const out = b64(s);
    ev("btoa", { start, dur: performance.now() - start, chars: s.length });
    return out;
  };
  const writable = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable = async function (this: FileSystemFileHandle, ...a: any[]) {
    const name = this.name;
    const stream = await (writable as any).apply(this, a);
    const write = stream.write.bind(stream);
    const close = stream.close.bind(stream);
    let start = 0;
    let size = 0;
    stream.write = (data: any) => {
      start ||= performance.now();
      size += typeof data === "string" ? data.length : (data?.size ?? data?.byteLength ?? 0);
      return write(data);
    };
    stream.close = async () => {
      await close();
      ev("write", { name, start, dur: performance.now() - start, size });
    };
    return stream;
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
  start?: number;
  dur?: number;
  len?: number;
  bytes?: number;
  chars?: number;
  name?: string;
  size?: number;
  value?: string;
}
interface Snap {
  now: number;
  ev: Ev[];
  long: { start: number; dur: number }[];
  frames: [number, number][];
  open: { editor?: number; images?: number; want?: number };
}

const snap = (page: Page) =>
  page.evaluate(() => {
    const w = window as any;
    return { now: performance.now(), ev: w.__ev, long: w.__long, frames: w.__f, open: w.__open } as Snap;
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

const folderSizes = (page: Page) =>
  page.evaluate(async (dir) => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle(dir, { create: true });
    const out: Record<string, number> = {};
    for await (const entry of (folder as any).values()) if (entry.kind === "file") out[entry.name] = (await entry.getFile()).size;
    return out;
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

/** What one save did, from the probes: the first save starting at or after `from`. */
function saveOf(s: Snap, from: number) {
  const dump = s.ev.find((e) => e.kind === "dump-start" && e.t >= from);
  const str = dump && s.ev.find((e) => e.kind === "stringify" && e.start! >= dump.t && e.len! > 1e6);
  const wr = str && s.ev.find((e) => e.kind === "write" && e.name === "gauntlet-save.json" && e.start! >= str.start!);
  if (!dump || !str || !wr) return null;
  const end = wr.start! + wr.dur!;
  const within = (e: Ev) => e.t >= dump.t && e.t <= end;
  const reads = s.ev.filter((e) => e.kind === "blob-read" && e.t >= dump.t && e.t <= str.start!);
  const btoa = s.ev.filter((e) => e.kind === "btoa" && within(e));
  return {
    makeBackupMs: r(str.start! - dump.t),
    stringifyMs: r(str.dur!),
    writeMs: r(wr.dur!),
    totalMs: r(end - dump.t),
    jsonChars: str.len!,
    picturesReRead: reads.length,
    pictureBytesReRead: reads.reduce((x, e) => x + e.bytes!, 0),
    btoaMs: r(btoa.reduce((x, e) => x + e.dur!, 0)),
    stalls: windowStats(s, dump.t, end),
    // Each stall, and the step it fell in.
    stallsByStep: s.long
      .filter((l) => l.start + l.dur > dump.t && l.start < end)
      .map((l) => `${r(l.dur)} ms ${l.start + l.dur <= str.start! ? "reading" : l.start < str.start! + str.dur! ? "stringify" : "write"}`),
    window: [dump.t, end] as const,
  };
}

/** Presses on the first screenshot's middle and drags it about for `moves`
    pointer moves (about 60 a second). Returns the drag's page times. */
async function dragPicture(page: Page, moves = 120) {
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
  for (let i = 1; i <= moves; i++) await page.mouse.move(c.x + Math.sin(i / 15) * 200, c.y + Math.sin(i / 40) * 150);
  await page.mouse.up();
  return [a, await now(page)] as const;
}

test("19 pages of screenshots: what a save, a drag and opening cost (Part 0, measured only)", async ({ page }) => {
  test.setTimeout(40 * 60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(probes);
  const report: Record<string, unknown> = {};
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(m.text().slice(0, 400));
  });

  // ---- Opening an empty whiteboard (3 times) ----
  const emptyOpens = [];
  for (let i = 0; i < 3; i++) emptyOpens.push(await openSite(page));
  report.openEmpty = { editorMs: mid(emptyOpens.map((o) => o.editor)), runs: emptyOpens.map((o) => o.editor) };

  // ---- The fixture: 19 pages x 4 screenshots ----
  const built = await page.evaluate(
    async ({ pages, perPage }) => {
      const editor = (window as any).editor;
      /** A 1920 x 1080 "screenshot": a dark app window with rows of text,
          coloured panels and a photo-like block (noise: as hard to compress
          as a real picture). Each one differs. */
      const shot = async (n: number): Promise<File> => {
        const c = document.createElement("canvas");
        c.width = 1920;
        c.height = 1080;
        const g = c.getContext("2d")!;
        g.fillStyle = "#1e1f24";
        g.fillRect(0, 0, 1920, 1080);
        g.fillStyle = "#2b2d36";
        g.fillRect(0, 0, 1920, 56);
        g.fillRect(0, 56, 300, 1024);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = ["#7a2e2e", "#2e5a7a", "#2e7a45", "#7a6a2e", "#5a2e7a", "#2e7a78"][(i + n) % 6]!;
          g.fillRect(330 + (i % 3) * 320, 80 + Math.floor(i / 3) * 190, 300, 170);
        }
        g.font = "15px Segoe UI, Arial, sans-serif";
        for (let row = 0; row < 34; row++) {
          g.fillStyle = row % 5 === 0 ? "#e8e8ea" : "#a9abb3";
          g.fillText(`${n}.${row}  Game ${row + 1}: Team ${(n * 7 + row) % 30} at Team ${(n * 3 + row * 5) % 30}  7:${String((row * 7) % 60).padStart(2, "0")}pm  -${100 + ((n * row) % 250)}  o/u ${200 + ((n + row) % 40)}.5  notes ${Math.random().toString(36).slice(2)}`, 330, 500 + row * 17);
          g.fillText(`List ${row}  ${Math.random().toString(36).slice(2, 9)}`, 20, 90 + row * 28);
        }
        // The photo: 640 x 400 of noise.
        const photo = g.createImageData(640, 400);
        for (let i = 0; i < photo.data.length; i += 4) {
          photo.data[i] = Math.random() * 255;
          photo.data[i + 1] = Math.random() * 255;
          photo.data[i + 2] = Math.random() * 255;
          photo.data[i + 3] = 255;
        }
        g.putImageData(photo, 1250, 80);
        const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), "image/png"));
        return new File([blob], `Screenshot ${n}.png`, { type: "image/png" });
      };
      const first = editor.getCurrentPageId();
      let bytes = 0;
      let n = 0;
      for (let p = 0; p < pages; p++) {
        if (p > 0) {
          editor.createPage({ name: `Page ${p + 1}` });
          editor.setCurrentPage(editor.getPages().at(-1).id);
        }
        const files: File[] = [];
        for (let i = 0; i < perPage; i++) files.push(await shot(++n));
        bytes += files.reduce((x, f) => x + f.size, 0);
        // The way a paste or a drop of files arrives.
        await editor.putExternalContent({ type: "files", files, point: { x: 900, y: 500 } });
        // Four to a page, each 900 wide (a full page of screenshots).
        const shapes = editor.getCurrentPageShapes().filter((s: any) => s.type === "image");
        shapes.forEach((s: any, i: number) => editor.updateShape({ id: s.id, type: "image", x: 40 + (i % 2) * 930, y: 40 + Math.floor(i / 2) * 520, props: { w: 900, h: 506 } }));
        editor.selectNone();
      }
      editor.setCurrentPage(first);
      return { pictures: n, bytes };
    },
    { pages: PAGES, perPage: PER_PAGE },
  );
  // Every picture stored by tldraw, the document saved.
  const stored = () =>
    page.evaluate(async () => {
      const editor = (window as any).editor;
      const assets = editor.getAssets() as { props: { src?: string } }[];
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("TLDRAW_DOCUMENT_v2gauntlet-whiteboard");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
          const req = db.transaction("assets").objectStore("assets").getAllKeys();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        return {
          assetRecords: assets.length,
          asDataUrl: assets.filter((a) => a.props.src?.startsWith("data:")).length,
          asAssetRef: assets.filter((a) => a.props.src?.startsWith("asset:")).length,
          noSrc: assets.filter((a) => !a.props.src).length,
          blobsInIndexedDB: keys.length,
        };
      } finally {
        db.close();
      }
    });
  await expect.poll(async () => (await stored()).blobsInIndexedDB, { timeout: 120_000 }).toBe(PAGES * PER_PAGE);
  await expect.poll(async () => (await stored()).noSrc, { timeout: 120_000 }).toBe(0);
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

  // ---- Drag, no save in play (no folder picked yet) ----
  await page.waitForTimeout(3000);
  {
    const [a, b] = await dragPicture(page);
    await page.waitForTimeout(6000);
    const s = await snap(page);
    report.dragNoSave = { during: windowStats(s, a, b), after6s: windowStats(s, b, b + 6000) };
    console.log(`drag, no save in play: ${JSON.stringify(report.dragNoSave)}`);
  }

  // ---- A save after a small edit (3 times) ----
  await useTestFolder(page);
  await expect(status(page)).not.toHaveText(/Choose a save folder/, { timeout: 15_000 });
  await page.waitForTimeout(1000);
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
    fileMB: +(sizes["gauntlet-save.json"]! / 1e6).toFixed(1),
    makeBackupMs: mid(saves.map((s) => s.makeBackupMs)),
    stringifyMs: mid(saves.map((s) => s.stringifyMs)),
    writeMs: mid(saves.map((s) => s.writeMs)),
    totalMs: mid(saves.map((s) => s.totalMs)),
    editToSavedMs: mid(saves.map((s) => s.editToSavedMs)),
    picturesReRead: saves[0]!.picturesReRead,
    pictureMBReRead: +(saves[0]!.pictureBytesReRead / 1e6).toFixed(1),
    btoaMs: mid(saves.map((s) => s.btoaMs)),
    longestStallMs: mid(saves.map((s) => s.stalls.longMax)),
    stalledMs: mid(saves.map((s) => s.stalls.longSum)),
    longestFrameMs: mid(saves.map((s) => s.stalls.frameMax)),
    runs: saves.map(({ window: _w, ...s }) => s),
  };
  console.log(`save after a small edit (median of 3): ${JSON.stringify(report.save)}`);

  // ---- Drag, then the save that follows it ----
  {
    const [a, b] = await dragPicture(page);
    await expect(status(page)).toHaveText("Saved", { timeout: 300_000 });
    await page.waitForTimeout(500);
    const s = await snap(page);
    const save = saveOf(s, b);
    report.dragThenSave = { during: windowStats(s, a, b), afterUntilSaved: windowStats(s, b, s.now), saveStartedMsAfterRelease: save ? r(save.window[0] - b) : null };
    console.log(`drag, then its save: ${JSON.stringify(report.dragThenSave)}`);
  }

  // ---- Drag while a save is running ----
  {
    const from = await now(page);
    await addText(page, "before a drag");
    await page.waitForFunction((from) => (window as any).__ev.some((e: any) => e.kind === "dump-start" && e.t >= from), from, { timeout: 60_000, polling: 50 });
    const [a, b] = await dragPicture(page, 180);
    const s = await snap(page);
    report.dragDuringSave = { during: windowStats(s, a, b), asked: "180 pointer moves, about 3 s when nothing stalls" };
    console.log(`drag while a save runs: ${JSON.stringify(report.dragDuringSave)}`);
    await expect(status(page)).toHaveText("Saved", { timeout: 300_000 });
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
  // The page is open again: its automatic backup starts 3 s in. Until it
  // notes its outcome, or (nothing changed since the last: no note) until
  // the main thread has been quiet for 8 s.
  {
    const done = async () => {
      const s = await snap(page);
      const dump = s.ev.find((e) => e.kind === "dump-start" && e.t > 2500);
      if (!dump) return false;
      if (s.ev.some((e) => e.kind === "auto-note")) return true;
      const lastBusy = Math.max(dump.t, ...s.long.map((l) => l.start + l.dur), ...s.ev.map((e) => (e.start ?? e.t) + (e.dur ?? 0)));
      return s.now - lastBusy > 8000;
    };
    await expect.poll(done, { timeout: 600_000, intervals: [1000] }).toBe(true);
    await page.waitForTimeout(1000);
    const s = await snap(page);
    const dump = s.ev.find((e) => e.kind === "dump-start" && e.t > 2500)!;
    const note = s.ev.find((e) => e.kind === "auto-note");
    const end = note?.t ?? Math.max(dump.t, ...s.long.map((l) => l.start + l.dur));
    const strs = s.ev.filter((e) => e.kind === "stringify" && e.len! > 1e6 && e.start! >= dump.t);
    const wr = s.ev.find((e) => e.kind === "write" && e.name?.startsWith("gauntlet-auto-"));
    const kept = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("gauntlet-auto-backups");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        const count = db.objectStoreNames.contains("backups")
          ? await new Promise<number>((resolve, reject) => {
              const req = db.transaction("backups").objectStore("backups").count();
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            })
          : 0;
        const { usage, quota } = await navigator.storage.estimate();
        return { count, usageMB: Math.round((usage ?? 0) / 1e6), quotaMB: Math.round((quota ?? 0) / 1e6) };
      } finally {
        db.close();
      }
    });
    report.autoBackup = {
      startedMsAfterOpen: r(dump.t),
      totalMs: r(end - dump.t),
      outcome: note ? JSON.parse(note.value!) : "no note (unchanged since the last)",
      stringifies: strs.map((e) => ({ ms: r(e.dur!), chars: e.len })),
      folderWriteMs: wr ? r(wr.dur!) : null,
      stalls: windowStats(s, dump.t, end),
      keptInBrowser: kept,
    };
    console.log(`automatic backup after opening: ${JSON.stringify(report.autoBackup)}`);
  }

  report.consoleErrors = errors;
  console.log(`console errors and warnings: ${JSON.stringify(errors)}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  test.info().annotations.push({ type: "speed session part 0", description: JSON.stringify(report) });
});
