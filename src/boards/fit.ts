// How big a board sits on the page. Pure; tested in fit.test.ts.
//
// A board is drawn at its natural size (Boardkit's list widths, every card
// shown) and scaled as a whole, like a picture: `scale` is the only size
// the user sets (by dragging a corner). Its box on the page is natural size
// x scale, so it grows when cards are added, but never past the page: a
// board that would overflow shrinks to fit (nothing sits across two pages).

import type { Box } from "../pages/sheet";

type Size = { w: number; h: number };

/** A board placed new (`scale` 0) with no `room` given starts at full
    size, or smaller if that wouldn't fit in most of the sheet. */
const FIRST_ROOM = 0.9;

/** `room` (pages/arrive.ts): the most a board placed new may measure, so
    it arrives inside the window at 100% (speed session Part 3). */
export function fitBoard(natural: Size, scale: number, sheet: Pick<Box, "w" | "h">, room?: Size): { scale: number; w: number; h: number } {
  const nw = Math.max(1, natural.w);
  const nh = Math.max(1, natural.h);
  const most = Math.min(sheet.w / nw, sheet.h / nh);
  let s = scale;
  if (!(s > 0)) s = room ? Math.min(1, room.w / nw, room.h / nh) : Math.min(1, most * FIRST_ROOM);
  if (s > most) s = most;
  return { scale: s, w: nw * s, h: nh * s };
}
