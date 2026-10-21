import { useEditor, type TLShapeId } from "tldraw";

import type { BoardShape } from "./BoardShape";
import { viewOf, type BoardView } from "./views";

const VIEWS: readonly { readonly view: BoardView; readonly label: string }[] = [
  { view: "list", label: "List" },
  { view: "map", label: "Map" },
  { view: "both", label: "Both" },
];

/**
 * "List | Map | Both", next to the board's name, for a board that has a
 * linked Linkkit map (owner, 2026-10-21): shown on hover or while selected,
 * as the name. The choice is the widget's (`meta.view`), one undo step.
 */
export function ViewSwitch({ shapeId, view }: { shapeId: TLShapeId; view: BoardView }) {
  const editor = useEditor();
  const choose = (next: BoardView) => {
    const shape = editor.getShape<BoardShape>(shapeId);
    if (!shape || viewOf(shape) === next) return;
    // Editing ends: what is edited is about to change.
    if (editor.getEditingShapeId() === shapeId) editor.setEditingShape(null);
    editor.markHistoryStoppingPoint("board view");
    editor.updateShape<BoardShape>({ id: shapeId, type: shape.type, meta: { ...shape.meta, view: next } });
    editor.select(shapeId);
  };
  return (
    <div className="gb-switch" role="group" aria-label="Show" data-testid="view-switch">
      {VIEWS.map(({ view: v, label }) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          data-view={v}
          // The widget lets presses through to the whiteboard: this one is
          // the switch's, not the start of a drag.
          onPointerDown={(e) => editor.markEventAsHandled(e)}
          onPointerUp={(e) => editor.markEventAsHandled(e)}
          onClick={(e) => {
            editor.markEventAsHandled(e);
            choose(v);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
