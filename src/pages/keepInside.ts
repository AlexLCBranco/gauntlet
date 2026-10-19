import type { Editor, TLShapePartial } from "tldraw";

import { pageBox } from "./keepFilled";
import { insideDelta, SHEET } from "./sheet";

/** Moves every shape on the current page that pokes past the page's edge
    back inside it. Returns how many moved. */
export function pullInside(editor: Editor): number {
  const page = pageBox.get() ?? SHEET;
  const updates: TLShapePartial[] = [];
  for (const id of editor.getSortedChildIdsForParent(editor.getCurrentPageId())) {
    const shape = editor.getShape(id);
    const b = shape && editor.getShapePageBounds(shape);
    if (!shape || !b) continue;
    const d = insideDelta({ x: b.x, y: b.y, w: b.w, h: b.h }, page);
    if (d.x !== 0 || d.y !== 0) updates.push({ id, type: shape.type, x: shape.x + d.x, y: shape.y + d.y });
  }
  if (updates.length > 0) editor.updateShapes(updates);
  return updates.length;
}

/** "Nothing sits across two pages": after each change the user makes
    (once the pointer is up and nothing is being typed, so a drag or a
    stroke isn't fought mid-way), anything past the page's edge slides back
    in. The slide joins the change's own undo step. Returns a stop function. */
export function keepInsideSheet(editor: Editor): () => void {
  let dirty = true;
  const stopListening = editor.store.listen(() => (dirty = true), { source: "user", scope: "document" });
  const onTick = () => {
    if (!dirty || editor.inputs.getIsPointing() || editor.getEditingShapeId()) return;
    dirty = false;
    pullInside(editor);
  };
  editor.on("tick", onTick);
  return () => {
    stopListening();
    editor.off("tick", onTick);
  };
}
