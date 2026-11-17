// Pure, no tldraw; tested in today.test.ts.
//
// GT-3: the stamps tray's "today's date" item. The owner makes a board
// every day and types the date by hand as day/month ("4/11"): one click
// drops it as plain text, in the owner's time zone (the Slate's), fixed
// once dropped.

import { SLATE_TIME_ZONE } from "../slate/today";

/** Today at `now` in `timeZone`, as day/month without leading zeros: "4/11". */
export function todayLabel(now: number = Date.now(), timeZone: string = SLATE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "numeric" }).formatToParts(now);
  const day = parts.find((p) => p.type === "day")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  return `${Number(day)}/${Number(month)}`;
}
