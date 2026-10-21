import type { TLShape } from "tldraw";

import { editingHalf, viewOf } from "../boards/views";
import { linkedMapNow } from "./linkedMap";

/** The Linkkit map a widget being edited has open in Linkkit's store, if
    any: a map widget's (MapShape.tsx, type "linkkit-map"), or a board
    widget's linked map while its map is edited (its Map view, or the map
    half of Both). Linkkit opens one map at a time. */
export function mapEditedBy(shape: TLShape): string | null {
  if (shape.type === "linkkit-map") return (shape.props as { mapId: string }).mapId;
  if (shape.type !== "boardkit-board") return null;
  const view = viewOf(shape);
  const half = editingHalf.get();
  const onMap = view === "map" || (view === "both" && half?.shapeId === shape.id && half.half === "map");
  return onMap ? linkedMapNow((shape.props as { boardId: string }).boardId) : null;
}
