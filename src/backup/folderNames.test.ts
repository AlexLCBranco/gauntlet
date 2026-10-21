import { describe, expect, it } from "vitest";

import { folderDrops, folderFileName, folderFileTime } from "./folderNames";
import { KEEP_DAILY_DAYS, KEEP_RECENT } from "./policy";

const DAY = 24 * 60 * 60 * 1000;

describe("folderFileName / folderFileTime", () => {
  it("names a file to the second, and reads the time back", () => {
    const at = new Date(2026, 9, 20, 22, 15, 30);
    const name = folderFileName(at);
    expect(name).toBe("gauntlet-auto-2026-10-20-221530.json");
    expect(folderFileTime(name)).toBe(at.getTime());
  });

  it("gives two backups in the same minute different names", () => {
    expect(folderFileName(new Date(2026, 0, 1, 9, 5, 1))).not.toBe(folderFileName(new Date(2026, 0, 1, 9, 5, 2)));
  });

  it("does not read other files as backups", () => {
    for (const name of [
      "gauntlet-backup-2026-10-20-2215.json", // saved by hand
      "gauntlet-auto-2026-10-20-221530.json.tmp",
      "gauntlet-auto-2026-10-20-221530.txt",
      "my notes.json",
      "gauntlet-auto-2026-13-20-221530.json", // month 13
      "gauntlet-auto-2026-02-30-221530.json", // 30 February
      "x-gauntlet-auto-2026-10-20-221530.json",
    ]) {
      expect(folderFileTime(name), name).toBeNull();
    }
  });
});

describe("folderDrops", () => {
  const now = new Date(2026, 9, 20, 12, 0, 0).getTime();

  it("keeps everything while there are few backups", () => {
    const names = [0, 1, 2].map((i) => folderFileName(new Date(now - i * 60_000)));
    expect(folderDrops(names, now)).toEqual([]);
  });

  it("keeps the newest 30 of today and drops the rest of today", () => {
    const names = Array.from({ length: KEEP_RECENT + 5 }, (_, i) => folderFileName(new Date(now - i * 60_000)));
    const drops = folderDrops(names, now);
    expect(drops).toHaveLength(5);
    expect(drops).toEqual(names.slice(KEEP_RECENT));
  });

  it("keeps the newest of each older day for 90 days, and nothing older", () => {
    const recent = Array.from({ length: KEEP_RECENT }, (_, i) => folderFileName(new Date(now - i * 60_000)));
    // Two a day for the 100 days before today.
    const older = Array.from({ length: 100 }, (_, d) => [
      folderFileName(new Date(now - (d + 1) * DAY)),
      folderFileName(new Date(now - (d + 1) * DAY - 3_600_000)),
    ]).flat();
    const drops = new Set(folderDrops([...recent, ...older], now));
    for (const name of recent) expect(drops.has(name)).toBe(false);
    for (let d = 0; d < 100; d++) {
      const [newest, earlier] = [older[2 * d], older[2 * d + 1]];
      expect(drops.has(earlier), `day ${d + 1}, earlier one`).toBe(true);
      expect(drops.has(newest), `day ${d + 1}, newest one`).toBe(d + 1 > KEEP_DAILY_DAYS);
    }
  });

  it("never lists a file it didn't name", () => {
    const names = [
      ...Array.from({ length: KEEP_RECENT + 10 }, (_, i) => folderFileName(new Date(now - i * 60_000))),
      "gauntlet-backup-2020-01-01-0000.json",
      "notes.txt",
    ];
    const drops = folderDrops(names, now);
    expect(drops).not.toContain("gauntlet-backup-2020-01-01-0000.json");
    expect(drops).not.toContain("notes.txt");
  });
});
