import type { Editor, TLRecord } from "tldraw";

import { createWhiteboardMap, deleteEmptyWhiteboardMap } from "./linkkit";
import { mapListChanged } from "./mapList";
import { MAP_TYPE, type MapShape } from "./MapShape";

const isMap = (r: TLRecord): r is MapShape => r.typeName === "shape" && (r as MapShape).type === MAP_TYPE;

/**
 * A map made with "+ New map" (its widget's `meta.newMap`: the name it was
 * made with) that is still empty (no boxes, nothing in its trash, never
 * renamed) is deleted from Linkkit too when its widget leaves the
 * whiteboard: its creation undone, the widget deleted, its page cleared,
 * as boards do (boards/emptyNewBoards.ts). Not while another widget still
 * shows it, and never Linkkit's last map. If the widget comes back (redo,
 * undo of the delete), the map is made again with the same id. A map with
 * anything in it is never deleted: the widget goes, the map stays in
 * Linkkit. Returns a stop function.
 */
export function takeBackEmptyNewMaps(editor: Editor): () => void {
  const taken = new Set<string>();
  const shown = (mapId: string) => editor.store.allRecords().some((r) => isMap(r) && r.props.mapId === mapId);
  const stopDelete = editor.sideEffects.registerAfterDeleteHandler("shape", (shape, source) => {
    if (source !== "user" || !isMap(shape) || typeof shape.meta?.newMap !== "string") return;
    const { mapId } = shape.props;
    const name = shape.meta.newMap;
    // After the whole change: a page cleared removes every widget at once.
    queueMicrotask(() => {
      if (shown(mapId) || !deleteEmptyWhiteboardMap(mapId, name)) return;
      taken.add(mapId);
      mapListChanged();
    });
  });
  const stopCreate = editor.sideEffects.registerAfterCreateHandler("shape", (shape, source) => {
    if (source !== "user" || !isMap(shape) || !taken.has(shape.props.mapId)) return;
    taken.delete(shape.props.mapId);
    const name = typeof shape.meta?.newMap === "string" ? shape.meta.newMap : "";
    createWhiteboardMap({ id: shape.props.mapId, name });
    mapListChanged();
  });
  return () => {
    stopDelete();
    stopCreate();
  };
}
