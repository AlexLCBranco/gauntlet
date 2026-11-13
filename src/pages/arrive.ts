// "Nothing arrives too big" (owner, speed session Part 3): anything placed
// on the whiteboard (a pasted or inserted picture, a Slate, a board, a map)
// arrives with all four corners inside the visible window at 100% zoom, so
// a resize handle is always in reach without the browser's zoom.
// The pure rules are tested in arrive.test.ts.

import type { Editor } from "tldraw";

import { pageBox } from "./keepFilled";
import { insideDelta, SHEET, type Box } from "./sheet";

type Size = { w: number; h: number };

/** Share of the window something new may take at most, so its handles
    stay clear of the window's edges (toolbar, page arrows). */
export const ARRIVAL_ROOM = 0.9;

/** The most a new thing may measure, in page units: the window at 100%
    zoom (one page unit per screen pixel), times ARRIVAL_ROOM. */
export function roomForWindow(window: Size): Size {
  return { w: Math.max(1, window.w * ARRIVAL_ROOM), h: Math.max(1, window.h * ARRIVAL_ROOM) };
}

/** How much `size` shrinks to fit `room` (never grows): 1 when it fits. */
export function shrinkToFit(size: Size, room: Size): number {
  return Math.min(1, room.w / Math.max(1, size.w), room.h / Math.max(1, size.h));
}

/** Where something new may sit: the part of the page in view, pulled in
    by the window's spare margin ((1 - ARRIVAL_ROOM) / 2 on each side), so
    its corners are inside the window. `view` and `page` in page units. */
export function arrivalArea(view: Box, page: Box): Box {
  const x = Math.max(view.x, page.x);
  const y = Math.max(view.y, page.y);
  const r = Math.min(view.x + view.w, page.x + page.w);
  const b = Math.min(view.y + view.h, page.y + page.h);
  const w = Math.max(0, r - x);
  const h = Math.max(0, b - y);
  const mx = (w * (1 - ARRIVAL_ROOM)) / 2;
  const my = (h * (1 - ARRIVAL_ROOM)) / 2;
  return { x: x + mx, y: y + my, w: w - 2 * mx, h: h - 2 * my };
}

/** The window's size on screen (the canvas), in pixels. */
export function windowSize(editor: Editor): Size {
  const v = editor.getViewportScreenBounds();
  return { w: v.w || SHEET.w, h: v.h || SHEET.h };
}

/** The room a new thing has on this whiteboard now (see roomForWindow). */
export function arrivalRoom(editor: Editor): Size {
  return roomForWindow(windowSize(editor));
}

/** The area a new thing is placed in on this whiteboard now (arrivalArea). */
export function arrivalAreaNow(editor: Editor): Box {
  const v = editor.getViewportPageBounds();
  return arrivalArea({ x: v.x, y: v.y, w: v.w, h: v.h }, pageBox.get() ?? SHEET);
}

// Pictures: tldraw's own file handler puts a pasted, dropped or inserted
// picture (or video) at its full size, centred on the cursor or the view.
// While that handler runs (placingPictures), a new picture is made no
// bigger than the room, and its move to the cursor stops inside the
// window, all in the paste's own undo step; tldraw then never needs to
// zoom out to show it.

let placing = 0;
const placed = new Set<string>();
const isPicture = (type: string) => type === "image" || type === "video";

/** Runs tldraw's file handler (`run`) with the picture rule on. */
export async function placingPictures<T>(run: () => Promise<T>): Promise<T> {
  placing++;
  try {
    return await run();
  } finally {
    if (--placing === 0) placed.clear();
  }
}

/** The picture rule (see placingPictures). Returns a stop function. */
export function picturesArriveInside(editor: Editor): () => void {
  const stopCreate = editor.sideEffects.registerBeforeCreateHandler("shape", (shape) => {
    if (placing === 0 || !isPicture(shape.type) || shape.parentId !== editor.getCurrentPageId()) return shape;
    const props = shape.props as { w: number; h: number };
    const s = shrinkToFit(props, arrivalRoom(editor));
    placed.add(shape.id);
    if (s >= 1) return shape;
    return { ...shape, props: { ...props, w: props.w * s, h: props.h * s } } as typeof shape;
  });
  const stopChange = editor.sideEffects.registerBeforeChangeHandler("shape", (prev, next) => {
    if (placing === 0 || !placed.has(next.id) || (prev.x === next.x && prev.y === next.y)) return next;
    const { w, h } = next.props as { w: number; h: number };
    const d = arriveDeltaNow(editor, { x: next.x, y: next.y, w, h });
    return d.x === 0 && d.y === 0 ? next : { ...next, x: next.x + d.x, y: next.y + d.y };
  });
  return () => {
    stopCreate();
    stopChange();
  };
}

/** How far `b` (page units) must move to arrive inside the window (the
    arrival area). Something bigger than that area (zoomed in past its
    size) is still kept inside the page. */
export function arrivalDelta(b: Box, area: Box, page: Box): { x: number; y: number } {
  const d1 = insideDelta(b, area);
  const d2 = insideDelta({ ...b, x: b.x + d1.x, y: b.y + d1.y }, page);
  return { x: d1.x + d2.x, y: d1.y + d2.y };
}

/** arrivalDelta on this whiteboard now. */
export function arriveDeltaNow(editor: Editor, b: Box): { x: number; y: number } {
  return arrivalDelta(b, arrivalAreaNow(editor), pageBox.get() ?? SHEET);
}
