import { describe, expect, it } from "vitest";

import { insideDelta, nextPage, previousPage, SHEET } from "./sheet";

describe("insideDelta", () => {
  it("leaves something inside the sheet alone", () => {
    expect(insideDelta({ x: 10, y: 10, w: 100, h: 100 })).toEqual({ x: 0, y: 0 });
  });
  it("pulls something past an edge back in", () => {
    expect(insideDelta({ x: -50, y: 10, w: 100, h: 100 })).toEqual({ x: 50, y: 0 });
    expect(insideDelta({ x: 1900, y: 1000, w: 100, h: 100 })).toEqual({ x: -80, y: -20 });
  });
  it("lines up something bigger than the sheet with its top-left", () => {
    expect(insideDelta({ x: 30, y: -40, w: SHEET.w + 10, h: SHEET.h + 10 })).toEqual({ x: -30, y: 40 });
  });
});

describe("page arrows", () => {
  it("next goes to the following page, or creates one on the last", () => {
    expect(nextPage(["a", "b"], "a")).toEqual({ go: "b" });
    expect(nextPage(["a", "b"], "b")).toBe("create");
  });
  it("previous stops at the first page", () => {
    expect(previousPage(["a", "b"], "b")).toBe("a");
    expect(previousPage(["a", "b"], "a")).toBeNull();
  });
});
