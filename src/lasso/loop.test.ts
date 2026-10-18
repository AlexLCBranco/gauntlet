import { describe, expect, it } from "vitest";

import { enclosedBy, pointInPolygon, segmentsCross } from "./loop";

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe("pointInPolygon", () => {
  it("knows inside from outside", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square(0, 0, 10))).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square(0, 0, 10))).toBe(false);
  });
});

describe("segmentsCross", () => {
  it("finds crossings and touching ends", () => {
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 })).toBe(true);
  });
});

describe("enclosedBy (lasso)", () => {
  const loop = square(0, 0, 100);
  it("selects a shape wholly inside the loop", () => {
    expect(enclosedBy(square(10, 10, 20), true, loop)).toBe(true);
  });
  it("doesn't select a shape the loop only touches", () => {
    expect(enclosedBy(square(90, 10, 20), true, loop)).toBe(false);
  });
  it("doesn't select a shape whose corners are inside but a lasso dent cuts through it", () => {
    // A U-shaped lasso: the dent at the top reaches down into the shape.
    const u = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 60 },
      { x: 60, y: 60 },
      { x: 60, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const wide = [
      { x: 10, y: 50 },
      { x: 90, y: 50 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ];
    expect(wide.every((p) => pointInPolygon(p, u))).toBe(true);
    expect(enclosedBy(wide, true, u)).toBe(false);
  });
  it("handles open outlines (a line, a stroke)", () => {
    expect(enclosedBy([{ x: 10, y: 10 }, { x: 80, y: 80 }], false, loop)).toBe(true);
    expect(enclosedBy([{ x: 10, y: 10 }, { x: 180, y: 80 }], false, loop)).toBe(false);
  });
  it("needs a real loop", () => {
    expect(enclosedBy(square(10, 10, 5), true, [{ x: 0, y: 0 }, { x: 100, y: 100 }])).toBe(false);
  });
});
