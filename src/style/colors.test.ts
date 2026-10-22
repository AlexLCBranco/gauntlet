import { describe, expect, it } from "vitest";

import { FIXED_COLORS, excalidrawDark, hexToHsv, hsvToHex, metaHex, normalizeHex, pushRecent, shownHex, withAlpha } from "./colors";

describe("fixed colours", () => {
  it("include a true black, a dark grey and dark shades, all distinct exact hex", () => {
    expect(FIXED_COLORS[0].hex).toBe("#000000");
    expect(FIXED_COLORS.map((c) => c.id)).toEqual(["true-black", "dark-grey", "dark-red", "brown", "olive", "dark-green", "dark-blue", "dark-purple"]);
    expect(new Set(FIXED_COLORS.map((c) => c.hex)).size).toBe(FIXED_COLORS.length);
    for (const c of FIXED_COLORS) expect(normalizeHex(c.hex)).toBe(c.hex);
  });
});

describe("hex", () => {
  it("normalizes short, upper-case and bare forms, refuses the rest", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("123456")).toBe("#123456");
    expect(normalizeHex(" #12345F ")).toBe("#12345f");
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex(undefined)).toBeNull();
  });
  it("metaHex reads a valid colour only", () => {
    expect(metaHex({ strokeHex: "#123456" }, "strokeHex")).toBe("#123456");
    expect(metaHex({ strokeHex: "nope" }, "strokeHex")).toBeNull();
    expect(metaHex(undefined, "fillHex")).toBeNull();
  });
  it("withAlpha appends the opacity", () => {
    expect(withAlpha("#123456", 1)).toBe("#123456ff");
    expect(withAlpha("#123456", 0)).toBe("#12345600");
  });
});

describe("recent custom colours", () => {
  it("newest first, no repeats, at most five", () => {
    let r: string[] = [];
    for (const c of ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"]) r = pushRecent(r, c);
    expect(r).toEqual(["#666666", "#555555", "#444444", "#333333", "#222222"]);
    expect(pushRecent(r, "#333333")).toEqual(["#333333", "#666666", "#555555", "#444444", "#222222"]);
    expect(pushRecent(["junk", "#abc"], "nope")).toEqual(["#aabbcc"]);
  });
});

describe("colour area", () => {
  it("round-trips through hue/saturation/value", () => {
    for (const hex of ["#123456", "#ff0000", "#00ff00", "#000000", "#ffffff", "#8a1c1c"]) {
      const { h, s, v } = hexToHsv(hex);
      expect(hsvToHex(h, s, v)).toBe(hex);
    }
  });
});

describe("Excalidraw's dark mode", () => {
  it("is invert(93%) hue-rotate(180deg) as Excalidraw computes it", () => {
    // Excalidraw's own dark canvas: white through its filter is #121212.
    expect(excalidrawDark("#ffffff")).toBe("#121212");
    expect(excalidrawDark("#000000")).toBe("#ededed");
    // Its blue stays blue (hue turned back by the 180°), lighter.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(excalidrawDark("#1971c2").slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it("applies only to colours imported from Excalidraw, only in dark mode, not to colours picked since", () => {
    const imported = { excalidrawId: "a", fillHex: "#ffffff", strokeHex: "#1971c2", ownHex: ["strokeHex"] };
    expect(shownHex(imported, "fillHex", "dark")).toBe("#121212");
    expect(shownHex(imported, "fillHex", "light")).toBe("#ffffff");
    expect(shownHex(imported, "strokeHex", "dark")).toBe("#1971c2");
    expect(shownHex({ fillHex: "#ffffff" }, "fillHex", "dark")).toBe("#ffffff");
    expect(shownHex(imported, "textHex", "dark")).toBeNull();
  });
});
