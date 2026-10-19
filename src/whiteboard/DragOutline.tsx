import { useEditor, useValue } from "tldraw";

/** Screen gap between what's moving and the outline, as in Excalidraw. */
const GAP = 6;

/** While something is being dragged, a rectangle outline around it, as
    Excalidraw shows (tldraw hides its selection box mid-drag). */
export function DragOutline() {
  const editor = useEditor();
  const rect = useValue(
    "drag outline",
    () => {
      if (!editor.isIn("select.translating")) return null;
      const b = editor.getSelectionPageBounds();
      if (!b) return null;
      const a = editor.pageToViewport({ x: b.minX, y: b.minY });
      const z = editor.getZoomLevel();
      return { left: a.x - GAP, top: a.y - GAP, width: b.w * z + GAP * 2, height: b.h * z + GAP * 2 };
    },
    [editor],
  );
  if (!rect) return null;
  return <div className="gauntlet-drag-outline" data-testid="drag-outline" style={rect} />;
}
