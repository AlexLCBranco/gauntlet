import { describe, expect, it } from "vitest";

import { BAR_GAP, barPlace } from "./barPlace";

const WIN = { w: 1920, h: 1080 };
const TOOLBAR = { left: 690, top: 8, right: 1170, bottom: 48 };
const BAR = { w: 190, h: 30 };

describe("the Slate date bar's place", () => {
  it("above the widget's top-left corner, clear of its resize zones", () => {
    expect(barPlace({ x: 200, y: 300, r: 800, b: 900 }, BAR.w, BAR.h, WIN, [TOOLBAR])).toEqual({ left: 200, top: 300 - BAR_GAP - BAR.h });
    expect(BAR_GAP).toBeGreaterThan(11); // edges.ts: zones 8 px out, corners 11
  });
  it("under the widget when above it would cover the toolbar or leave the window", () => {
    // a widget at the window's top, under the toolbar (as a new tall night is)
    expect(barPlace({ x: 700, y: 55, r: 1220, b: 900 }, BAR.w, BAR.h, WIN, [TOOLBAR])).toEqual({ left: 700, top: 900 + BAR_GAP });
    expect(barPlace({ x: 100, y: 10, r: 500, b: 300 }, BAR.w, BAR.h, WIN, [])).toEqual({ left: 100, top: 300 + BAR_GAP });
  });
  it("just inside the top-left when neither fits (a widget taller than the window)", () => {
    expect(barPlace({ x: 700, y: -50, r: 1220, b: 1300 }, BAR.w, BAR.h, WIN, [TOOLBAR])).toEqual({ left: 700, top: 4 + BAR_GAP });
  });
  it("kept inside the window sideways", () => {
    expect(barPlace({ x: -300, y: 400, r: 200, b: 800 }, BAR.w, BAR.h, WIN, []).left).toBe(4);
    expect(barPlace({ x: 1850, y: 400, r: 2400, b: 800 }, BAR.w, BAR.h, WIN, []).left).toBe(1920 - BAR.w - 4);
  });
});
