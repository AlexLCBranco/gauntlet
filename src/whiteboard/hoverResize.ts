import { Box, Vec, atom, getCursor, react, type Editor, type StateNode, type TLPointerEventInfo, type TLShape } from "tldraw";

import { CORNER_PX, EDGE_PX, HANDLE_CURSOR, edgeHit, type ResizeHandle } from "./edgeHit";

// Resize from the edge of an item that isn't selected, as in Excalidraw
// (owner, hand-test round item 3): pointing at an edge or corner shows the
// matching resize cursor at once, and a press-and-drag there selects the
// item and resizes it in the same drag. tldraw does this only for what is
// already selected (its resize handles), so the select tool's Idle state is
// wrapped on this editor's instance: after tldraw's own hover, a pointer
// move looks for an unselected item's edge under the pointer; a press there
// is handed to tldraw as a press on that item's resize handle.

/** Items whose box is what you see: shapes and widgets. Lines, arrows and
    freehand strokes are resized from their selection only. */
const RESIZED_BY_EDGE = new Set(["geo", "text", "image", "video", "boardkit-board", "linkkit-map", "note", "frame", "embed", "bookmark", "group"]);

/** A press on these (a widget's own buttons and fields) is the control's,
    never a resize. */
const CONTROLS = "button, input, textarea, select, a, [contenteditable='true'], [data-add], [data-control]";

type Hit = { shape: TLShape; handle: ResizeHandle; rotation: number };

/** The unselected item whose edge or corner is under this page point,
    topmost first; an item drawn over the point hides the ones below. */
function hitAt(editor: Editor, point: { x: number; y: number }): Hit | null {
  const zoom = editor.getZoomLevel();
  const edge = EDGE_PX / zoom;
  const corner = CORNER_PX / zoom;
  const near = editor.getShapeIdsInsideBounds(new Box(point.x - edge, point.y - edge, edge * 2, edge * 2));
  if (near.size === 0) return null;
  const selected = new Set(editor.getSelectedShapeIds());
  const seen = new Set<string>();
  const sorted = editor.getCurrentPageShapesSorted();
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (!near.has(sorted[i].id)) continue;
    const shape = editor.getOutermostSelectableShape(sorted[i]);
    if (seen.has(shape.id)) continue;
    seen.add(shape.id);
    if (shape.isLocked || selected.has(shape.id) || !RESIZED_BY_EDGE.has(shape.type)) {
      if (editor.isPointInShape(sorted[i], point, { hitInside: false, margin: 0 })) return null;
      continue;
    }
    if (editor.getShapeUtil(shape).hideResizeHandles(shape)) continue;
    const transform = editor.getShapePageTransform(shape.id);
    const local = transform.clone().invert().applyToPoint(point);
    const where = edgeHit(local, editor.getShapeGeometry(shape).bounds, edge, corner);
    if (where === null) continue;
    if (where === "inside") {
      // A filled item hides edges below it; an outline-only one doesn't.
      if (editor.isPointInShape(shape, point, { hitInside: false, margin: 0 })) return null;
      continue;
    }
    return { shape, handle: where, rotation: transform.rotation() };
  }
  return null;
}

function onControl(editor: Editor): boolean {
  const { x, y } = editor.inputs.getCurrentScreenPoint();
  const box = editor.getContainer().getBoundingClientRect();
  const el = document.elementFromPoint(box.x + x, box.y + y);
  return !!el?.closest(CONTROLS);
}

/** The cursors tldraw's useCursor draws from its own CSS variables. */
const STATIC_CURSORS = new Set(["default", "pointer", "cross", "comment", "move", "grab", "grabbing", "text", "zoom-in", "zoom-out"]);

/** Shows a resize cursor (or, with null, tldraw's own again) straight on
    the container, as tldraw's useCursor does: going through
    editor.setCursor changes the instance state, and at every edge crossed
    that cost a frame or two (hover-speed check in perf.e2e.ts). The
    container's `data-edge-cursor` says which one shows (for the e2e). */
function showCursor(editor: Editor, hit: Hit | null) {
  const container = editor.getContainer();
  if (hit) {
    const type = HANDLE_CURSOR[hit.handle];
    const { cursor } = editor.getCurrentTheme().colors[editor.getColorMode()];
    container.style.setProperty("--tl-cursor", getCursor(type, hit.rotation, cursor));
    container.dataset.edgeCursor = type;
    return;
  }
  const { type, rotation } = editor.getInstanceState().cursor;
  const { cursor } = editor.getCurrentTheme().colors[editor.getColorMode()];
  container.style.setProperty("--tl-cursor", STATIC_CURSORS.has(type) ? `var(--tl-cursor-${type})` : getCursor(type, rotation, cursor));
  delete container.dataset.edgeCursor;
}

/** Whether the select tool, at rest, would drag something from this page
    point: the body of an unlocked item tldraw hovers (its own hit test, the
    one a press uses), or anywhere inside the current selection. */
