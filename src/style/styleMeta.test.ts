import { describe, expect, it } from "vitest";

import { FONT_STEPS, fillColorOf, fontStepOf, metaFontPx, shared } from "./styleMeta";

describe("font steps", () => {
  it("go smaller than tldraw's smallest (s, 18 px)", () => {
    const s = FONT_STEPS.find((f) => f.id === "s")!.px;
    expect(FONT_STEPS.filter((f) => f.px < s).map((f) => f.id)).toEqual(["xxs", "xs"]);
  });
  it("are in order, smallest first", () => {
    const px = FONT_STEPS.map((f) => f.px);
    expect([...px].sort((a, b) => a - b)).toEqual(px);
  });
  it("metaFontPx reads a picked step, and leaves tldraw's size alone otherwise", () => {
    expect(metaFontPx({ fontStep: "xxs" })).toBe(10);
    expect(metaFontPx({})).toBeNull();
    expect(metaFontPx(undefined)).toBeNull();
    expect(metaFontPx({ fontStep: "huge" })).toBeNull();
  });
  it("fontStepOf falls back to tldraw's size", () => {
    expect(fontStepOf({ fontStep: "xs" }, "l")).toBe("xs");
    expect(fontStepOf({}, "l")).toBe("l");
  });
});

describe("fill colour", () => {
  it("is the shape's own, else its outline's", () => {
    expect(fillColorOf({ fillColor: "yellow" }, "black")).toBe("yellow");
    expect(fillColorOf({}, "black")).toBe("black");
    expect(fillColorOf(undefined, "red")).toBe("red");
  });
});

describe("shared", () => {
  it("one value, mixed, or nothing", () => {
    expect(shared(["a", "a"])).toBe("a");
    expect(shared(["a", "b"])).toBe("mixed");
    expect(shared([])).toBeUndefined();
  });
});
