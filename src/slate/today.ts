// Pure, no calendarkit; tested in today.test.ts.

/** The owner's time zone (2026-10-31): "today" for a new Slate widget and
    the tip-off times on its cards. */
export const SLATE_TIME_ZONE = "America/Sao_Paulo";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The date (YYYY-MM-DD) it is at `now` in `timeZone`: what a Slate widget
    inserted then is pinned to. The same rule as calendarkit's Slate
    (`localDate`): the local calendar date, not the NBA's Eastern one. */
export function slateToday(now: number = Date.now(), timeZone: string = SLATE_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const isSlateDate = (s: unknown): s is string => typeof s === "string" && DAY.test(s);

/** "Sat, Oct 31, 2026": the date as the widget's placeholders show it. */
export function slateDateLabel(date: string): string {
  if (!isSlateDate(date)) return date;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}
