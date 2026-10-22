import { describe, expect, it } from "vitest";

import { BAR, LABELS, MORE, REMOVED, SEPARATOR } from "./toolbarLayout";

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
});
