import { describe, expect, it } from "vitest";

import { checkUrl, isWebUrl } from "./url";

describe("checkUrl", () => {
  it("keeps http and https links", () => {
    expect(checkUrl("https://example.com/a?b=1")).toEqual({ ok: true, url: "https://example.com/a?b=1" });
    expect(checkUrl("  http://example.com  ")).toEqual({ ok: true, url: "http://example.com/" });
  });

  it("adds https:// to an address typed without a scheme", () => {
    expect(checkUrl("example.com/page")).toEqual({ ok: true, url: "https://example.com/page" });
    expect(checkUrl("www.example.com")).toEqual({ ok: true, url: "https://www.example.com/" });
    expect(checkUrl("localhost:3000/x")).toEqual({ ok: true, url: "https://localhost:3000/x" });
  });

  it("refuses javascript:, data: and every other scheme", () => {
    for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>x</b>", "file:///c:/x", "mailto:a@b.c", "vbscript:x"]) {
      expect(checkUrl(bad)).toEqual({ ok: false, reason: "Only http and https links are allowed." });
    }
  });

  it("refuses empty text, spaces and non-addresses", () => {
    expect(checkUrl("   ").ok).toBe(false);
    expect(checkUrl("a b.com").ok).toBe(false);
    expect(checkUrl("https://").ok).toBe(false);
    // A lone word: what is left of "data:text/html" typed too early, say.
    expect(checkUrl("text/html,x").ok).toBe(false);
    expect(checkUrl("http://[::1]:5180/").ok).toBe(true);
  });
});

describe("isWebUrl", () => {
  it("accepts only stored links that would be kept as they are", () => {
    expect(isWebUrl("https://example.com/")).toBe(true);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("example.com")).toBe(false);
    expect(isWebUrl(3)).toBe(false);
  });
});
