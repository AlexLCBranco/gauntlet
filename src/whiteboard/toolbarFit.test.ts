import { describe, expect, it } from "vitest";

import { toolbarItems } from "./toolbarFit";

describe("toolbarItems", () => {
  it("shows every tool in a wide window", () => expect(toolbarItems(1600)).toBe(14));
  it("keeps the row clear of the main menu in a narrow one", () => {
    for (const w of [700, 900, 1000, 1200]) {
      const row = (toolbarItems(w) + 1) * 44 + 16;
      expect(w / 2 - row / 2).toBeGreaterThanOrEqual(140);
    }
  });
  it("never shows fewer than five", () => expect(toolbarItems(320)).toBe(5));
});
