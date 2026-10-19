// The camera on the fixed page. Pure, no tldraw; tested in camera.test.ts.

import type { Box } from "./sheet";

type Size = { w: number; h: number };

/** "100%": the zoom at which the whole sheet fits the window, centred.
    When the window isn't 16:9 the sheet fills it along one axis and dark
    bars show at the sides (or top and bottom) of the other; at 100%
    there is nothing to scroll to. */
export function fillZoom(viewport: Size, sheet: Box): number {
  return Math.min(viewport.w / sheet.w, viewport.h / sheet.h);
}

/** The zoom shown to the owner, as a whole percentage of "100%". */
export function zoomPercent(zoom: number, base: number): number {
  return Math.round((zoom / base) * 100);
}
