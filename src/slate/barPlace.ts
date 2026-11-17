// Pure, no calendarkit; tested in barPlace.test.ts.

/** Room between the bar and the widget: clear of its resize zones
    (pages/edges.ts: 8 px out, corners 11). */
export const BAR_GAP = 14;

type Rect = { left: number; top: number; right: number; bottom: number };

/** Where the bar (`w` x `h`) goes for a widget whose screen box is `b`:
    the first spot inside the window that covers no floating control,
    above its top-left corner or under its bottom-left; else just inside
    its top-left. Unless the bar there would reach the widget's right
    resize zone (GT-7's notes button made it wider than a small widget):
    then beside it (right, then left), and with no free spot one clear of
    the widget even if it covers a control. */
export function barPlace(b: { x: number; y: number; r: number; b: number }, w: number, h: number, win: { w: number; h: number }, avoid: Rect[]) {
  const left = Math.max(4, Math.min(b.x, win.w - w - 4));
  const top = Math.max(4, b.y);
  const above = { left, top: b.y - BAR_GAP - h };
  const below = { left, top: b.b + BAR_GAP };
  const inside = { left, top: top + BAR_GAP };
  const right = { left: b.r + BAR_GAP, top };
  const leftOf = { left: b.x - BAR_GAP - w, top };
  const insideClear = left + w <= b.r - BAR_GAP;
  const inWindow = (s: { left: number; top: number }) => s.left >= 4 && s.left + w <= win.w - 4 && s.top >= 4 && s.top + h <= win.h - 4;
  const free = (s: { left: number; top: number }) => !avoid.some((c) => c.left < s.left + w && c.right > s.left && c.top < s.top + h && c.bottom > s.top);
  if (insideClear) return [above, below].find((s) => inWindow(s) && free(s)) ?? inside;
  const spots = [above, below, right, leftOf];
  return spots.find((s) => inWindow(s) && free(s)) ?? spots.find(inWindow) ?? inside;
}
