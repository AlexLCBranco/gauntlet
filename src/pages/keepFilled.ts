import type { Editor } from "tldraw";

import { SHEET } from "./sheet";

/** "100%": the whole page fits the window, centred. (tldraw's resetZoom toggles:
    when already there it jumps to its own 100%, so it isn't used.) */
export function fillWindow(editor: Editor) {
  const z = editor.getBaseZoom();
  const v = editor.getViewportScreenBounds();
  editor.setCamera({ x: v.w / (2 * z) - (SHEET.x + SHEET.w / 2), y: v.h / (2 * z) - (SHEET.y + SHEET.h / 2), z });
}

/** At "100%" the whole page stays in view when the window changes
    size; zoomed in, the zoom stays as it is. Returns a stop function. */
export function keepFilled(editor: Editor): () => void {
  let size = "";
  let atFill = true;
  const onTick = () => {
    const v = editor.getViewportScreenBounds();
    const now = `${v.w}x${v.h}`;
    if (now !== size) {
      size = now;
      if (atFill) fillWindow(editor);
    }
    atFill = Math.abs(editor.getZoomLevel() / editor.getBaseZoom() - 1) < 1e-3;
  };
  editor.on("tick", onTick);
  return () => editor.off("tick", onTick);
}
