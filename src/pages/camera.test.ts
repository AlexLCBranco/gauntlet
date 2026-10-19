import { describe, expect, it } from "vitest";

import { fillZoom, zoomPercent } from "./camera";
import { SHEET } from "./sheet";

describe("fillZoom", () => {
  it("fills a 16:9 window exactly", () => {
    expect(fillZoom({ w: 1920, h: 1080 }, SHEET)).toBe(1);
    expect(fillZoom({ w: 960, h: 540 }, SHEET)).toBe(0.5);
  });
  it("shows the whole sheet in a wide window (bars at the sides)", () => {
    const z = fillZoom({ w: 1400, h: 600 }, SHEET);
    expect(SHEET.h * z).toBe(600);
    expect(SHEET.w * z).toBeLessThan(1400);
  });
  it("shows the whole sheet in a tall window (bars top and bottom)", () => {
    const z = fillZoom({ w: 800, h: 900 }, SHEET);
    expect(SHEET.w * z).toBe(800);
    expect(SHEET.h * z).toBeLessThan(900);
  });
});

describe("zoomPercent", () => {
  it("is 100 when the page fills the window", () => expect(zoomPercent(0.79, 0.79)).toBe(100));
  it("scales from there", () => expect(zoomPercent(1.185, 0.79)).toBe(150));
});
