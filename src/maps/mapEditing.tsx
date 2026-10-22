import { useLayoutEffect } from "react";
import { atom, useValue, type Editor, type StateNode, type TLPointerEventInfo, type TLShapeId } from "tldraw";

import { doubleClickOnWhiteboardMap } from "./linkkit";
import { useMapList } from "./mapList";

// Editing a map: the whole page is the map's space, and it's obvious that a
// map is being edited (owner, hand-test round item 7; replaces the 120 px
// band). While a map widget, or a board's linked map, is edited:
// - a double-click anywhere on empty page space adds a box to that map
//   there (Linkkit puts it at the nearest free spot, and the widget grows
//   to it); dragging a box anywhere is Linkkit's (useBoxGestures);
// - a single click on empty page space ends editing, but only once no
//   second click came (the double-click window), so double-clicking empty
//   space always adds a box; Escape or a click on another item end it
//   as before;
// - everything else on the page is dimmed, the map is outlined, and a
//   label at the top says what's going on.

/** The map being edited: the widget (a map, or a board showing its linked
    map) and the map's id. */
export const editedMap = atom<{ shapeId: TLShapeId; mapId: string } | null>("map being edited", null);

/** Says, while `value` is set, that this widget's map is being edited. */
export function useEditedMap(value: { shapeId: TLShapeId; mapId: string } | null) {
  const shapeId = value?.shapeId;
  const mapId = value?.mapId;
  useLayoutEffect(() => {
    if (!shapeId || !mapId) return;
    editedMap.set({ shapeId, mapId });
    return () => {
      if (editedMap.get()?.shapeId === shapeId) editedMap.set(null);
    };
  }, [shapeId, mapId]);
}

/** Two presses this close in time (ms) and place (screen px) are a
    double-click (Windows' own defaults). */
const DOUBLE_MS = 500;
const DOUBLE_PX = 8;

/** Turns the above on for this editor. Returns a stop function. */
export function mapEditing(editor: Editor): () => void {
  const state = editor.getStateDescendant("select.editing_shape") as (StateNode & Record<string, unknown>) | undefined;
  if (!state) return () => {};
  const originalDown = state.onPointerDown as ((info: TLPointerEventInfo) => void) | undefined;
  const originalDouble = state.onDoubleClick as ((info: unknown) => void) | undefined;
  let first: { at: number; x: number; y: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const forget = () => {
    clearTimeout(timer);
    first = null;
  };

  /** A press on empty page space while a map is edited (no item under it). */
  const onEmpty = (info: { target?: string; point?: { x: number; y: number } }) => {
    const edited = editedMap.get();
    if (!edited || info.target !== "canvas" || editor.getEditingShapeId() !== edited.shapeId) return null;
    const at = editor.inputs.getCurrentPagePoint();
    if (editor.getShapeAtPoint(at, { hitInside: false, margin: editor.getHitTestMargin() })) return null;
    return edited;
  };

  const down = function (this: StateNode, info: TLPointerEventInfo) {
    const edited = info.button === 0 && !info.shiftKey && !info.ctrlKey && !info.altKey ? onEmpty(info) : null;
    if (!edited) {
      forget();
      // A press on another item ends editing the map and is that item's,
      // as on the whiteboard anywhere else (tldraw would start editing it
      // instead, if it has text).
      const map = editedMap.get();
      if (map && info.target === "shape" && info.shape.id !== map.shapeId && editor.getEditingShapeId() === map.shapeId) {
        editor.setEditingShape(null);
        this.parent.transition("idle", info);
        this.parent.getCurrent()?.handleEvent(info);
        return;
      }
      return originalDown?.call(this, info);
    }
    const box = editor.getContainer().getBoundingClientRect();
    const p = { x: box.left + info.point.x, y: box.top + info.point.y, at: performance.now() };
    if (first && p.at - first.at <= DOUBLE_MS && Math.hypot(p.x - first.x, p.y - first.y) <= DOUBLE_PX) {
      // The second click: a box there, still editing. Made on the browser's
      // own double-click, after this click ends, as on Linkkit's paper: made
      // now, this click's end would close its empty name field (a click
      // away keeps what was typed, and an empty new box just closes).
      forget();
      let made = false;
      const make = () => {
        window.removeEventListener("dblclick", make, true);
        clearTimeout(fallback);
        if (made) return;
        made = true;
        doubleClickOnWhiteboardMap(edited.mapId, p.x, p.y);
      };
      window.addEventListener("dblclick", make, true);
      const fallback = setTimeout(make, DOUBLE_MS);
      return;
    }
    // The first click: editing ends once no second one came.
    forget();
    first = p;
    timer = setTimeout(() => {
      first = null;
      if (editor.getEditingShapeId() !== edited.shapeId) return;
      editor.setEditingShape(null);
      editor.setCurrentTool("select.idle");
      editor.selectNone();
    }, DOUBLE_MS);
  };
  // tldraw's own double-click on empty space (it would end editing): the
  // presses above already made the box.
  const double = function (this: StateNode, info: TLPointerEventInfo) {
    if (onEmpty(info)) return;
    return originalDouble?.call(this, info);
  };

  Object.defineProperty(state, "onPointerDown", { value: down, configurable: true, writable: true });
  Object.defineProperty(state, "onDoubleClick", { value: double, configurable: true, writable: true });
  return () => {
    forget();
    Object.defineProperty(state, "onPointerDown", { value: originalDown, configurable: true, writable: true });
    Object.defineProperty(state, "onDoubleClick", { value: originalDouble, configurable: true, writable: true });
  };
}

/** While a map is edited: everything else dimmed, and the label at the top
    of the screen, under the toolbar (maps.css). */
export function MapEditingBar() {
  const edited = useValue("map being edited", () => editedMap.get(), []);
  const name = useMapList().find((m) => m.id === edited?.mapId)?.name ?? "";
  if (!edited) return null;
  return (
    <>
      <style>{`.tl-shape:not([data-shape-id="${CSS.escape(edited.shapeId)}"]) { opacity: 0.25 !important; }`}</style>
      <div className="gm-editing-bar" role="status" data-testid="map-editing-bar">
        Editing map “{name}” — double-click anywhere to add a box · Esc to finish
      </div>
    </>
  );
}
