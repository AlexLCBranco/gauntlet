import { Box as TlBox, Vec, type Editor, type StateNode, type TLShapeId, type TLShapePartial, type VecLike } from "tldraw";

import { pageBox } from "./keepFilled";
import { insideDelta, SHEET, type Box } from "./sheet";

// The page's edges are a wall DURING a drag, not only after the drop: what
// is dragged (one shape, a widget, a multi-selection) stops at the edge and
// slides along it; a resize handle stops at the edge; a line's end and a pen
// stroke stop at it. keepInside.ts still pulls back anything else (a paste,
// a nudge with the arrow keys) once the pointer is up.
//
// tldraw has no hook for this, so the select tool's Translating and
// Resizing states are wrapped on this editor's instances, and the pointer's
// page point is held inside the page while a handle or a stroke is drawn.

const page = (): Box => pageBox.get() ?? SHEET;

/** The common page bounds of these shapes. */
function boundsOf(editor: Editor, ids: TLShapeId[]): Box | null {
  const all = ids.map((id) => editor.getShapePageBounds(id)).filter((b): b is TlBox => !!b);
  if (all.length === 0) return null;
  const b = TlBox.Common(all);
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

const inside = (b: Box, p: Box, slack = 0.01) =>
  b.x >= p.x - slack && b.y >= p.y - slack && b.x + b.w <= p.x + p.w + slack && b.y + b.h <= p.y + p.h + slack;

const clampPoint = (pt: VecLike, p: Box) => new Vec(Math.min(Math.max(pt.x, p.x), p.x + p.w), Math.min(Math.max(pt.y, p.y), p.y + p.h));

/** Moves these shapes together, as one, just back inside the page. */
function slideInside(editor: Editor, ids: TLShapeId[]) {
  const b = boundsOf(editor, ids);
  if (!b) return;
  const d = insideDelta(b, page());
  if (d.x === 0 && d.y === 0) return;
  const updates: TLShapePartial[] = [];
  for (const id of ids) {
    const shape = editor.getShape(id);
    const at = shape && editor.getShapePageTransform(id)?.point();
    if (!shape || !at) continue;
    const local = editor.getPointInParentSpace(shape, { x: at.x + d.x, y: at.y + d.y });
    updates.push({ id, type: shape.type, x: local.x, y: local.y });
  }
  editor.updateShapes(updates);
}

/** Replaces a (decorator-bound) method on one state instance. */
function wrap(state: object, name: string, make: (original: () => void) => () => void) {
  const original = (state as Record<string, unknown>)[name];
  if (typeof original !== "function") return () => {};
  Object.defineProperty(state, name, { value: make(original.bind(state)), configurable: true, writable: true });
  return () => Object.defineProperty(state, name, { value: original, configurable: true, writable: true });
}

/** Turns the wall on for this editor. Returns a stop function. */
export function edgeWall(editor: Editor): () => void {
  // A page point the pointer is held at (a resize being fitted), or null.
  let forced: Vec | null = null;
  const inputs = editor.inputs;
  const realPagePoint = inputs.getCurrentPagePoint.bind(inputs);
  const heldStates = ["select.dragging_handle", "draw.drawing", "highlight.drawing"];
  inputs.getCurrentPagePoint = () => {
    if (forced) return forced;
    const p = realPagePoint();
    return heldStates.some((s) => editor.isIn(s)) ? clampPoint(p, page()) : p;
  };

  type Translating = { snapshot: { movingShapes?: { id: TLShapeId }[] } };
  const translating = editor.getStateDescendant("select.translating") as (StateNode & Translating) | undefined;
  const unwrapTranslating = translating
    ? wrap(translating, "updateShapesIgnoringExternalChanges", (original) => () => {
        original();
        // Inside tldraw's "ignore changes" block, so the slide isn't taken
        // for someone else's edit (which would re-anchor the drag on it).
        slideInside(editor, (translating.snapshot.movingShapes ?? []).map((s) => s.id));
      })
    : () => {};

  type Resizing = {
    snapshot?: { selectedShapeIds: TLShapeId[]; cursorHandleOffset: Vec; originPagePoint: Vec };
    creationCursorOffset?: VecLike;
  };
  const resizing = editor.getStateDescendant("select.resizing") as (StateNode & Resizing) | undefined;
  const unwrapResizing = resizing
    ? wrap(resizing, "_updateShapes", (original) => () => {
        const pointer = realPagePoint().clone();
        original();
        const snap = resizing.snapshot;
        if (!snap) return;
        const p = page();
        const ok = () => {
          const b = boundsOf(editor, snap.selectedShapeIds);
          return !b || inside(b, p);
        };
        if (ok()) return;
        // Exactly on the edge (resize maths can land a hair past it).
        const settle = () => slideInside(editor, snap.selectedShapeIds);
        const at = (pt: Vec) => {
          forced = pt;
          try {
            original();
          } finally {
            forced = null;
          }
        };
        // The handle is held at the edge (it follows the pointer by a fixed
        // offset): a free resize slides along the edge.
        const offset = Vec.Add(snap.cursorHandleOffset, resizing.creationCursorOffset ?? { x: 0, y: 0 });
        const held = Vec.Add(clampPoint(Vec.Sub(pointer, offset), p), offset);
        at(held);
        if (ok()) return settle();
        // Still out (a locked aspect grows the other way too, or rotated
        // shapes): the furthest point on the way from where the drag began.
        const from = snap.originPagePoint;
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 16; i++) {
          const mid = (lo + hi) / 2;
          at(Vec.Lrp(from, held, mid));
          if (ok()) lo = mid;
          else hi = mid;
        }
        at(Vec.Lrp(from, held, lo));
        settle();
      })
    : () => {};

  return () => {
    unwrapTranslating();
    unwrapResizing();
    delete (inputs as { getCurrentPagePoint?: unknown }).getCurrentPagePoint;
  };
}
