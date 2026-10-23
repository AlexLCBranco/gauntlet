import { describe, expect, it } from "vitest";

import { BAR, barWidth, DEFAULT_LAYOUT, fitBar, KEYS, LABELS, MORE, moveTool, normalizeLayout, REMOVED, sameLayout, SEPARATOR, tooltip, visibleBar } from "./toolbarLayout";

describe("toolbar layout", () => {
  const onBar = BAR.filter((id) => id !== SEPARATOR);

  it("is the owner's: four drawing tools, a separator, Board and Map; the ⋮ menu in order", () => {
    expect(BAR).toEqual(["select", "rectangle", "arrow", "line", SEPARATOR, "board", "map"]);
    expect(MORE).toEqual(["asset", "embed", "lasso", "markup", "text", "draw"]);
  });

  it("every tool is in one place only, has a name, and none is a removed one", () => {
    const all = [...onBar, ...MORE];
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(LABELS[id], id).toBeTruthy();
    for (const id of REMOVED) expect(all).not.toContain(id);
  });

  it("every tool but Markup has keys; no key is used twice; each hint is one of its tool's keys", () => {
    for (const id of [...onBar, ...MORE]) expect(Boolean(KEYS[id]), id).toBe(id !== "markup");
    const all = Object.values(KEYS).flatMap((k) => k.kbd.split(","));
    expect(new Set(all).size).toBe(all.length);
    for (const [id, k] of Object.entries(KEYS)) expect(k.kbd.split(","), id).toContain(k.hint.toLowerCase());
    // B, M, I are free: tldraw's draw tool lost B, and none of these is a
    // removed tool's or tldraw action's key.
    for (const key of ["b", "m", "i"]) expect(all.filter((x) => x === key)).toHaveLength(1);
  });

  it("tooltips read as Excalidraw's", () => {
    expect(tooltip("rectangle")).toBe("Rectangle — R or 2");
    expect(tooltip("asset")).toBe("Insert image — 9");
    expect(tooltip("draw")).toBe("Draw — P or 7 or X");
    expect(tooltip("markup")).toBe("Markup");
  });
});

describe("arranging the toolbar (step 3)", () => {
  const D = DEFAULT_LAYOUT;

  it("pins a menu tool onto the bar at the drop place, and unpins a bar tool into the menu", () => {
    const pinned = moveTool(D, "lasso", "bar", 1);
    expect(pinned.bar).toEqual(["select", "lasso", "rectangle", "arrow", "line", SEPARATOR, "board", "map"]);
    expect(pinned.more).toEqual(["asset", "embed", "markup", "text", "draw"]);
    const unpinned = moveTool(D, "rectangle", "more", 0);
    expect(unpinned.bar).toEqual(["select", "arrow", "line", SEPARATOR, "board", "map"]);
    expect(unpinned.more[0]).toBe("rectangle");
  });

  it("reorders within the bar and within the menu", () => {
    expect(moveTool(D, "map", "bar", 0).bar).toEqual(["map", "select", "rectangle", "arrow", "line", SEPARATOR, "board"]);
    expect(moveTool(D, "draw", "more", 0).more).toEqual(["draw", "asset", "embed", "lasso", "markup", "text"]);
    // An index past the end goes last.
    expect(moveTool(D, "select", "bar", 99).bar.at(-1)).toBe("select");
  });

  it("Select and the separator never go into the menu; a move that changes nothing returns the same layout", () => {
    expect(moveTool(D, "select", "more", 0)).toBe(D);
    expect(moveTool(D, SEPARATOR, "more", 0)).toBe(D);
    expect(moveTool(D, SEPARATOR, "bar", 0)).toBe(D);
    expect(moveTool(D, "nonsense", "bar", 0)).toBe(D);
    expect(moveTool(D, "rectangle", "bar", 1)).toBe(D);
  });

  it("a stored layout is made whole; an unreadable one is the default", () => {
    for (const bad of [null, "x", 3, {}, { bar: "x", more: [] }]) expect(normalizeLayout(bad)).toBe(D);
    const fixed = normalizeLayout({ bar: ["lasso", "lasso", "zzz", "rectangle"], more: ["select", "asset", 7] });
    // Select back on the bar; every tool once; missing ones where the default has them.
    expect(fixed.bar).toEqual(["lasso", "rectangle", "select", "arrow", "line", SEPARATOR, "board", "map"]);
    expect(fixed.more).toEqual(["asset", "embed", "markup", "text", "draw"]);
    const all = [...fixed.bar, ...fixed.more];
    expect(new Set(all).size).toBe(all.length);
    expect(sameLayout(normalizeLayout({ bar: [...D.bar], more: [...D.more] }), D)).toBe(true);
  });
});

describe("the bar never overflows", () => {
  const ALL = ["select", "rectangle", "arrow", "line", SEPARATOR, "board", "map", "asset", "embed", "lasso", "markup", "text", "draw"];

  it("measures as toolbar.css draws it: the default bar is 293 px, everything pinned 533 px", () => {
    expect(barWidth(visibleBar(BAR))).toBe(293);
    expect(barWidth(visibleBar(ALL))).toBe(533);
  });

  it("the separator shows only between two tools", () => {
    expect(visibleBar(["select", SEPARATOR])).toEqual(["select"]);
    expect(visibleBar([SEPARATOR, "select", "map"])).toEqual(["select", "map"]);
    expect(visibleBar(["select", SEPARATOR, "map"])).toEqual(["select", SEPARATOR, "map"]);
  });

  it("with room, everything shows; short of room, the last pinned tools wait in the menu, in bar order; Select always stays", () => {
    expect(fitBar(ALL, 533)).toEqual({ shown: ALL, spilled: [] });
    const narrow = fitBar(ALL, 500);
    expect(narrow.spilled).toEqual(["draw"]);
    expect(barWidth(narrow.shown)).toBeLessThanOrEqual(500);
    const tiny = fitBar(ALL, 10);
    expect(tiny.shown).toEqual(["select"]);
    expect(tiny.spilled).toEqual(ALL.filter((id) => id !== "select" && id !== SEPARATOR));
  });
});
