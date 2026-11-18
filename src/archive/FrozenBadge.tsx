import type { SyntheticEvent } from "react";
import { useEditor, useValue, type TLShape } from "tldraw";

import { useInExport } from "../whiteboard/exportStyles";
import { canGoLive, frozenOf, goLive } from "./archive";
import { dayMonth } from "./format";
import "./archive.css";

/**
 * GT-10: a frozen widget's badge, just above its top-right corner: "Frozen
 * 4/11" (the day the file was saved) and "Go live", which shows the live
 * board, map or schedule again (one undo step). Not in images of the page.
 */
export function FrozenBadge({ shape }: { shape: TLShape }) {
  const editor = useEditor();
  const inExport = useInExport();
  const frozen = frozenOf(shape);
  const live = useValue("frozen widget can go live", () => (frozen ? canGoLive(editor.getShape(shape.id) ?? shape) : false), [editor, shape, frozen]);
  if (!frozen || inExport) return null;
  const own = (e: SyntheticEvent) => {
    e.stopPropagation();
    editor.markEventAsHandled(e);
  };
  return (
    <div className="ga-frozen" data-testid="frozen-badge" data-kind={frozen.kind} onPointerDown={own} onPointerUp={own} onDoubleClick={own}>
      <span title={`A copy of this widget as it was on ${dayMonth(frozen.savedAt)}: edits stay in it, the live data is never touched`}>Frozen {dayMonth(frozen.savedAt)}</span>
      <button
        type="button"
        data-testid="go-live"
        disabled={!live}
        title={live ? "Show the live data again (Ctrl+Z puts the frozen copy back)" : "The live board or map no longer exists"}
        onClick={(e) => {
          own(e);
          goLive(editor, shape.id);
          editor.getContainer().focus({ preventScroll: true });
        }}
      >
        Go live
      </button>
    </div>
  );
}
