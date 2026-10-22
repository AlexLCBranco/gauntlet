import { describe, expect, it } from "vitest";

import { edgeHit } from "./edgeHit";

const B = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
const at = (x: number, y: number) => edgeHit({ x, y }, B, 6, 12);

describe("edgeHit", () => {
  it("finds each side, just inside or just outside it", () => {
    expect(at(100, 3)).toBe("top");
    expect(at(100, -4)).toBe("top");
    expect(at(100, 98)).toBe("bottom");
    expect(at(-5, 50)).toBe("left");
    expect(at(203, 50)).toBe("right");
  });
  it("finds each corner, and a little along its edges", () => {
    expect(at(1, 1)).toBe("top_left");
    expect(at(10, -3)).toBe("top_left");
    expect(at(199, -2)).toBe("top_right");
    expect(at(-3, 99)).toBe("bottom_left");
    expect(at(205, 105)).toBe("bottom_right");
  });
  it("the middle is inside; further out is nothing", () => {
    expect(at(100, 50)).toBe("inside");
    expect(at(20, 20)).toBe("inside");
    expect(at(100, -7)).toBeNull();
    expect(at(260, 50)).toBeNull();
  });
});
