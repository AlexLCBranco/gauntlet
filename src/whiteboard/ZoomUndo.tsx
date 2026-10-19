import { useEditor, useValue } from "tldraw";

import { zoomPercent } from "../pages/camera";
import { zoomTo100 } from "../pages/keepFilled";
import "./chrome.css";

const keepFocus = (e: React.PointerEvent) => e.preventDefault();

const icon = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const UNDO = "M7.5 10.833 4.167 7.5 7.5 4.167M4.167 7.5h9.166a3.333 3.333 0 0 1 0 6.667H12.5";
const REDO = "M12.5 10.833 15.833 7.5 12.5 4.167M15.833 7.5H6.667a3.333 3.333 0 1 0 0 6.667H7.5";

/** Bottom-left, as in Excalidraw: zoom out / "100%" / zoom in, then undo
    and redo. 100% is one page unit per screen pixel; clicking it goes back. */
export function ZoomUndo() {
  const editor = useEditor();
  const percent = useValue("zoom percent", () => zoomPercent(editor.getZoomLevel()), [editor]);
  const canUndo = useValue("can undo", () => editor.getCanUndo(), [editor]);
  const canRedo = useValue("can redo", () => editor.getCanRedo(), [editor]);
  const readonly = useValue("readonly", () => editor.getIsReadonly(), [editor]);
  const run = (fn: () => void) => () => {
    fn();
    editor.focus();
  };
  if (readonly) return null;
  return (
    <div className="gauntlet-zoom-undo">
      <div className="gauntlet-island" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" title="Zoom out (Ctrl -)" onPointerDown={keepFocus} onClick={run(() => editor.zoomOut())}>
          −
        </button>
        <button
          type="button"
          className="gauntlet-zoom-undo__percent"
          data-testid="zoom-percent"
          title="Reset zoom to 100% (Shift 0)"
          onPointerDown={keepFocus}
          onClick={run(() => zoomTo100(editor))}
        >
          {percent}%
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in (Ctrl +)" onPointerDown={keepFocus} onClick={run(() => editor.zoomIn())}>
          +
        </button>
      </div>
      <div className="gauntlet-island" role="group" aria-label="History">
        <button type="button" aria-label="Undo" title="Undo (Ctrl Z)" disabled={!canUndo} onPointerDown={keepFocus} onClick={run(() => editor.undo())}>
          {icon(UNDO)}
        </button>
        <button type="button" aria-label="Redo" title="Redo (Ctrl Shift Z)" disabled={!canRedo} onPointerDown={keepFocus} onClick={run(() => editor.redo())}>
          {icon(REDO)}
        </button>
      </div>
    </div>
  );
}
