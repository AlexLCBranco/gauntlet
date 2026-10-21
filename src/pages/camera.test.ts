import { describe, expect, it } from "vitest";

import { coverZoom, pageForWindow, zoomPercent, zoomSteps } from "./camera";

describe("pageForWindow", () => {
  it("is the window's size at 100% when everything fits", () => {
    expect(pageForWindow({ w: 1915, h: 910 }, { x: 1800, y: 600 })).toEqual({ x: 0, y: 0, w: 1915, h: 910 });
    expect(pageForWindow({ w: 1366, h: 768 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, w: 1366, h: 768 });
  });
  it("in a smaller window, stays as big as the content (the window shows part of it)", () => {
    expect(pageForWindow({ w: 957, h: 910 }, { x: 1900, y: 500 })).toEqual({ x: 0, y: 0, w: 1900, h: 910 });
    expect(pageForWindow({ w: 1915, h: 910 }, { x: 1920, y: 1080 })).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });
  it("covers the content exactly (or shapes on the edge get nudged inside)", () => {
    for (const vw of [1915, 1366, 957, 2200])
      for (const vh of [910, 768, 721])
        for (const [ex, ey] of [[1920, 1080], [1920, 300], [100, 1080], [2345.7, 1999.3]]) {
          const box = pageForWindow({ w: vw, h: vh }, { x: ex, y: ey });
          expect(box.w).toBe(Math.max(vw, ex));
          expect(box.h).toBe(Math.max(vh, ey));
        }
  });
  it("zoomed out, still covers the window at that zoom (so a resize never has to change the zoom)", () => {
    const box = pageForWindow({ w: 1915, h: 910 }, { x: 2000, y: 1500 }, 0.5);
    expect(box).toEqual({ x: 0, y: 0, w: 3830, h: 1820 });
    expect(coverZoom({ w: 1915, h: 910 }, box)).toBeLessThanOrEqual(0.5);
  });
  it("zoomed in, is still at least the window's size at 100%", () => {
    expect(pageForWindow({ w: 1000, h: 800 }, { x: 10, y: 10 }, 3)).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
  });
});

describe("coverZoom", () => {
  it("is 1 when the page is the window's size in either direction", () => {
    expect(coverZoom({ w: 1915, h: 910 }, { x: 0, y: 0, w: 1915, h: 910 })).toBe(1);
    expect(coverZoom({ w: 957, h: 910 }, { x: 0, y: 0, w: 1900, h: 910 })).toBe(1);
  });
  it("lets a page bigger both ways zoom out until one side fits", () => {
    expect(coverZoom({ w: 960, h: 540 }, { x: 0, y: 0, w: 1920, h: 1620 })).toBeCloseTo(0.5, 10);
  });
});

describe("zoomSteps", () => {
  it("starts at the furthest zoom out, then every 10% up to 800%", () => {
    const at100 = zoomSteps(1);
    expect(at100.slice(0, 4)).toEqual([1, 1.1, 1.2, 1.3]);
    expect(at100.at(-1)).toBe(8);
    expect(at100).toHaveLength(71);
    expect(zoomSteps(0.63).slice(0, 4)).toEqual([0.63, 0.7, 0.8, 0.9]);
    expect(zoomSteps(0.1).slice(0, 2)).toEqual([0.1, 0.2]);
  });
  it("each step is exactly 10% (no float drift)", () => {
    const s = zoomSteps(0.5);
    for (let i = 0; i < s.length - 1; i++) expect(Math.round((s[i + 1] - s[i]) * 1000)).toBe(100);
  });
});

describe("zoomPercent", () => {
  it("is 100 at one page unit per screen pixel", () => expect(zoomPercent(1)).toBe(100));
  it("scales from there", () => expect(zoomPercent(1.5)).toBe(150));
});
