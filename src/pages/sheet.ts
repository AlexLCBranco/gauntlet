// The fixed page ("sheet") and page-to-page steps. Pure, no tldraw;
// tested in sheet.test.ts.

/** A move, in page units. */
type Delta = { x: number; y: number };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The page's size before the whiteboard is sized to the window (pages
    used to be this fixed 16:9 sheet; content made then sits inside it).
    The real page is `pageBox` (keepFilled.ts): the window's shape. */
export const SHEET: Box = { x: 0, y: 0, w: 1920, h: 1080 };

/** How far `b` must move to sit inside `sheet` (the page). Something bigger than the
    sheet lines up with its top or left edge. */
export function insideDelta(b: Box, sheet: Box = SHEET): Delta {
  const axis = (pos: number, size: number, min: number, room: number) => {
    if (size >= room || pos < min) return min - pos;
    if (pos + size > min + room) return min + room - (pos + size);
    return 0;
  };
  return { x: axis(b.x, b.w, sheet.x, sheet.w), y: axis(b.y, b.h, sheet.y, sheet.h) };
}

/** The pages in order, and which comes after `current`: an existing page, or
    "create" on the last page (the "next" arrow then makes a new one). */
export function nextPage<T>(pages: readonly T[], current: T): { go: T } | "create" {
  const i = pages.indexOf(current);
  return i >= 0 && i + 1 < pages.length ? { go: pages[i + 1] } : "create";
}

/** The page before `current`, or null on the first. */
export function previousPage<T>(pages: readonly T[], current: T): T | null {
  const i = pages.indexOf(current);
  return i > 0 ? pages[i - 1] : null;
}
