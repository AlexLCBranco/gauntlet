import { describe, expect, it } from "vitest";

import { ROW_TOOLS, TOOLBAR_PAD, TOOL_WIDTH, toolbarItems } from "./toolbarFit";

describe("toolbarItems", () => {
  it("shows Excalidraw's tools plus Board and Map in a wide window, never more", () => {
    for (const w of [1400, 1600, 1915, 2560]) expect(toolbarItems(w)).toBe(ROW_TOOLS);
  });
  it("is no wider than Excalidraw's toolbar (542 px) with the overflow button", () => {
    expect((ROW_TOOLS + 1) * TOOL_WIDTH + 2 * TOOLBAR_PAD).toBeLessThanOrEqual(542);
  });
  it("keeps the row clear of the main menu in a narrow one", () => {
    for (const w of [700, 900, 1000, 1200]) {
      const row = (toolbarItems(w) + 2) * TOOL_WIDTH + 2 * TOOLBAR_PAD;
      expect(w / 2 - row / 2).toBeGreaterThanOrEqual(140);
    }
  });
  it("never shows fewer than five", () => expect(toolbarItems(320) + 1).toBe(5));
});
