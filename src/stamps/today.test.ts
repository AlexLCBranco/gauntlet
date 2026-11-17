import { describe, expect, it } from "vitest";

import { todayLabel } from "./today";

// São Paulo is UTC-3 all year (no daylight saving since 2019).
const at = (iso: string) => Date.parse(iso);

describe("GT-3: today's date stamp", () => {
  it("day/month without leading zeros", () => {
    expect(todayLabel(at("2026-11-04T15:00:00Z"))).toBe("4/11");
    expect(todayLabel(at("2026-01-09T15:00:00Z"))).toBe("9/1");
    expect(todayLabel(at("2026-12-25T15:00:00Z"))).toBe("25/12");
  });
  it("São Paulo's date, not UTC's: just after midnight there it is already the next day", () => {
    // 00:05 on 5 Nov in São Paulo = 03:05 UTC.
    expect(todayLabel(at("2026-11-05T03:05:00Z"))).toBe("5/11");
    // 23:55 on 4 Nov in São Paulo = 02:55 UTC on the 5th: still the 4th there.
    expect(todayLabel(at("2026-11-05T02:55:00Z"))).toBe("4/11");
    // New Year's Eve, just before and after midnight there.
    expect(todayLabel(at("2027-01-01T02:59:00Z"))).toBe("31/12");
    expect(todayLabel(at("2027-01-01T03:00:00Z"))).toBe("1/1");
  });
  it("another time zone when asked", () => {
    expect(todayLabel(at("2026-11-05T02:55:00Z"), "UTC")).toBe("5/11");
  });
});
