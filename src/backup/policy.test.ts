import { describe, expect, it } from "vitest";

import { BUDGET_SHARE, FALLBACK_BUDGET, KEEP_DAILY_DAYS, KEEP_RECENT, MAX_USE_SHARE, byAge, fingerprint, plan } from "./policy";

const HOUR = 60 * 60 * 1000;
const MB = 1024 * 1024;
const now = new Date(2026, 9, 19, 12).getTime();

describe("which automatic backups are kept by age", () => {
  it(`the newest ${KEEP_RECENT}, then the newest of each day for ${KEEP_DAILY_DAYS} days`, () => {
    const all = Array.from({ length: 200 * 24 }, (_, i) => ({ id: `h${i}`, at: now - i * HOUR }));
    const keep = byAge(all, now);
    for (let i = 0; i < KEEP_RECENT; i++) expect(keep.has(`h${i}`)).toBe(true);
    const older = [...keep].map((id) => all.find((b) => b.id === id)!).filter((b) => now - b.at >= KEEP_RECENT * HOUR);
    expect(new Set(older.map((b) => new Date(b.at).toDateString())).size).toBe(older.length);
    expect(older.every((b) => now - b.at <= KEEP_DAILY_DAYS * 24 * HOUR)).toBe(true);
  });
});

describe("whether a new backup fits", () => {
  const quota = 100 * MB;
  const budget = quota * BUDGET_SHARE;

  it("saves when there is room, dropping nothing", () => {
    expect(plan(1 * MB, [{ id: "a", at: now - HOUR, size: 1 * MB }], now, 10 * MB, quota)).toEqual({ save: true, drop: [] });
  });

  it("drops the oldest backups until the new one fits the budget", () => {
    const existing = Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, at: now - (i + 1) * HOUR, size: 5 * MB }));
    const p = plan(6 * MB, existing, now, 30 * MB, quota);
    expect(p.save).toBe(true);
    // Oldest first: 25 + 6, 20 + 6, 15 + 6 are over 20 MB; 10 + 6 fits.
    expect(p.drop).toEqual(["b4", "b3", "b2"]);
    const kept = existing.filter((b) => !p.drop.includes(b.id)).reduce((s, b) => s + b.size, 0);
    expect(kept + 6 * MB).toBeLessThanOrEqual(budget);
  });

  it("never saves a backup bigger than the whole budget, and says so", () => {
    expect(plan(budget + 1, [], now, 10 * MB, quota)).toEqual({ save: false, drop: [], warning: "too-big" });
  });

  it(`never takes the site past ${MAX_USE_SHARE * 100}% of its quota, even within the budget, and says so`, () => {
    // The apps already use 55 MB; a 10 MB backup would take the site to 65%.
    expect(plan(10 * MB, [], now, 55 * MB, quota)).toEqual({ save: false, drop: [], warning: "storage-full" });
    // Freeing an old backup first can make room.
    expect(plan(10 * MB, [{ id: "old", at: now - HOUR, size: 15 * MB }], now, 55 * MB, quota)).toEqual({ save: true, drop: ["old"] });
  });

  it("uses a fixed budget when the browser doesn't say its quota", () => {
    expect(plan(FALLBACK_BUDGET + 1, [], now)).toMatchObject({ save: false, warning: "too-big" });
    expect(plan(1 * MB, [], now).save).toBe(true);
  });
});

describe("fingerprint", () => {
  it("tells the same data from changed data", () => {
    expect(fingerprint("abc")).toBe(fingerprint("abc"));
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
  });
});
