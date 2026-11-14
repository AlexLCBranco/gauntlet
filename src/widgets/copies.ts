import type { Editor, TLRecord, TLShape } from "tldraw";

import { deleteWhiteboardBoard, readWhiteboardBoard, writeWhiteboardBoard } from "../boards/boardkit";
import { BOARD_TYPE, type BoardShape } from "../boards/BoardShape";
import { registryChanged } from "../boards/registry";
import { linkedMapNow } from "../maps/linkedMap";
import { copyWhiteboardMap, deleteWhiteboardMap, linkedMaps, readWhiteboardMap, writeWhiteboardMap } from "../maps/linkkit";
import { mapListChanged } from "../maps/mapList";
import { MAP_TYPE, type MapShape } from "../maps/MapShape";
import { undoingOrRedoing } from "../whiteboard/pageUndo";

/**
 * Copies are independent (speed session Part 6, owner 2026-11-12): a board
 * or map widget copied INSIDE the whiteboard (copy and paste, Ctrl+D, an
 * Alt-drag, a page duplicated) shows a new board or map with its own data,
 * made by Boardkit's and Linkkit's own code ("X (copy)"); a linked board and
 * map are copied as a new linked pair, whichever of the two widgets is
 * copied. A copy is a widget made while another widget still shows that
 * board or map: never one placed from the pickers or pasted from the apps
 * (the live board itself, `placingLive`), nor one an undo or redo brings
 * back, nor a cut widget pasted again (it moves).
 *
 * One undo takes the copy away, its data too: a copy's board and map leave
 * Boardkit and Linkkit when its widget leaves the whiteboard and nothing
 * else shows them, if they are still exactly as copied (anything done to
 * them since keeps them, as for any board). A redo, or an undo of the
 * widget's delete, puts them back as they were, same ids.
 *
 * A copied Slate needs nothing here: its night and size are its own props,
 * its games come from the schedule.
 */

/** A copy's data as made: what is compared before it is taken back, and
    written back on a redo. Board and map of a pair go together. */
interface Made {
  board?: { readonly id: string; readonly name: string; readonly kept: string; readonly record: NonNullable<ReturnType<typeof readWhiteboardBoard>> };
  map?: { readonly id: string; readonly kept: string; readonly record: NonNullable<ReturnType<typeof readWhiteboardMap>> };
  /** Taken back (its widget gone): to write back if the widget returns. */
  taken: boolean;
}

let live = 0;
/** Runs `create` as a placing of the live board or map itself (the pickers,
    a paste from the apps, "+ New"): never a copy. */
export function placingLive<T>(create: () => T): T {
  live++;
  try {
    return create();
  } finally {
    live--;
  }
}

const isBoard = (r: TLRecord): r is BoardShape => r.typeName === "shape" && (r as TLShape).type === BOARD_TYPE;
const isMap = (r: TLRecord): r is MapShape => r.typeName === "shape" && (r as TLShape).type === MAP_TYPE;

const dataOf = (r: TLRecord) => (isBoard(r) ? r.props.boardId : isMap(r) ? r.props.mapId : null);

const boardKept = (id: string) => JSON.stringify(readWhiteboardBoard(id as never));
/** A map as the owner made it: its layout (where the boxes sit, the page
    it was tidied on) left out, since Linkkit lays a map out again when it
    is drawn, and showing the copy is not a change to it. */
const LAYOUT = new Set(["x", "y", "page", "shift", "rev"]);
const mapKept = (id: string) => JSON.stringify(readWhiteboardMap(id), (k, v) => (LAYOUT.has(k) ? undefined : v));

