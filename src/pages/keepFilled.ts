import { atom, type Editor } from "tldraw";

import { coverZoom, pageForWindow, zoomSteps } from "./camera";
import type { Box } from "./sheet";

/** The current page, in page units: at least the window's size at 100%,
    and as big as what's on it (see pageForWindow). null until the
    whiteboard is set up. */
export const pageBox = atom<Box | null>("page box", null);

/** How far right and down the current page's content reaches. */
function contentEnd(editor: Editor) {
  const b = editor.getCurrentPageBounds();
  return { x: Math.max(0, b?.maxX ?? 0), y: Math.max(0, b?.maxY ?? 0) };
}

/** Sizes the page to the window and what's on it, and limits the camera to
    it: you pan only within the page, and zoom out only while the page
    still covers the window. The zoom and what's on screen stay as they are
    (only pulled back if the view would leave the page). Skipped while the
    window has no size (an embedded pane mid-layout). */
export function sizePage(editor: Editor) {
  const v = editor.getViewportScreenBounds();
  if (!(v.w >= 1 && v.h >= 1)) return;
  const box = pageForWindow({ w: v.w, h: v.h }, contentEnd(editor), editor.getZoomLevel());
  pageBox.set(box);
  const opts = editor.getCameraOptions();
  editor.setCameraOptions({
    ...opts,
    zoomSteps: zoomSteps(coverZoom({ w: v.w, h: v.h }, box)),
    constraints: { ...opts.constraints!, bounds: box },
  });
}

/** The page at `z` (100% by default) with its top-left corner in the
    window's top-left corner: how a page opens. */
export function showPageStart(editor: Editor, z = 1) {
  editor.setCamera({ x: 0, y: 0, z }, { force: true });
  sizePage(editor);
  const box = pageBox.get();
  if (box) editor.setCamera({ x: -box.x, y: -box.y, z });
}

/** "100%": one page unit per screen pixel, around the middle of the
    window. (tldraw's resetZoom toggles: when already there it jumps to its
    own fit, so it isn't used.) */
export function zoomTo100(editor: Editor) {
  const v = editor.getViewportScreenBounds();
  const c = editor.getViewportPageBounds().center;
  editor.setCamera({ x: v.w / 2 - c.x, y: v.h / 2 - c.y, z: 1 });
  sizePage(editor);
}

/** The page follows the window, as in Excalidraw: when the window changes
    size the zoom stays and what's on screen stays where it is (tldraw
    keeps the camera on a resize); a smaller window just shows less of the
    page. The page is sized again on every resize and page change. Content
    arriving from another tab that reaches past the page grows it (never
    moved in). Returns a stop function. */
export function keepFilled(editor: Editor): () => void {
  let size = "";
  let pageId = editor.getCurrentPageId();
  const onTick = () => {
    const v = editor.getViewportScreenBounds();
    const now = `${v.w}x${v.h}`;
    if (now !== size || editor.getCurrentPageId() !== pageId) {
      size = now;
      pageId = editor.getCurrentPageId();
      sizePage(editor);
    }
  };
  // Synchronous, so the page covers it before anything pulls shapes inside.
  const stopListening = editor.store.listen(
    () => {
      const box = pageBox.get();
      const end = contentEnd(editor);
      if (box && (end.x > box.x + box.w + 0.5 || end.y > box.y + box.h + 0.5)) sizePage(editor);
    },
    { source: "remote", scope: "document" },
  );
  editor.on("resize", onTick);
  editor.on("tick", onTick);
  return () => {
    stopListening();
    editor.off("resize", onTick);
    editor.off("tick", onTick);
  };
}
