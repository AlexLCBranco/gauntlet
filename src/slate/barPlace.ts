// Pure, no calendarkit; tested in barPlace.test.ts.

/** Room between the bar and the widget: clear of its resize zones
    (pages/edges.ts: 8 px out, corners 11). */
export const BAR_GAP = 14;

/** Where the bar (`w` x `h`) goes for a widget whose screen box is `b`:
    above its top-left corner; else under its bottom-left; else just inside
    its top-left: the first inside the window that covers no floating
    control. */
export function barPlace(b: { x: number; y: number; r: number; b: number }, w: number, h: number, win: { w: number; h: number }, avoid: { left: number; top: number; right: number; bottom: number }[]) {
  const left = Math.max(4, Math.min(b.x, win.w - w - 4));
  const spots = [b.y - BAR_GAP - h, b.b + BAR_GAP, Math.max(4, b.y) + BAR_GAP];
  const fits = (top: number) =>
    top >= 4 && top + h <= win.h - 4 && !avoid.some((c) => c.left < left + w && c.right > left && c.top < top + h && c.bottom > top);
  return { left, top: spots.find(fits) ?? spots[2]! };
}