/** Keeps copies independent. Returns a stop function. */
export function keepCopiesIndependent(editor: Editor): () => void {
  /** By board or map id: the copies made here this session. */
  const made = new Map<string, Made>();
  /** Within one paste or duplicate (one change), the copy already made for
      an original: a board and its map widget copied together are one pair. */
  let batch: Map<string, string> | null = null;
  const inBatch = () => {
    if (!batch) {
      batch = new Map();
      queueMicrotask(() => (batch = null));
    }
    return batch;
  };

  /** Boards and maps of widgets just cut (Ctrl+X): pasted again, they are
      the same live board or map, moved, whatever else shows them. */
  const cut = new Set<string>();
  const onCut = (e: Event) => {
    if (e instanceof KeyboardEvent && !((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x")) return;
    if (editor.getEditingShapeId()) return;
    cut.clear();
    for (const shape of editor.getSelectedShapes()) {
      const id = dataOf(shape);
      if (id) cut.add(id);
    }
  };
  window.addEventListener("keydown", onCut, true);
  window.addEventListener("cut", onCut, true);
  /** Not a copy: a widget the pickers place, an undo or redo brings back,
      or one cut and now pasted. */
  const isLive = (id: string) => {
    if (!cut.has(id)) return false;
    queueMicrotask(() => cut.delete(id));
    return true;
  };

  const records = () => editor.store.allRecords();
  /** Whether a widget on any page shows board `id` (a board widget). */
  const boardShown = (id: string, except?: string) => records().some((r) => isBoard(r) && r.id !== except && r.props.boardId === id);
  /** Whether a widget shows map `id` (a map widget, or a board widget
      whose linked map it is). */
  const mapShown = (id: string, except?: string) =>
    records().some((r) => r.id !== except && ((isMap(r) && r.props.mapId === id) || (isBoard(r) && linkedMapNow(r.props.boardId) === id)));
  const boardOfMap = (mapId: string) => Object.entries(linkedMaps()).find(([, m]) => m === mapId)?.[0] ?? null;

  /** A copy of board `from` (and of its linked map): the new board's id. */
  const copyBoard = (from: string): string | null => {
    const b = inBatch();
    const done = b.get(`board:${from}`);
    if (done) return done;
    const read = readWhiteboardBoard(from as never);
    if (!read) return null;
    const id = writeWhiteboardBoard(`${read.name} (copy)`, read.board);
    if (!id) return null;
    registryChanged();
    const entry: Made = { board: { id, name: `${read.name} (copy)`, kept: boardKept(id), record: readWhiteboardBoard(id)! }, taken: false };
    made.set(id, entry);
    b.set(`board:${from}`, id);
    const fromMap = linkedMapNow(from);
    if (fromMap) {
      const m = copyWhiteboardMap(fromMap, id);
      if (m) {
        mapListChanged();
        entry.map = { id: m.id, kept: mapKept(m.id), record: readWhiteboardMap(m.id)! };
        made.set(m.id, entry);
        b.set(`map:${fromMap}`, m.id);
      }
    }
    return id;
  };
  /** A copy of map `from` (with its board, if linked): the new map's id. */
  const copyMap = (from: string): string | null => {
    const b = inBatch();
    const done = b.get(`map:${from}`);
    if (done) return done;
    const board = boardOfMap(from);
    if (board) {
      copyBoard(board);
      return b.get(`map:${from}`) ?? null;
    }
    const m = copyWhiteboardMap(from);
    if (!m) return null;
    mapListChanged();
    made.set(m.id, { map: { id: m.id, kept: mapKept(m.id), record: readWhiteboardMap(m.id)! }, taken: false });
    b.set(`map:${from}`, m.id);
    return m.id;
  };

  const stopBefore = editor.sideEffects.registerBeforeCreateHandler("shape", (shape, source) => {
    if (source !== "user" || live > 0 || undoingOrRedoing()) return shape;
    if (isBoard(shape) && shape.props.boardId && !isLive(shape.props.boardId) && boardShown(shape.props.boardId, shape.id)) {
      const id = copyBoard(shape.props.boardId);
      return id ? { ...shape, props: { ...shape.props, boardId: id } } : shape;
    }
    if (isMap(shape) && shape.props.mapId && !isLive(shape.props.mapId) && mapShown(shape.props.mapId, shape.id)) {
      const id = copyMap(shape.props.mapId);
      return id ? { ...shape, props: { ...shape.props, mapId: id } } : shape;
    }
    return shape;
  });


  const stopDelete = editor.sideEffects.registerAfterDeleteHandler("shape", (shape, source) => {
    if (source !== "user") return;
    const entry = made.get(dataOf(shape) ?? "");
    if (!entry || entry.taken) return;
    // After the whole change: a page cleared removes every widget at once.
    queueMicrotask(() => {
      const { board, map } = entry;
      if (entry.taken || (board && (boardShown(board.id) || boardKept(board.id) !== board.kept))) return;
      if (map && (mapShown(map.id) || mapKept(map.id) !== map.kept)) return;
      // The map first: a linked map without its board turns into a tree.
      if (map) deleteWhiteboardMap(map.id);
      if (board) deleteWhiteboardBoard(board.id as never);
      entry.taken = true;
      registryChanged();
      mapListChanged();
    });
  });

  const stopCreate = editor.sideEffects.registerAfterCreateHandler("shape", (shape, source) => {
    if (source !== "user") return;
    const entry = made.get(dataOf(shape) ?? "");
    if (!entry?.taken) return;
    entry.taken = false;
    if (entry.board) writeWhiteboardBoard(entry.board.name, entry.board.record.board, entry.board.id as never);
    if (entry.map) writeWhiteboardMap(entry.map.record);
    registryChanged();
    mapListChanged();
  });

  return () => {
    window.removeEventListener("keydown", onCut, true);
    window.removeEventListener("cut", onCut, true);
    stopBefore();
    stopDelete();
    stopCreate();
  };
}
