// The camera on the fixed page. Pure, no tldraw; tested in camera.test.ts.

import type { Box } from "./sheet";

type Size = { w: number; h: number };

/** "100%": the zoom at which the sheet fills the window exactly, edge to
    edge, so nothing outside it shows. When the window isn't 16:9 the
    sheet's other axis runs past the window and pans along that axis only. */
export function fillZoom(viewport: Size, sheet: Box): number {
  return Math.max(viewport.w / sheet.w, viewport.h / sheet.h);
}

/** The zoom shown to the owner, as a whole percentage of "100%". */
export function zoomPercent(zoom: number, base: number): number {
  return Math.round((zoom / base) * 100);
}
