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
  it("beside the widget when neither above nor below fits: never over its own resize zones (GT-7's wider bar on a small widget)", () => {
    const wide = { w: 280, h: 30 };
    const win = { w: 800, h: 110 };
    // right of it
    expect(barPlace({ x: 0, y: 0, r: 200, b: 88 }, wide.w, wide.h, win, [])).toEqual({ left: 200 + BAR_GAP, top: 4 });
    // left of it, when the right is out of the window
    expect(barPlace({ x: 500, y: 0, r: 700, b: 88 }, wide.w, wide.h, win, [])).toEqual({ left: 500 - BAR_GAP - wide.w, top: 4 });
  });
  it("a small widget hemmed in by controls (a small window): over a control rather than over its own resize zones", () => {
    const wide = { w: 280, h: 30 };
    const win = { w: 800, h: 500 };
    const panel = { left: 8, top: 55, right: 212, bottom: 268 };
    const toolbar = { left: 230, top: 8, right: 600, bottom: 48 };
    const p = barPlace({ x: 0, y: 0, r: 197, b: 88 }, wide.w, wide.h, win, [panel, toolbar]);
    expect(p).toEqual({ left: 4, top: 88 + BAR_GAP });
    // clear of the widget's right edge zone (197 ± 8)
    expect(p.top >= 88 + 8 || p.left >= 197 + 8).toBe(true);
  });
  it("kept inside the window sideways", () => {
    expect(barPlace({ x: -300, y: 400, r: 200, b: 800 }, BAR.w, BAR.h, WIN, []).left).toBe(4);
    expect(barPlace({ x: 1850, y: 400, r: 2400, b: 800 }, BAR.w, BAR.h, WIN, []).left).toBe(1920 - BAR.w - 4);
  });
});
