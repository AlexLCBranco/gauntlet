import { describe, expect, it } from "vitest";

import { BAR, KEYS, LABELS, MORE, REMOVED, SEPARATOR, tooltip } from "./toolbarLayout";

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