function grabbable(editor: Editor): boolean {
  const hovered = editor.getHoveredShape();
  if (hovered && !hovered.isLocked) return true;
  if (editor.getSelectedShapes().every((s) => s.isLocked)) return false;
  const bounds = editor.getSelectionRotatedPageBounds();
  if (!bounds) return false;
  const rotation = editor.getSelectionRotation();
  const p = Vec.RotWith(editor.inputs.getCurrentPagePoint(), bounds.point, -rotation);
  return bounds.containsPoint(p);
}

/** The move cursor over an item, as in Excalidraw (owner, 2026-10-22):
    with the select tool at rest, the four-arrow cursor shows whenever the
    pointer is over something a press would drag, selected or not. Through
    tldraw's own cursor state (editor.setCursor), so tldraw's other cursors
    (a selection handle's resize, space-bar panning, text editing, other
    tools) are left alone: it only ever swaps "default" and "move". An edge
    resize cursor (`edge`) wins over it. Returns a stop function. */
function moveCursor(editor: Editor, edge: { get(): string | null }): () => void {
  return react("move cursor", () => {
    if (!editor.isIn("select.idle") || edge.get() || editor.overlays.getHoveredOverlayId()) return;
    const { type } = editor.getInstanceState().cursor;
    if (type !== "default" && type !== "move") return;
    const next = grabbable(editor) && !onControl(editor) ? "move" : "default";
    if (next !== type) editor.setCursor({ type: next, rotation: 0 });
  });
}

/** Turns edge resizing, and the move cursor over items, on for this
    editor. Returns a stop function. */
export function hoverResize(editor: Editor): () => void {
  const idle = editor.getStateDescendant("select.idle") as (StateNode & Record<string, unknown>) | undefined;
  if (!idle) return () => {};
  const originalMove = idle.onPointerMove as (info: TLPointerEventInfo) => void;
  const originalDown = idle.onPointerDown as (info: TLPointerEventInfo) => void;
  const originalExit = idle.onExit as (info: unknown, to: string) => void;
  // The cursor this sets (a key: shape, handle, rotation), or null. Kept so
  // that a pointer move costs no cursor change and no DOM lookup unless
  // what is under the pointer changed (hover-speed check in perf.e2e.ts).
  // An atom, so that the move cursor stands aside while it shows.
  const edge = atom<string | null>("edge cursor", null);
  let control = false;
  const stopMoveCursor = moveCursor(editor, edge);

  const move = function (this: StateNode, info: TLPointerEventInfo) {
    originalMove.call(this, info);
    const showing = edge.get();
    if (editor.overlays.getHoveredOverlayId()) {
      if (showing) delete editor.getContainer().dataset.edgeCursor;
      edge.set(null);
      return;
    }
    const hit = info.shiftKey || info.ctrlKey || info.altKey ? null : hitAt(editor, editor.inputs.getCurrentPagePoint());
    const key = hit ? `${hit.shape.id} ${hit.handle} ${hit.rotation}` : null;
    if (key && key !== showing) control = onControl(editor);
    if (key && !control) {
      if (key !== showing) showCursor(editor, hit);
      edge.set(key);
    } else if (showing) {
      showCursor(editor, null);
      edge.set(null);
    }
  };
  const exit = function (this: StateNode, info: unknown, to: string) {
    originalExit.call(this, info, to);
    if (edge.get()) {
      edge.set(null);
      // The next state sets its own cursor; this one must not stay over it.
      queueMicrotask(() => showCursor(editor, null));
    }
  };
  const down = function (this: StateNode & { onPointerDown: (info: TLPointerEventInfo) => void }, info: TLPointerEventInfo) {
    if ((info.target === "canvas" || info.target === "shape") && !info.shiftKey && !info.ctrlKey && !info.altKey && info.button === 0) {
      const hit = hitAt(editor, editor.inputs.getCurrentPagePoint());
      if (hit && !onControl(editor)) {
        edge.set(null);
        delete editor.getContainer().dataset.edgeCursor;
        editor.select(hit.shape.id);
        this.onPointerDown({ ...info, target: "selection", handle: hit.handle } as TLPointerEventInfo);
        return;
      }
    }
    originalDown.call(this, info);
  };
  Object.defineProperty(idle, "onPointerMove", { value: move, configurable: true, writable: true });
  Object.defineProperty(idle, "onPointerDown", { value: down, configurable: true, writable: true });
  Object.defineProperty(idle, "onExit", { value: exit, configurable: true, writable: true });
  return () => {
    stopMoveCursor();
    Object.defineProperty(idle, "onExit", { value: originalExit, configurable: true, writable: true });
    Object.defineProperty(idle, "onPointerMove", { value: originalMove, configurable: true, writable: true });
    Object.defineProperty(idle, "onPointerDown", { value: originalDown, configurable: true, writable: true });
  };
}
