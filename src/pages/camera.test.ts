import { describe, expect, it } from "vitest";

import { fillZoom, zoomPercent } from "./camera";
import { SHEET } from "./sheet";

describe("fillZoom", () => {
  it("fills a 16:9 window exactly", () => {
    expect(fillZoom({ w: 1920, h: 1080 }, SHEET)).toBe(1);
    expect(fillZoom({ w: 960, h: 540 }, SHEET)).toBe(0.5);
  });
  it("fills a wide window edge to edge (the sheet's height runs past it)", () => {
    const z = fillZoom({ w: 1400, h: 600 }, SHEET);
    expect(SHEET.w * z).toBe(1400);
    expect(SHEET.h * z).toBeGreaterThan(600);
  });
  it("fills a tall window edge to edge (the sheet's width runs past it)", () => {
    const z = fillZoom({ w: 800, h: 900 }, SHEET);
    expect(SHEET.h * z).toBe(900);
    expect(SHEET.w * z).toBeGreaterThan(800);
  });
});

describe("zoomPercent", () => {
  it("is 100 when the page fills the window", () => expect(zoomPercent(0.79, 0.79)).toBe(100));
  it("scales from there", () => expect(zoomPercent(1.185, 0.79)).toBe(150));
});
