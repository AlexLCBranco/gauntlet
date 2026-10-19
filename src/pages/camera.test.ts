import { describe, expect, it } from "vitest";

import { pageForWindow, zoomPercent } from "./camera";

describe("pageForWindow", () => {
  it("is the window's size at zoom 1 when everything fits", () => {
    expect(pageForWindow({ w: 1915, h: 910 }, { x: 1800, y: 600 })).toEqual({ box: { x: 0, y: 0, w: 1915, h: 910 }, zoom: 1 });
    expect(pageForWindow({ w: 1366, h: 768 }, { x: 0, y: 0 })).toEqual({ box: { x: 0, y: 0, w: 1366, h: 768 }, zoom: 1 });
  });
  it("zooms out just enough to hold content past the right edge, keeping the window's shape", () => {
    const { box, zoom } = pageForWindow({ w: 1366, h: 768 }, { x: 1900, y: 500 });
    expect(zoom).toBeCloseTo(1366 / 1900, 10);
    expect(box.w).toBeCloseTo(1900, 6);
    expect(box.w / box.h).toBeCloseTo(1366 / 768, 10);
    expect(box.h).toBeGreaterThan(500);
  });
  it("zooms out for content past the bottom edge (an old 1920x1080 page in a short window)", () => {
    const { box, zoom } = pageForWindow({ w: 1915, h: 910 }, { x: 1920, y: 1080 });
    expect(zoom).toBeCloseTo(910 / 1080, 10);
    expect(box.h).toBeCloseTo(1080, 6);
    expect(box.w).toBeGreaterThanOrEqual(1920);
  });
  it("always covers the content exactly, despite rounding (or shapes on the edge get nudged inside)", () => {
    for (const vw of [1915, 1366, 1000, 2200, 1280, 1537])
      for (const vh of [910, 768, 1000, 900, 721])
        for (const [ex, ey] of [[1920, 1080], [1920, 300], [100, 1080], [2345.7, 1999.3]]) {
          const { box } = pageForWindow({ w: vw, h: vh }, { x: ex, y: ey });
          expect(box.w).toBeGreaterThanOrEqual(ex);
          expect(box.h).toBeGreaterThanOrEqual(ey);
        }
  });
  it("never zooms in past 1 for a small drawing", () => {
    expect(pageForWindow({ w: 800, h: 600 }, { x: 10, y: 10 }).zoom).toBe(1);
  });
});

describe("zoomPercent", () => {
  it("is 100 when the page fills the window", () => expect(zoomPercent(0.79, 0.79)).toBe(100));
  it("scales from there", () => expect(zoomPercent(1.185, 0.79)).toBe(150));
});
