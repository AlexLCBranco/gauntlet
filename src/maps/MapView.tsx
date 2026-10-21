import { useEffect, useRef } from "react";
import { useEditor, type Editor } from "tldraw";

import { portalEventsHandled } from "../whiteboard/widgetEvents";
import { mapTakesEscape, WhiteboardMap, type PageRect } from "./linkkit";

/** The paper shown round the boxes while the map is edited, side by side
    (Linkkit's own amount if not given). */
type Room = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };

/**
 * A Linkkit map inside a widget (a map placed on its own, or a board's
 * linked map in its Map or Both view): Linkkit's own drawing, and, while
 * it is edited, what happens inside it is Linkkit's, not the whiteboard's.
 */
export function MapView({ mapId, editing, onContent, room }: { mapId: string; editing: boolean; onContent?: (box: PageRect) => void; room?: Room }) {
  const editor = useEditor();
  const box = useRef<HTMLDivElement>(null);
  useEditingEvents(editor, box, editing);
  useRenameWhereDoubleClicked(box, editing);
  return (
    <div
      ref={box}
      className="gm-map"
      {...portalEventsHandled(editor)}
      // A right-click inside the map being edited opens Linkkit's menu, not
      // the whiteboard's.
      onContextMenu={(e) => {
        if (editing || !e.currentTarget.contains(e.target as Node)) e.stopPropagation();
      }}
    >
      <WhiteboardMap mapId={mapId} editing={editing} onContent={onContent} room={room} />
    </div>
  );
}

/**
 * While editing, keys and presses inside the map are Linkkit's. Keys:
 * Delete must not delete the widget, arrows must not nudge it. Presses:
 * dragging a box must not move the widget, a double-click must not start
 * anything else. tldraw reads both on its container, before React; marking
 * them handled makes it skip them, while they still reach the page
 * (Linkkit's keys are read on the document, its drags follow the pointer
 * on the window). Escape still ends editing, unless Linkkit has a use for
 * it (typing, a selection or a drag to let go of, a menu, panel or
 * question to close).
 */
function useEditingEvents(editor: Editor, box: React.RefObject<HTMLDivElement | null>, editing: boolean) {
  useEffect(() => {
    if (!editing) return;
    const el = box.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || mapTakesEscape(e.target)) editor.markEventAsHandled(e);
    };
    const onPointer = (e: Event) => editor.markEventAsHandled(e);
    // Focus is often still the whiteboard's (a press on the map's paper
    // takes none): Escape is seen first here, before tldraw ends editing.
    const onLinkkitEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mapTakesEscape(e.target)) editor.markEventAsHandled(e);
    };
    // Keys that reach only the page (focus fell off a field or button that
    // went away) never reach tldraw: Escape still ends editing.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || editor.wasEventAlreadyHandled(e) || e.target !== document.body) return;
      editor.setEditingShape(null);
      editor.getContainer().focus({ preventScroll: true });
    };
    const pointerEvents = ["pointerdown", "pointerup", "click", "dblclick"] as const;
    el.addEventListener("keydown", onKey);
    el.addEventListener("keyup", onKey);
    for (const type of pointerEvents) el.addEventListener(type, onPointer);
    window.addEventListener("keydown", onLinkkitEscape, true);
    window.addEventListener("keydown", onEscape);
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("keyup", onKey);
      for (const type of pointerEvents) el.removeEventListener(type, onPointer);
      window.removeEventListener("keydown", onLinkkitEscape, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [editing, editor, box]);
}

/** The latest double-click on the page (window pixels), for the editing it
    starts. */
let lastDoubleClick: { x: number; y: number; at: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("dblclick", (e) => (lastDoubleClick = { x: e.clientX, y: e.clientY, at: performance.now() }), true);
}

/**
 * Editing began with a double-click on a box or an arrow's label: that
 * double-click does in place what it does in Linkkit (rename the box,
 * edit the label), once the map being edited is drawn.
 */
function useRenameWhereDoubleClicked(box: React.RefObject<HTMLDivElement | null>, editing: boolean) {
  useEffect(() => {
    if (!editing) return;
    const at = lastDoubleClick && performance.now() - lastDoubleClick.at < 800 ? lastDoubleClick : null;
    lastDoubleClick = null;
    if (!at) return;
    let frame = requestAnimationFrame(function find(tries = 0) {
      const ready = box.current?.querySelector('[data-linkkit-map][data-editing="true"] [data-ready]');
      if (!ready) {
        if (tries < 30) frame = requestAnimationFrame(() => find(tries + 1));
        return;
      }
      const hit = document.elementFromPoint(at.x, at.y);
      if (!hit || !box.current?.contains(hit) || !hit.closest("[data-box-id], [data-link-id]")) return;
      hit.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, box]);
}
