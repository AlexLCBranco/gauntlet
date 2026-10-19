import { atom, type Editor } from "tldraw";

import { pageForWindow } from "./camera";
import type { Box } from "./sheet";

/** The current page, in page units: the window's shape, as big as the
    window (at zoom 1) or as what's on it, whichever is bigger (see
    pageForWindow). null until the whiteboard is set up. */
export const pageBox = atom<Box | null>("page box", null);

/** How far right and down the current page's content reaches. */
function contentEnd(editor: Editor) {
  const b = editor.getCurrentPageBounds();
  return { x: Math.max(0, b?.maxX ?? 0), y: Math.max(0, b?.maxY ?? 0) };
}

/** Sizes the page to the window and what's on it, and limits the camera to
    it. Skipped while the window has no size (an embedded pane mid-layout). */
export function sizePage(editor: Editor) {
  const v = editor.getViewportScreenBounds();
  if (!(v.w >= 1 && v.h >= 1)) return;
  const { box } = pageForWindow({ w: v.w, h: v.h }, contentEnd(editor));
  pageBox.set(box);
  const opts = editor.getCameraOptions();
  editor.setCameraOptions({ ...opts, constraints: { ...opts.constraints!, bounds: box } });
}

/** "100%": the page fills the window. (tldraw's resetZoom toggles: when
    already there it jumps to its own 100%, so it isn't used.) */
export function fillWindow(editor: Editor) {
  sizePage(editor);
  const box = pageBox.get();
  if (!box) return;
  const z = editor.getBaseZoom();
  const v = editor.getViewportScreenBounds();
  editor.setCamera({ x: v.w / (2 * z) - (box.x + box.w / 2), y: v.h / (2 * z) - (box.y + box.h / 2), z });
}

/** The page follows the window: when it changes size (or another page is
    shown) the page is sized again; at "100%" it fills the window again,
    zoomed in the zoom stays as it is. Content arriving from another tab
    that reaches past the page grows it (never moved in). Returns a stop
    function. */
export function keepFilled(editor: Editor): () => void {
  let size = "";
  let pageId = editor.getCurrentPageId();
  let atFill = true;
  const resize = () => {
    if (atFill) fillWindow(editor);
    else sizePage(editor);
  };
  const onTick = () => {
    const v = editor.getViewportScreenBounds();
    const now = `${v.w}x${v.h}`;
    if (now !== size || editor.getCurrentPageId() !== pageId) {
      size = now;
      pageId = editor.getCurrentPageId();
      resize();
    }
    const base = editor.getBaseZoom();
    atFill = Math.abs(editor.getZoomLevel() / base - 1) < 1e-3;
  };
  // Synchronous, so the page covers it before anything pulls shapes inside.
  const stopListening = editor.store.listen(
    () => {
      const box = pageBox.get();
      const end = contentEnd(editor);
      if (box && (end.x > box.x + box.w + 0.5 || end.y > box.y + box.h + 0.5)) resize();
    },
    { source: "remote", scope: "document" },
  );
  editor.on("tick", onTick);
  return () => {
    stopListening();
    editor.off("tick", onTick);
  };
}
