import { describe, expect, it } from "vitest";

import { snapStraight } from "./straightLines";

const deg = (d: number) => (d * Math.PI) / 180;
const at = (d: number, r = 100) => ({ x: Math.cos(deg(d)) * r, y: Math.sin(deg(d)) * r });

describe("straight lines", () => {
  const o = { x: 0, y: 0 };

  it("a few degrees off horizontal or vertical comes out exactly straight, the end level with the pointer", () => {
    expect(snapStraight(o, at(2))).toEqual({ x: at(2).x, y: 0 });
    expect(snapStraight(o, at(-3))).toEqual({ x: at(-3).x, y: 0 });
    expect(snapStraight(o, at(92))).toEqual({ x: 0, y: at(92).y });
    expect(snapStraight(o, at(178))).toEqual({ x: at(178).x, y: 0 });
    expect(snapStraight(o, at(272))).toEqual({ x: 0, y: at(272).y });
    expect(snapStraight(o, at(5))).toEqual({ x: at(5).x, y: 0 });
    expect(snapStraight({ x: 10, y: 20 }, { x: 210, y: 23 })).toEqual({ x: 210, y: 20 });
  });

  it("further off, the line is left as drawn", () => {
    for (const d of [10, 30, 45, 80]) expect(snapStraight(o, at(d))).toEqual(at(d));
  });

  it("straight on the page for a rotated shape", () => {
    // A shape turned 90°: its own horizontal is the page's vertical, so a
    // line 2° off its own horizontal straightens along it.
    const p = snapStraight(o, at(-2), deg(90));
    expect(p.x).toBeCloseTo(at(-2).x, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it("a zero-length line stays", () => {
    expect(snapStraight(o, o)).toEqual(o);
  });
});
