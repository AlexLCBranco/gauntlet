import { describe, expect, it } from "vitest";

import { tabTitle } from "./tabTitle";

describe("tabTitle (GT-15)", () => {
  it("names the page after the site", () => {
    expect(tabTitle("Page 1")).toBe("Gauntlet · Page 1");
    expect(tabTitle("  Plans  ")).toBe("Gauntlet · Plans");
  });
  it("is just the site for a page with no name", () => {
    expect(tabTitle("")).toBe("Gauntlet");
    expect(tabTitle("   ")).toBe("Gauntlet");
    expect(tabTitle(undefined)).toBe("Gauntlet");
  });
});
