import { describe, expect, it } from "vitest";

import { isSlateDate, slateDateLabel, slateToday } from "./today";

describe("a new Slate widget's date", () => {
  it("is the date in São Paulo, not UTC's or the NBA's", () => {
    // 23:30 in São Paulo (UTC-3) is already the next day in UTC.
    expect(slateToday(Date.parse("2026-11-01T02:30:00Z"))).toBe("2026-10-31");
    expect(slateToday(Date.parse("2026-11-01T03:00:00Z"))).toBe("2026-11-01");
  });
  it("labels and checks dates", () => {
    expect(slateDateLabel("2026-10-31")).toBe("Sat, Oct 31, 2026");
    expect(isSlateDate("2026-10-31")).toBe(true);
    expect(isSlateDate("31/10/2026")).toBe(false);
    expect(isSlateDate(undefined)).toBe(false);
  });
});
