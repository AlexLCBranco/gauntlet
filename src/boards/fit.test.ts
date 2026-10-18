import { expect, it } from "vitest";

import { fitBoard } from "./fit";

const sheet = { w: 1920, h: 1080 };

it("a new board starts at full size when it fits", () => {
  expect(fitBoard({ w: 600, h: 400 }, 0, sheet)).toEqual({ scale: 1, w: 600, h: 400 });
});

it("a new board too big for the sheet starts at 90% of the room", () => {
  const r = fitBoard({ w: 3840, h: 1000 }, 0, sheet);
  expect(r.scale).toBeCloseTo(0.45);
  expect(r.w).toBeCloseTo(1728);
});

it("keeps the user's scale, and the box follows the content", () => {
  expect(fitBoard({ w: 600, h: 500 }, 0.5, sheet)).toEqual({ scale: 0.5, w: 300, h: 250 });
});

it("shrinks a board that grew past the sheet back inside it", () => {
  const r = fitBoard({ w: 600, h: 2160 }, 1, sheet);
  expect(r.scale).toBe(0.5);
  expect(r.h).toBe(1080);
});
