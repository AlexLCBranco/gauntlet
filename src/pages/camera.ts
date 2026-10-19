// The camera on the page. Pure, no tldraw; tested in camera.test.ts.

import type { Box } from "./sheet";

type Size = { w: number; h: number };
type Point = { x: number; y: number };

/** The page for a window: the window's own shape, so it fills the window
    edge to edge with no bars. At "100%" one page unit is one screen pixel,
    unless what's on the page reaches further right or down (`contentEnd`,
    e.g. drawn in a bigger window): then the page is zoomed out just enough
    to hold it. Nothing on the page moves; the page only grows to cover it.
    `zoom` is the camera zoom at which the page fills the window. */
export function pageForWindow(viewport: Size, contentEnd: Point): { box: Box; zoom: number } {
  const zoom = Math.min(1, viewport.w / Math.max(1, contentEnd.x), viewport.h / Math.max(1, contentEnd.y));
  // max(): viewport / (viewport / end) can round a hair below `end`, and a
  // shape on the edge would then be nudged inside.
  return { box: { x: 0, y: 0, w: Math.max(viewport.w / zoom, contentEnd.x), h: Math.max(viewport.h / zoom, contentEnd.y) }, zoom };
}

/** The zoom shown to the owner, as a whole percentage of "100%". */
export function zoomPercent(zoom: number, base: number): number {
  return Math.round((zoom / base) * 100);
}
