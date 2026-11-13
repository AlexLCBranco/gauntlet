import { expect, it } from "vitest";

import { arrivalArea, roomForWindow, shrinkToFit } from "./arrive";

it("the room is 90% of the window at 100%", () => {
  expect(roomForWindow({ w: 1000, h: 800 })).toEqual({ w: 900, h: 720 });
});

it("shrinks only what is too big, keeping its shape", () => {
  expect(shrinkToFit({ w: 3840, h: 2160 }, { w: 1728, h: 972 })).toBeCloseTo(0.45);
  expect(shrinkToFit({ w: 400, h: 300 }, { w: 1728, h: 972 })).toBe(1);
  expect(shrinkToFit({ w: 500, h: 3000 }, { w: 1728, h: 972 })).toBeCloseTo(0.324);
});

it("the area is the page in view, pulled in by the spare margin", () => {
  // The view reaches past the page's right edge: cut at the page.
  const a = arrivalArea({ x: 1000, y: 0, w: 1000, h: 800 }, { x: 0, y: 0, w: 1500, h: 2000 });
  for (const [k, v] of Object.entries({ x: 1025, y: 40, w: 450, h: 720 })) expect(a[k as keyof typeof a]).toBeCloseTo(v);
});
