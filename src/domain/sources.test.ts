import { describe, expect, it } from "vitest";

import { parseFromFrame, frameUrl } from "./protocol";
import { affectsSources, sources } from "./sources";

const store = (data: Record<string, unknown>) => (key: string) => (key in data ? (typeof data[key] === "string" ? (data[key] as string) : JSON.stringify(data[key])) : null);

describe("what can go on the canvas", () => {
  it("lists every board and every map, and marks linked maps", () => {
    const get = store({
      "boardkit:registry": { activeBoardId: "b2", boards: [{ id: "b1", name: "Plan" }, { id: "b2", name: "" }] },
      "linkkit:registry": { version: 1, maps: [{ id: "m1", name: "Linked" }, { id: "m2", name: "Loose" }, { id: "m3", name: "No record" }] },
      "linkkit:map:m1": { version: 2, rev: 3, map: { linkedBoard: "b1" } },
      "linkkit:map:m2": { version: 1, rev: 1, map: {} },
    });
    expect(sources(get)).toEqual([
      { app: "boardkit", id: "b1", name: "Plan", linked: false },
      { app: "boardkit", id: "b2", name: "Untitled", linked: false },
      { app: "linkkit", id: "m1", name: "Linked", linked: true },
      { app: "linkkit", id: "m2", name: "Loose", linked: false },
      { app: "linkkit", id: "m3", name: "No record", linked: false },
    ]);
  });

  it("copes with nothing stored and with junk", () => {
    expect(sources(store({}))).toEqual([]);
    expect(sources(store({ "boardkit:registry": "{bad", "linkkit:registry": { maps: [{ name: "no id" }, null] }, "linkkit:map:x": "{" }))).toEqual([]);
  });

  it("knows which storage changes matter", () => {
    expect(affectsSources("boardkit:registry")).toBe(true);
    expect(affectsSources("linkkit:map:abc")).toBe(true);
    expect(affectsSources(null)).toBe(true);
    expect(affectsSources("boardkit:board:abc")).toBe(false);
    expect(affectsSources("gauntlet:canvas")).toBe(false);
  });
});

describe("frame messages", () => {
  it("reads each kind", () => {
    expect(parseFromFrame({ type: "stone:ready", app: "linkkit", id: "m", status: "ok" })).toEqual({ type: "stone:ready", app: "linkkit", id: "m", status: "ok" });
    expect(parseFromFrame({ type: "stone:status", app: "boardkit", id: "b", status: "deleted" })).toMatchObject({ status: "deleted" });
    expect(parseFromFrame({ type: "stone:scroll", app: "boardkit", id: "b", x: 300, y: 0 })).toEqual({ type: "stone:scroll", app: "boardkit", id: "b", x: 300, y: 0 });
    expect(parseFromFrame({ type: "stone:flushed", app: "linkkit", id: "m", busy: true })).toMatchObject({ busy: true });
  });

  it("ignores anything else", () => {
    for (const bad of [null, "x", {}, { type: "stone:ready", app: "x", id: "m", status: "ok" }, { type: "stone:ready", app: "linkkit", id: "m", status: "odd" }, { type: "stone:scroll", app: "linkkit", id: "m", x: "1", y: 0 }, { type: "stone:flushed", app: "linkkit", id: "m" }, { type: "other", app: "linkkit", id: "m" }])
      expect(parseFromFrame(bad)).toBeNull();
  });

  it("builds the frame address", () => {
    expect(frameUrl("linkkit", "a b")).toBe("/linkkit/?embed=1&id=a%20b");
  });
});
