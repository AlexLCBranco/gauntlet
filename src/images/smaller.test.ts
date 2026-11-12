import { describe, expect, it } from "vitest";

import { levelFor } from "./smaller";

// Which copy a picture is drawn from (speed session, Part 2).

const shot = (over: object = {}) => ({ type: "image" as const, props: { w: 1920, h: 1080, mimeType: "image/png", isAnimated: false, name: "s.png", src: "asset:1", ...over } }) as never;
const at = (screenScale: number, dpr = 1, shouldResolveToOriginal = false) => ({ screenScale, dpr, shouldResolveToOriginal });

describe("levelFor", () => {
  it("picks the smallest copy still at least as big as the picture shows", () => {
    expect(levelFor(shot(), at(0.47))).toBe(0.5);
    expect(levelFor(shot(), at(0.5))).toBe(0.5);
    expect(levelFor(shot(), at(0.25))).toBe(0.25);
    expect(levelFor(shot(), at(0.2))).toBe(0.25);
    expect(levelFor(shot(), at(0.1))).toBe(0.125);
    expect(levelFor(shot(), at(0.01))).toBe(0.125);
  });

  it("the original when shown bigger than half, zoomed in, or on a dense screen", () => {
    expect(levelFor(shot(), at(0.51))).toBeNull();
    expect(levelFor(shot(), at(1))).toBeNull();
    expect(levelFor(shot(), at(3))).toBeNull();
    // 47% on a 150% screen is 70% of its pixels: half would be blurry.
    expect(levelFor(shot(), at(0.47, 1.5))).toBeNull();
    expect(levelFor(shot(), at(0.3, 1.5))).toBe(0.5);
  });

  it("the original for exports and copies, whatever the size", () => {
    expect(levelFor(shot(), at(0.1, 1, true))).toBeNull();
  });

  it("the original for animated, vector and small pictures, and videos", () => {
    expect(levelFor(shot({ isAnimated: true }), at(0.2))).toBeNull();
    expect(levelFor(shot({ mimeType: "image/gif" }), at(0.2))).toBeNull();
    expect(levelFor(shot({ mimeType: "image/svg+xml" }), at(0.2))).toBeNull();
    expect(levelFor(shot({ w: 640, h: 360 }), at(0.2))).toBeNull();
    expect(levelFor({ type: "video", props: { w: 1920, h: 1080, mimeType: "video/mp4", isAnimated: true } } as never, at(0.2))).toBeNull();
  });

  it("never a copy narrower than 160 px", () => {
    // 1000 x 700: an eighth would be 125 px wide.
    expect(levelFor(shot({ w: 1000, h: 700 }), at(0.05))).toBe(0.25);
  });
});
