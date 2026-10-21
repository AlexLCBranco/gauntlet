import { atom, type TLShape, type TLShapeId } from "tldraw";

/**
 * A board whose Boardkit board has a linked Linkkit map is one widget that
 * shows its list, its map, or both side by side (owner, 2026-10-21). Which
 * is the widget's own choice, kept in its `meta.view` (so it survives a
 * reload, and a widget made before has the list).
 */
export type BoardView = "list" | "map" | "both";

export const viewOf = (shape: Pick<TLShape, "meta">): BoardView => {
  const view = shape.meta?.view;
  return view === "map" || view === "both" ? view : "list";
};

/** In "both", which half is being edited: the one double-clicked (or
    pressed while the other was edited). */
export const editingHalf = atom<{ readonly shapeId: TLShapeId; readonly half: "list" | "map" } | null>("half being edited", null);
