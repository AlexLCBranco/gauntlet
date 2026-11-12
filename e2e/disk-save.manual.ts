import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type Page } from "./test";

import { buildScreenshots } from "./screenshots";

/**
 * The save on a REAL disk folder (speed session, Part 1; owner: "my folder
 * is on Google Drive: measure the save on a real disk folder too"). A
 * measurement with a report, run by hand (playwright.disk.config.ts), not
 * part of the suite: a real folder needs Windows' folder dialog, which
 * only a visible browser shows.
 *
 * The same 19 pages x 4 screenshots as perf-save.e2e.ts. Measured: the
 * first save into the folder (all 76 pictures written), a save after a
 * small edit (3 times), and, for comparison, what the save was before
 * Part 1 on this same folder: one 117 MB text written to it from the page.
 */

// Not the temporary folder: the browser refuses folders with system files.
const DIR = process.env.DISK_DIR ?? path.join(os.homedir(), "gauntlet-disk-save-test");
const OUT = path.resolve("node_modules/.tmp/disk-save.json");

const r = (n: number) => Math.round(n);

/** Long tasks on the page from now on. */
const watchStalls = (page: Page) =>
  page.evaluate(() => {
    const w = window as any;
    if (w.__long) return;
    w.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push({ start: e.startTime, dur: e.duration }))).observe({ type: "longtask" });
  });

const measures = (page: Page) =>
  page.evaluate(() => ({
    now: performance.now(),
    long: (window as any).__long as { start: number; dur: number }[],
    measures: performance
      .getEntriesByType("measure")
      .filter((m) => m.name.startsWith("gauntlet:"))
      .map((m) => ({ name: m.name, start: m.startTime, dur: m.duration, detail: (m as PerformanceMeasure).detail })),
  }));

function tree(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const t = tree(p);
      files += t.files;
      bytes += t.bytes;
    } else {
      files++;
      bytes += fs.statSync(p).size;
    }
  }
  return { files, bytes };
}

test("the save on a real disk folder (19 pages of screenshots)", async ({ page }) => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  const report: Record<string, unknown> = { folder: DIR };

  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  const built = await buildScreenshots(page, 19, 4);
  report.fixture = { ...built, MB: +(built.bytes / 1e6).toFixed(1) };

  // Pick the real folder on the backup page: Windows' dialog and the
  // browser's confirmation, answered by UI Automation.
  await page.goto("/backup/");
  await watchStalls(page);
  await page.getByRole("button", { name: "Choose a backup folder…" }).click();
  const picked = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.resolve("scripts/pick-folder.ps1"), "-Path", DIR], { encoding: "utf8", windowsHide: true });
  console.log(`folder picker: ${picked.stdout.trim()} ${picked.stderr.trim()}`);
  expect(picked.status, "the folder was picked").toBe(0);

  // Picking it backs up at once: the first write, every picture.
  await expect(page.getByTestId("folder-state")).toContainText("Last backup", { timeout: 300_000 });
  {
    const m = await measures(page);
    const write = m.measures.find((x) => x.name === "gauntlet:folder-write")!;
    const long = m.long.filter((l) => l.start + l.dur > write.start && l.start < write.start + write.dur).map((l) => l.dur);
    report.firstWrite = { ms: r(write.dur), picturesWritten: write.detail.picturesWritten, longestStallMs: r(Math.max(0, ...long)), stalls: long.length };
    console.log(`first write to the disk folder: ${JSON.stringify(report.firstWrite)}`);
    expect(write.detail.picturesWritten).toBe(built.pictures);
  }

  // A save after a small edit, on the whiteboard.
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await watchStalls(page);
  const status = page.getByTestId("save-status");
  await expect(status).toHaveText("Saved", { timeout: 60_000 });
  const saves = [];
  for (let i = 0; i < 3; i++) {
    const from = await page.evaluate(() => performance.now());
    await page.evaluate((t) => {
      const e = (window as any).editor;
      e.createShape({ type: "text", x: 1000, y: 620 + Math.random() * 300, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] } } });
      e.selectNone();
    }, `disk edit ${i}`);
    await expect(status).toHaveText("Saving…", { timeout: 15_000 });
    await expect(status).toHaveText("Saved", { timeout: 120_000 });
    const m = await measures(page);
    const reading = m.measures.find((x) => x.name === "gauntlet:snapshot" && x.start >= from)!;
    const write = m.measures.find((x) => x.name === "gauntlet:folder-write" && x.detail.file === "gauntlet-save.json" && x.start >= reading.start)!;
    const end = write.start + write.dur;
    const long = m.long.filter((l) => l.start + l.dur > reading.start && l.start < end).map((l) => l.dur);
    saves.push({ readingMs: r(reading.dur), writeMs: r(write.dur), totalMs: r(end - reading.start), picturesWritten: write.detail.picturesWritten, editToSavedMs: r(m.now - from), longestStallMs: r(Math.max(0, ...long)), stalls: long.length });
  }
  report.saves = saves;
  console.log(`save after a small edit, disk folder: ${JSON.stringify(saves)}`);

  // Before Part 1, on this same folder: one 117 MB text written from the page.
  {
    const old = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const o = indexedDB.open("gauntlet-backup-folder");
        o.onsuccess = () => res(o.result);
        o.onerror = () => rej(o.error);
      });
      const folder = await new Promise<FileSystemDirectoryHandle>((res) => (db.transaction("handles").objectStore("handles").get("folder").onsuccess = (e) => res((e.target as IDBRequest).result)));
      db.close();
      const text = "x".repeat(116_700_000);
      const longs: number[] = [];
      const obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push(e.duration)));
      obs.observe({ type: "longtask" });
      const t0 = performance.now();
      const w = await (await folder.getFileHandle("old-format-write-test.json", { create: true })).createWritable();
      await w.write(text);
      await w.close();
      const ms = performance.now() - t0;
      await new Promise((r) => setTimeout(r, 200));
      obs.disconnect();
      await folder.removeEntry("old-format-write-test.json");
      return { ms: Math.round(ms), longestStallMs: Math.round(Math.max(0, ...longs)), stalls: longs.length };
    });
    report.oldFormatWrite = old;
    console.log(`the old save's write on this folder (117 MB text): ${JSON.stringify(old)}`);
  }

  report.onDisk = tree(DIR);
  console.log(`on disk: ${JSON.stringify(report.onDisk)} in ${DIR}`);
  expect(fs.existsSync(path.join(DIR, "gauntlet-save.json"))).toBe(true);
  expect(fs.readdirSync(path.join(DIR, "gauntlet-images"))).toHaveLength(built.pictures);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  fs.rmSync(DIR, { recursive: true, force: true });
});
