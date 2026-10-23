import { getArrowBindings, type Editor, type TLArrowShape, type TLLineShape, type TLShape } from "tldraw";

/**
 * Lines and arrows drawn close to horizontal or vertical come out exactly
 * straight, no key needed (owner, toolbar rework step 4). Holding Shift is
 * tldraw's own snap to 15° steps (diagonals included) and is left alone.
 */

/** How far off horizontal or vertical still snaps straight. */
export const STRAIGHT_DEGREES = 5;

type Pt = { x: number; y: number };

/** `to` brought onto the horizontal or vertical through `from` when within
    `degrees` of it, else unchanged: the end stays level with the pointer
    along the line (as when it slides on a ruler). `rotation` is the
    shape's own (radians): straight means straight on the page. Pure. */
export function snapStraight(from: Pt, to: Pt, rotation = 0, degrees = STRAIGHT_DEGREES): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return to;
  // On the page.
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const px = dx * cos - dy * sin;
  const py = dx * sin + dy * cos;
  const off = Math.atan2(Math.min(Math.abs(px), Math.abs(py)), Math.max(Math.abs(px), Math.abs(py)));
  if (off > (degrees * Math.PI) / 180) return to;
  const [sx, sy] = Math.abs(px) >= Math.abs(py) ? [px, 0] : [0, py];
  if (rotation === 0) return { x: from.x + sx, y: from.y + sy };
  // Back into the shape's own space.
  return { x: from.x + sx * cos + sy * sin, y: from.y - sx * sin + sy * cos };
}

/** The point being dragged and the one it's measured from, when a line or
    arrow end moved between `prev` and `next`. */
function movedEnd(editor: Editor, prev: TLShape, next: TLShape): { from: Pt; to: Pt; set: (p: Pt) => TLShape } | null {
  if (next.type === "arrow") {
    const a = next as TLArrowShape;
    const p = prev as TLArrowShape;
    if (a.props.bend !== 0) return null;
    const bindings = getArrowBindings(editor, a);
    for (const [end, other] of [["end", "start"], ["start", "end"]] as const) {
      const moved = a.props[end].x !== p.props[end].x || a.props[end].y !== p.props[end].y;
      if (!moved || bindings[end] || bindings[other]) continue;
      return { from: a.props[other], to: a.props[end], set: (pt) => ({ ...a, props: { ...a.props, [end]: pt } }) };
    }
    return null;
  }
  if (next.type === "line") {
    const l = next as TLLineShape;
    const p = prev as TLLineShape;
    const ordered = Object.values(l.props.points).sort((x, y) => (x.index < y.index ? -1 : 1));
    const i = ordered.findIndex((pt) => {
      const was = p.props.points[pt.id];
      return !was || was.x !== pt.x || was.y !== pt.y;
    });
    if (i < 0 || ordered.length < 2) return null;
    const from = ordered[i === 0 ? 1 : i - 1];
    const moving = ordered[i];
    return {
      from,
      to: moving,
      set: (pt) => ({ ...l, props: { ...l.props, points: { ...l.props.points, [moving.id]: { ...moving, x: pt.x, y: pt.y } } } }),
    };
  }
  return null;
}

/** While a line or arrow end is dragged (drawing one, or moving its end)
    without Shift, it snaps straight. */
export function straightLines(editor: Editor): () => void {
  return editor.sideEffects.registerBeforeChangeHandler("shape", (prev, next) => {
    if (!editor.isIn("select.dragging_handle") || editor.inputs.getShiftKey()) return next;
    const end = movedEnd(editor, prev, next);
    if (!end) return next;
    const snapped = snapStraight(end.from, end.to, next.rotation);
    return snapped === end.to ? next : end.set(snapped);
  });
}
