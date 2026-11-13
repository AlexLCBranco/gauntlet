import { describe, expect, it } from "vitest";

import { isSlateDate, slateDateLabel, slateToday, stepSlateDate } from "./today";

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

describe("← / → on a Slate widget (step 3)", () => {
  it("steps one calendar day, across months and years", () => {
    expect(stepSlateDate("2026-11-13", 1)).toBe("2026-11-14");
    expect(stepSlateDate("2026-11-13", -1)).toBe("2026-11-12");
    expect(stepSlateDate("2026-11-30", 1)).toBe("2026-12-01");
    expect(stepSlateDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(stepSlateDate("2027-03-01", -1)).toBe("2027-02-28");
  });
  it("stays within the season when its first and last game days are known", () => {
    const [first, last] = ["2026-10-20", "2027-06-20"];
    expect(stepSlateDate(first, -1, first, last)).toBe(first);
    expect(stepSlateDate(last, 1, first, last)).toBe(last);
    expect(stepSlateDate("2026-10-21", -1, first, last)).toBe(first);
    // a widget pinned outside the season comes back into it, never further out
    expect(stepSlateDate("2026-08-01", 1, first, last)).toBe(first);
    expect(stepSlateDate("2026-08-01", -1, first, last)).toBe("2026-08-01");
    expect(stepSlateDate("2027-08-01", -1, first, last)).toBe(last);
  });
  it("leaves a date it can't read alone", () => {
    expect(stepSlateDate("", 1)).toBe("");
  });
});
