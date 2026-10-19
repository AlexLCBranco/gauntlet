import { describe, expect, it } from "vitest";

import { KEEP_DAILY_DAYS, KEEP_RECENT, fingerprintOf, fromFile, isAppKey, restorePlan, summaryOf, toFile, toKeep, type Snapshot } from "./snapshot";

const empty = { boardkit: [], linkkit: [] };
const snap = (local: Record<string, string>, idb: Snapshot["idb"] = empty): Snapshot => ({
  id: "s1",
  at: 1,
  reason: "manual",
  fingerprint: fingerprintOf(local, idb),
  local,
  idb,
});

describe("which keys are backed up", () => {
  it("the apps' keys, not the backups' own or anyone else's", () => {
    expect(isAppKey("boardkit:board:abc")).toBe(true);
    expect(isAppKey("linkkit:registry")).toBe(true);
    expect(isAppKey("gauntlet:canvas")).toBe(true);
    expect(isAppKey("gauntlet:backup:last")).toBe(false);
    expect(isAppKey("TLDRAW_USER_DATA_v3")).toBe(false);
  });
});

describe("fingerprint", () => {
  it("is the same for the same data, in any key order, and changes with any value", () => {
    const a = fingerprintOf({ "boardkit:a": "1", "linkkit:b": "2" }, empty);
    expect(fingerprintOf({ "linkkit:b": "2", "boardkit:a": "1" }, empty)).toBe(a);
    expect(fingerprintOf({ "boardkit:a": "1", "linkkit:b": "3" }, empty)).not.toBe(a);
    expect(fingerprintOf({ "boardkit:a": "1", "linkkit:b": "2" }, { boardkit: [["img:1", new Blob(["x"])]], linkkit: [] })).not.toBe(a);
  });
});

describe("summary", () => {
  it("names the boards and maps from the apps' registries", () => {
    const s = summaryOf({
      "boardkit:registry": JSON.stringify({ boards: [{ id: "b", name: "20/10" }], activeBoardId: "b" }),
      "linkkit:registry": JSON.stringify({ maps: [{ id: "m", name: "Bets map" }] }),
    });
    expect(s).toEqual({ boards: ["20/10"], maps: ["Bets map"] });
    expect(summaryOf({ "boardkit:registry": "not json" })).toEqual({ boards: [], maps: [] });
  });
});

describe("which backups are kept", () => {
  const HOUR = 60 * 60 * 1000;
  const now = new Date(2026, 9, 19, 12).getTime();
  it(`keeps the newest ${KEEP_RECENT}, and the newest of each day for ${KEEP_DAILY_DAYS} days`, () => {
    // One backup an hour for 200 days.
    const all = Array.from({ length: 200 * 24 }, (_, i) => ({ id: `h${i}`, at: now - i * HOUR }));
    const keep = toKeep(all, now);
    for (let i = 0; i < KEEP_RECENT; i++) expect(keep.has(`h${i}`)).toBe(true);
    // One a day beyond those, back to 90 days; nothing older.
    const older = [...keep].map((id) => all.find((s) => s.id === id)!).filter((s) => now - s.at > KEEP_RECENT * HOUR);
    const days = new Set(older.map((s) => new Date(s.at).toDateString()));
    expect(days.size).toBe(older.length);
    expect(older.every((s) => now - s.at <= KEEP_DAILY_DAYS * 24 * HOUR)).toBe(true);
    expect(keep.size).toBeGreaterThan(KEEP_DAILY_DAYS - 2);
    expect(keep.size).toBeLessThan(KEEP_RECENT + KEEP_DAILY_DAYS + 1);
  });
  it("keeps everything while there are few", () => {
    expect(toKeep([{ id: "a", at: now }, { id: "b", at: now - 400 * 24 * HOUR }], now)).toEqual(new Set(["a", "b"]));
  });
});

describe("restore plan", () => {
  it("puts every key back, removes app keys the backup didn't have, leaves others alone", () => {
    const plan = restorePlan(
      { "boardkit:registry": "new", "boardkit:board:later": "{}", "TLDRAW_x": "y" },
      { "boardkit:registry": "old", "linkkit:registry": "maps" },
    );
    expect(plan.set).toEqual({ "boardkit:registry": "old", "linkkit:registry": "maps" });
    expect(plan.remove).toEqual(["boardkit:board:later"]);
  });
  it("raises a record's rev above the current one, so an open Boardkit tab takes it as the newest", () => {
    const plan = restorePlan(
      { "boardkit:board:a": JSON.stringify({ rev: 40, board: { cards: 2 } }) },
      { "boardkit:board:a": JSON.stringify({ rev: 12, board: { cards: 9 } }) },
    );
    expect(JSON.parse(plan.set["boardkit:board:a"])).toEqual({ rev: 41, board: { cards: 9 } });
  });
  it("never writes the backups' own keys", () => {
    expect(restorePlan({}, { "gauntlet:backup:x": "1" }).set).toEqual({});
  });
});

describe("backup file", () => {
  it("round-trips the data, images included; folder links are left out", async () => {
    const image = new Blob([new Uint8Array([1, 2, 3, 250])], { type: "image/png" });
    const handle = { kind: "directory", name: "boardkit-backups" };
    const s = snap({ "boardkit:registry": "{}" }, { boardkit: [["image:x", image], ["backup:folder", handle]], linkkit: [["note", "text"]] });
    const text = JSON.stringify(await toFile(s));
    const back = fromFile(text, 5, "f1");
    expect(back.local).toEqual(s.local);
    expect(back.reason).toBe("file");
    expect(back.idb.linkkit).toEqual([["note", "text"]]);
    expect(back.idb.boardkit).toHaveLength(1);
    const [key, blob] = back.idb.boardkit[0] as [string, Blob];
    expect(key).toBe("image:x");
    expect(blob.type).toBe("image/png");
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3, 250]);
  });
  it("refuses a file that isn't a backup, in plain words", () => {
    expect(() => fromFile("hello", 1, "x")).toThrow(/isn't a gauntlet backup/);
    expect(() => fromFile(JSON.stringify({ format: "other" }), 1, "x")).toThrow(/isn't a gauntlet backup/);
    expect(() => fromFile(JSON.stringify({ format: "gauntlet-backup", version: 2, local: {} }), 1, "x")).toThrow(/newer version/);
  });
});
