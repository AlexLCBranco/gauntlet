// The camera on the page. Pure, no tldraw; tested in camera.test.ts.

import type { Box } from "./sheet";

type Size = { w: number; h: number };
type Point = { x: number; y: number };

/** The page for a window, as in Excalidraw: at least the window's size at
    100% (one page unit per screen pixel), so a big window has no bars, and
    always as big as what's on it (`contentEnd`, e.g. drawn in a bigger
    window), so a small window shows part of the page and you pan to the
    rest. The zoom never changes for this: zoomed out (`zoom` < 1, only
    possible on a page bigger than the window) the page covers the window
    at that zoom. Nothing on the page moves; the page only grows to cover
    it. */
export function pageForWindow(viewport: Size, contentEnd: Point, zoom = 1): Box {
  const z = Math.min(1, zoom);
  return { x: 0, y: 0, w: Math.max(viewport.w / z, contentEnd.x), h: Math.max(viewport.h / z, contentEnd.y) };
}

/** The furthest you can zoom out: the page still covers the whole window
    (no bars). 1 when the page is the window's size in either direction. */
export function coverZoom(viewport: Size, page: Box): number {
  return Math.min(1, Math.max(viewport.w / page.w, viewport.h / page.h));
}

/** Steps for zoom in / zoom out (buttons, Ctrl+ / Ctrl-): every 10%, as
    in Excalidraw, from `min` (coverZoom, the furthest zoom out) up to
    800%. Ctrl+wheel zooms smoothly, not by these steps. */
export function zoomSteps(min: number): number[] {
  const steps = Array.from({ length: 80 }, (_, i) => (i + 1) / 10);
  return [min, ...steps.filter((s) => s > min + 1e-6)];
}

/** The zoom shown to the owner, as a whole percentage: 100% is one page
    unit per screen pixel. */
export function zoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}
