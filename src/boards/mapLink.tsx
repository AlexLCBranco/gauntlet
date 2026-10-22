import { useEffect, useState } from "react";
import { useEditor, type Editor, type TLShapeId } from "tldraw";

import { createLinkedWhiteboardMap, restoreWhiteboardMapRecord, unlinkWhiteboardMap } from "../maps/linkkit";
import { linkedMapNow } from "../maps/linkedMap";
import type { BoardShape } from "./BoardShape";

// A board and its Linkkit map, made visible and one click away (owner,
// hand-test round item 8): pickers mark linked boards and maps (badges
// below); an unlinked board widget offers "Add map view" on hover; a
// linked one has "⋯" > "Unlink map", one undo step.

const mapIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    <rect x="1" y="1.5" width="5" height="3.5" rx="1" />
    <rect x="8" y="9" width="5" height="3.5" rx="1" />
    <path d="M3.5 5v3.5a2 2 0 0 0 2 2H8" />
  </svg>
);
const boardIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    <rect x="1" y="2" width="3.5" height="10" rx="0.8" />
    <rect x="5.5" y="2" width="3.5" height="7" rx="0.8" />
    <rect x="10" y="2" width="3" height="4.5" rx="0.8" />
  </svg>
);

/** In the Board picker: this board has a linked map. */
export const MapBadge = () => (
  <span className="gb-badge" data-testid="linked-map-badge">
    {mapIcon}+ map
  </span>
);

/** In the Map picker: this map is linked to a board. */
export const BoardBadge = () => (
  <span className="gb-badge" data-testid="linked-board-badge">
    {boardIcon}+ board
  </span>
);

/** A press on a control in the widget: the control's, not the start of a
    drag or a select on the whiteboard. */
const own = (editor: Editor) => ({
  onPointerDown: (e: React.PointerEvent) => editor.markEventAsHandled(e),
  onPointerUp: (e: React.PointerEvent) => editor.markEventAsHandled(e),
});

/**
 * "Add map view", beside an unlinked board's name, shown as the name is (on
 * hover, or while selected). One click makes a new Linkkit map linked to
 * the board (createLinkedWhiteboardMap), and the widget gets its
 * "List | Map | Both" switch.
 */
export function AddMapView({ shapeId, boardId }: { shapeId: TLShapeId; boardId: string }) {
  const editor = useEditor();
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => {
    if (!refused) return;
    const t = setTimeout(() => setRefused(null), 6000);
    return () => clearTimeout(t);
  }, [refused]);
  return (
    <span className="gb-addmap-wrap">
      <button
        type="button"
        className="gb-addmap"
        data-control="add-map-view"
        data-testid="add-map-view"
        {...own(editor)}
        onClick={(e) => {
          editor.markEventAsHandled(e);
          if (editor.getEditingShapeId() === shapeId) editor.setEditingShape(null);
          const made = createLinkedWhiteboardMap(boardId);
          if ("refused" in made) setRefused(made.refused);
          editor.select(shapeId);
        }}
      >
        {mapIcon}Add map view
      </button>
      {refused && (
        <span className="gb-addmap-refused" role="status">
          {refused}
        </span>
      )}
    </span>
  );
}

/** The record of each map unlinked here, until the page goes: what an undo
    puts back (`meta.unlinkedMap` on the board widget names it). */
const records = new Map<string, string>();
let unlinks = 0;

/**
 * "⋯" beside a linked board's switch, with "Unlink map": the map becomes
 * an ordinary Linkkit map and the board an ordinary board (Linkkit's own
 * "Unlink from Boardkit"); the widget shows the list. One undo step: Ctrl+Z
 * links them again (keepUnlinksUndoable).
 */
export function BoardMenu({ shapeId, mapId }: { shapeId: TLShapeId; mapId: string }) {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(".gb-menu")) setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);
  return (
    <span className="gb-menu">
      <button
        type="button"
        className="gb-menu-button"
        aria-label="Board menu"
        aria-expanded={open}
        data-control="board-menu"
        data-testid="board-menu"
        {...own(editor)}
        onClick={(e) => {
          editor.markEventAsHandled(e);
          setOpen(!open);
        }}
      >
        ⋯
      </button>
      {open && (
        <span className="gb-menu-list" role="menu">
          <button
            type="button"
            role="menuitem"
            data-testid="unlink-map"
            {...own(editor)}
            onClick={(e) => {
              editor.markEventAsHandled(e);
              setOpen(false);
              unlinkMap(editor, shapeId, mapId);
            }}
          >
            Unlink map
          </button>
        </span>
      )}
    </span>
  );
}

function unlinkMap(editor: Editor, shapeId: TLShapeId, mapId: string) {
  const shape = editor.getShape<BoardShape>(shapeId);
  if (!shape) return;
  if (editor.getEditingShapeId() === shapeId) editor.setEditingShape(null);
  const record = unlinkWhiteboardMap(mapId);
  if (record === null) return;
  const token = `unlink:${++unlinks}`;
  records.set(token, record);
  editor.markHistoryStoppingPoint("unlink map");
  editor.updateShape<BoardShape>({ id: shapeId, type: shape.type, meta: { ...shape.meta, view: "list", unlinkedMap: { mapId, token } } });
  editor.select(shapeId);
}

type Unlinked = { mapId: string; token: string } | undefined;
const unlinkedOf = (shape: BoardShape): Unlinked => {
  const u = shape.meta?.unlinkedMap as Unlinked;
  return u && typeof u.mapId === "string" && typeof u.token === "string" ? u : undefined;
};

/**
 * Undo and redo of "Unlink map": when a board widget's `meta.unlinkedMap`
 * goes away (undo), the map's record from before is put back, linked
 * again; when it comes back (redo), the map is unlinked again. Returns a
 * stop function.
 */
export function keepUnlinksUndoable(editor: Editor): () => void {
  return editor.sideEffects.registerAfterChangeHandler("shape", (prev, next) => {
    if (next.type !== "boardkit-board") return;
    const before = unlinkedOf(prev as BoardShape);
    const after = unlinkedOf(next as BoardShape);
    if (before?.token === after?.token) return;
    const boardId = (next as BoardShape).props.boardId;
    if (before && !after) {
      const record = records.get(before.token);
      if (record && linkedMapNow(boardId) === null) restoreWhiteboardMapRecord(before.mapId, record);
    } else if (after && !before && linkedMapNow(boardId) === after.mapId) {
      const record = unlinkWhiteboardMap(after.mapId);
      if (record !== null) records.set(after.token, record);
    }
  });
}
