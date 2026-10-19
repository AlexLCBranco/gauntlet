import { describe, expect, it } from "vitest";

import { checkOf, emphasisOf, formatNumber, highlightOf, looksCut, statusOf } from "./looks";

const card = (fields: Record<string, unknown> = {}) => ({ id: "c", title: "t", ...fields });
const list = (fields: Record<string, unknown> = {}) => ({ id: "l", title: "L", ...fields });

describe("formatNumber (Boardkit's number formats)", () => {
  it("writes each format", () => {
    expect([1, 7, 12].map((n) => formatNumber(n, undefined))).toEqual(["1", "7", "12"]);
    expect([1, 12].map((n) => formatNumber(n, "padded"))).toEqual(["01", "12"]);
    expect(formatNumber(3, "hash")).toBe("#3");
    expect([1, 4, 9, 14, 40, 88].map((n) => formatNumber(n, "roman"))).toEqual(["i", "iv", "ix", "xiv", "xl", "lxxxviii"]);
    expect([1, 26, 27, 28].map((n) => formatNumber(n, "letters"))).toEqual(["A", "Z", "AA", "AB"]);
  });
  it("falls back to digits for a format it doesn't know", () => expect(formatNumber(5, "fancy")).toBe("5"));
});

describe("highlightOf", () => {
  it("is a ring by default, the card's style when known, none without a colour", () => {
    expect(highlightOf(card({ highlight: "red" }))).toBe("ring");
    expect(highlightOf(card({ highlight: "red", highlightStyle: "dashed" }))).toBe("dashed");
    expect(highlightOf(card({ highlight: "red", highlightStyle: "sparkles" }))).toBe("ring");
    expect(highlightOf(card({ highlightStyle: "dashed" }))).toBeUndefined();
  });
  it("is never on a divider", () => expect(highlightOf(card({ kind: "divider", highlight: "red" }))).toBeUndefined());
});

describe("emphasis, status, cut, checks", () => {
  it("reads a known emphasis only", () => {
    expect(emphasisOf(card({ numberEmphasis: "badge" }))).toBe("badge");
    expect(emphasisOf(card({ numberEmphasis: "glow" }))).toBeUndefined();
  });
  it("reads keep / maybe / cut", () => {
    expect(statusOf(card({ status: "maybe" }))).toBe("maybe");
    expect(statusOf(card({ status: "later" }))).toBeUndefined();
  });
  it("a card looks cut when it or its list is", () => {
    expect(looksCut(card({ status: "cut" }), list())).toBe(true);
    expect(looksCut(card(), list({ status: "cut" }))).toBe(true);
    expect(looksCut(card({ status: "keep" }), list())).toBe(false);
  });
  it("shows a check circle only in a list with checks, on normal cards", () => {
    expect(checkOf(card({ check: "green" }), list())).toBeUndefined();
    expect(checkOf(card(), list({ hasChecks: true }))).toBe("none");
    expect(checkOf(card({ check: "red" }), list({ hasChecks: true }))).toBe("red");
    expect(checkOf(card({ kind: "note" }), list({ hasChecks: true }))).toBeUndefined();
  });
});
