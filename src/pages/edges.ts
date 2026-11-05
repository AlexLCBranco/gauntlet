import { Box, Polygon2d, SelectionForegroundOverlayUtil, Vec, react, type Editor, type Geometry2d, type StateNode, type TLSelectionForegroundOverlay } from "tldraw";

import { pageBox } from "./keepFilled";
import { SHEET } from "./sheet";

// Page edges and packed layouts (owner, Edges round item 1). The page fills
// the window, so an item flush against the page edge has its border on the
// screen's last pixel: the outer half of every grab zone is off screen, and
// items packed edge to edge leave no empty spot. Everything here is in
// screen pixels, divided by the zoom where it meets page space.

/** How near (screen px) a border must be to the window's edge to count as
    on it. */
export const NEAR_PX = 8;
/** A selected item's resize zones (screen px): this far out of its border
    and in. Near the window's edge all of it moves inside the item. */
export const HANDLE_OUT_PX = 8;
export const HANDLE_IN_PX = 8;
/** A corner's zone is a square this many screen px from the corner each way. */
export const CORNER_HALF_PX = 11;

type Side = "left" | "right" | "top" | "bottom";

/** The sides of `b` (page space) on or past the window's edge. */
export function sidesNearWindow(editor: Editor, b: { minX: number; minY: number; maxX: number; maxY: number }): Set<Side> {
  const v = editor.getViewportPageBounds();
  const near = NEAR_PX / editor.getZoomLevel();
  const out = new Set<Side>();
  if (b.minX - v.minX <= near) out.add("left");
  if (v.maxX - b.maxX <= near) out.add("right");
  if (b.minY - v.minY <= near) out.add("top");
  if (v.maxY - b.maxY <= near) out.add("bottom");
  return out;
}

/** The tldraw watermark's box in page space, if shown. The hobby license
    needs it "visible, unobscured, and available to user-interaction", so
    nothing moves or covers it: handles step away from it instead. */
function watermarkPageBox(editor: Editor): Box | null {
  const el = document.querySelector<HTMLElement>(".tl-watermark_SEE-LICENSE");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  const a = editor.screenToPage({ x: r.left, y: r.top });
  const z = editor.getZoomLevel();
  return new Box(a.x, a.y, r.width / z, r.height / z);
}

const rect = (x: number, y: number, w: number, h: number) =>
  new Polygon2d({ points: [new Vec(x, y), new Vec(x + w, y), new Vec(x + w, y + h), new Vec(x, y + h)], isFilled: true });

/**
 * tldraw's selection handles with grab zones that work at the page's edge:
 * 8 px either side of a border (tldraw: 6, halved on small items), and on a
 * border at the window's edge the whole zone inside the item; a corner's
 * square at a window corner moves inward, and steps out of the watermark.
 * Rotated selections keep tldraw's own zones. Drawing is tldraw's.
 */
export class EdgeSelectionForeground extends SelectionForegroundOverlayUtil {
  override getGeometry(overlay: TLSelectionForegroundOverlay): Geometry2d | null {
    const own = super.getGeometry(overlay);
    const { overlayType, handle } = overlay.props as { overlayType: string; handle: string };
    if (overlayType !== "resize_handle" || !own) return own;
    const editor = this.editor;
    if (Math.abs(editor.getSelectionRotation()) > 1e-6) return own;
    const b = editor.getSelectionRotatedPageBounds();
    if (!b) return own;
    const z = editor.getZoomLevel();
    const near = sidesNearWindow(editor, b);
    const out = HANDLE_OUT_PX / z;
    // Inward never more than a quarter of the item, so a small picture
    // still has a middle to drag it by.
    const inX = Math.min(HANDLE_IN_PX / z, b.w / 4);
    const inY = Math.min(HANDLE_IN_PX / z, b.h / 4);
    // One side's zone across its border: [from, to] along x (or y).
    const span = (side: Side): [number, number] => {
      const inn = side === "left" || side === "right" ? inX : inY;
      const full = Math.min(out + inn, (side === "left" || side === "right" ? b.w : b.h) / 3);
      switch (side) {
        case "left":
          return near.has("left") ? [b.minX, b.minX + full] : [b.minX - out, b.minX + inn];
        case "right":
          return near.has("right") ? [b.maxX - full, b.maxX] : [b.maxX - inn, b.maxX + out];
        case "top":
          return near.has("top") ? [b.minY, b.minY + full] : [b.minY - out, b.minY + inn];
        case "bottom":
          return near.has("bottom") ? [b.maxY - full, b.maxY] : [b.maxY - inn, b.maxY + out];
      }
    };
    if (handle === "left" || handle === "right") {
      const [x0, x1] = span(handle);
      return rect(x0, b.minY, x1 - x0, b.h);
    }
    if (handle === "top" || handle === "bottom") {
      const [y0, y1] = span(handle);
      return rect(b.minX, y0, b.w, y1 - y0);
    }
    // A corner: the square round it, moved inside on a window edge.
    const half = CORNER_HALF_PX / z;
    // A fifth of the item at most: a short item keeps the middle of its
    // sides for its edges.
    const capX = Math.min(half, b.w / 5);
    const capY = Math.min(half, b.h / 5);
    const left = handle.endsWith("left");
    const top = handle.startsWith("top");
    const cx = left ? b.minX : b.maxX;
    const cy = top ? b.minY : b.maxY;
    const sx = left ? "left" : "right";
    const sy = top ? "top" : "bottom";
    // Out of the item: `half`; into it: the cap (twice it on a window edge,
    // where nothing outside can be reached).
    const [x0init, x1] = near.has(sx) ? (left ? [cx, cx + 2 * capX] : [cx - 2 * capX, cx]) : left ? [cx - half, cx + capX] : [cx - capX, cx + half];
    const [y0init, y1] = near.has(sy) ? (top ? [cy, cy + 2 * capY] : [cy - 2 * capY, cy]) : top ? [cy - half, cy + capY] : [cy - capY, cy + half];
    let x0 = x0init;
    let y0 = y0init;
    // Round the watermark: the zone also reaches past it, inward along the
    // item (the part under it is the watermark's: it stays on top).
    const wm = watermarkPageBox(editor);
    if (wm && Box.Collides(new Box(x0, y0, x1 - x0, y1 - y0), wm)) {
      const dy = top ? 0 : y1 - wm.minY;
      const dx = left ? 0 : x1 - wm.minX;
      const step = 8 / z;
      if (dy > 0 && (dx <= 0 || dy <= dx)) y0 = Math.max(b.minY, Math.min(y0, wm.minY - step));
      else if (dx > 0) x0 = Math.max(b.minX, Math.min(x0, wm.minX - step));
    }
    return rect(x0, y0, x1 - x0, y1 - y0);
  }
}

/** For the unselected item's edge resize (hoverResize.ts): its box with
    each side on the window's edge moved inward by `edge`, so the edge zone
    (`edge` either side of a side) lies wholly inside the item. */
export function edgesInward(editor: Editor, page: Box, local: Box, edge: number): Box {
  const near = sidesNearWindow(editor, page);
  if (near.size === 0) return local;
  const r = local.clone();
  if (near.has("left") && r.w > 4 * edge) [r.x, r.w] = [r.x + edge, r.w - edge];
  if (near.has("right") && r.w > 4 * edge) r.w -= edge;
  if (near.has("top") && r.h > 4 * edge) [r.y, r.h] = [r.y + edge, r.h - edge];
  if (near.has("bottom") && r.h > 4 * edge) r.h -= edge;
  return r;
}

/**
 * Box select and lasso at the page's edge: a pointer within NEAR_PX of a
 * page edge counts as past it, so an item flush against that edge counts
 * as enclosed (tldraw's box test is strict: a box that only reaches an
 * item's border never holds it, and the pointer can't go past the
 * screen's last pixel).
 */
export function pastPageEdge(editor: Editor, p: { x: number; y: number }): Vec {
  const page = pageBox.get() ?? SHEET;
  const near = NEAR_PX / editor.getZoomLevel();
  const far = 1000 / editor.getZoomLevel();
  const q = new Vec(p.x, p.y);
  if (p.x - page.x <= near) q.x = Math.min(q.x, page.x - far);
  if (page.x + page.w - p.x <= near) q.x = Math.max(q.x, page.x + page.w + far);
  if (p.y - page.y <= near) q.y = Math.min(q.y, page.y - far);
  if (page.y + page.h - p.y <= near) q.y = Math.max(q.y, page.y + page.h + far);
  return q;
}

/** Wraps tldraw's box select (select.brushing) so its corners near a page
    edge count as past it. Returns a stop function. */
export function brushPastEdges(editor: Editor): () => void {
  const brushing = editor.getStateDescendant("select.brushing") as (StateNode & { hitTestShapes: () => void }) | undefined;
  if (!brushing) return () => {};
  const own = brushing.hitTestShapes;
  const inputs = editor.inputs as unknown as { getOriginPagePoint: () => Vec; getCurrentPagePoint: () => Vec };
  const wrapped = function (this: unknown) {
    const origin = inputs.getOriginPagePoint.call(editor.inputs);
    const current = inputs.getCurrentPagePoint.call(editor.inputs);
    const o = pastPageEdge(editor, origin);
    const c = pastPageEdge(editor, current);
    if (o.equals(origin) && c.equals(current)) return own.call(this);
    // InputsManager's getters are prototype methods: shadowed on the
    // instance for this one call, then the shadows are removed.
    const target = editor.inputs as unknown as Record<string, unknown>;
    Object.defineProperty(target, "getOriginPagePoint", { value: () => o, configurable: true, writable: true });
    Object.defineProperty(target, "getCurrentPagePoint", { value: () => c, configurable: true, writable: true });
    try {
      own.call(this);
    } finally {
      delete target.getOriginPagePoint;
      delete target.getCurrentPagePoint;
    }
  };
  Object.defineProperty(brushing, "hitTestShapes", { value: wrapped, configurable: true, writable: true });
  return () => Object.defineProperty(brushing, "hitTestShapes", { value: own, configurable: true, writable: true });
}

/** The key held to start a selection box even on an item (packed pages
    have no empty spot to start one). tldraw uses no plain C. */
export const BOX_KEY = "c";
let boxKeyDown = false;
/** Whether the box key is held now. */
export const boxKeyHeld = () => boxKeyDown;

/** Tracks the box key (not while typing in a field). Returns a stop function. */
export function trackBoxKey(): () => void {
  const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true']");
  const down = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === BOX_KEY && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) boxKeyDown = true;
  };
  const up = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === BOX_KEY) boxKeyDown = false;
  };
  const blur = () => (boxKeyDown = false);
  window.addEventListener("keydown", down, true);
  window.addEventListener("keyup", up, true);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down, true);
    window.removeEventListener("keyup", up, true);
    window.removeEventListener("blur", blur);
  };
}

/** Our own floating controls (never tldraw's watermark: see above). */
const CONTROLS = [".gk-toolbar", ".gk-more", ".gauntlet-pages", ".gauntlet-zoom-undo .gauntlet-island", ".tlui-menu-zone", ".gk-style-panel", ".tlui-contextual-toolbar", ".gk-panel-tab"];

/**
 * The page's floating controls give way to a selection's handles under
 * them (owner, item 1b): while a selected item's handle zone lies under a
 * control, the control dims (`data-under-selection`), and while the pointer
 * is on such a zone (or a resize is under way) the control lets the pointer
 * through to the handle (`data-yield`). Pointed at anywhere else, a control
 * works as always. Returns a stop function.
 */
export function controlsYield(editor: Editor): () => void {
  // The controls and where they are, read at most every 300 ms (reading a
  // box forces the browser to lay out; on every pointer move or camera
  // step that cost frames, perf.e2e.ts).
  let cache: { at: number; list: { el: HTMLElement; r: DOMRect }[] } = { at: -Infinity, list: [] };
  const els = () => CONTROLS.flatMap((s) => [...document.querySelectorAll<HTMLElement>(s)]);
  const rects = () => {
    const now = performance.now();
    if (now - cache.at > 300) cache = { at: now, list: els().map((el) => ({ el, r: el.getBoundingClientRect() })) };
    return cache.list;
  };
  let yielding = false;
  // A new selection or window size moves controls (tldraw's picture
  // toolbar appears over a selected picture): read them again.
  let seenKey = "";
  // Dim what lies over the selection's handle band.
  const stopDim = react("controls under the selection", () => {
    const b = editor.getSelectionRotatedPageBounds();
    editor.getCamera();
    const vs = editor.getViewportScreenBounds();
    const key = `${editor.getSelectedShapeIds().join()} ${vs.w}x${vs.h}`;
    if (key !== seenKey) {
      seenKey = key;
      cache.at = -Infinity;
    }
    const busy = editor.isInAny("select.translating", "select.brushing", "select.scribble_brushing");
    const band = b && !busy ? (() => {
      const tl = editor.pageToScreen({ x: b.minX, y: b.minY });
      const br = editor.pageToScreen({ x: b.maxX, y: b.maxY });
      const pad = HANDLE_OUT_PX + 2;
      return { l: tl.x - pad, t: tl.y - pad, r: br.x + pad, b: br.y + pad, inner: HANDLE_IN_PX + CORNER_HALF_PX };
    })() : null;
    const v = editor.getViewportScreenBounds();
    for (const { el, r } of band ? rects() : els().map((el) => ({ el, r: null as DOMRect | null }))) {
      let under = false;
      if (band && r) {
        const [l, t, rr, bb] = [r.left - v.x, r.top - v.y, r.right - v.x, r.bottom - v.y];
        const hits = l < band.r && rr > band.l && t < band.b && bb > band.t;
        // ...and not wholly inside the item, away from its border.
        const inside = l > band.l + band.inner && rr < band.r - band.inner && t > band.t + band.inner && bb < band.b - band.inner;
        under = hits && !inside;
      }
      // Written only when it changes (each write re-styles the control).
      if (under !== "underSelection" in el.dataset) {
        if (under) el.dataset.underSelection = "";
        else delete el.dataset.underSelection;
      }
    }
  });
  const yieldAt = (clientX: number, clientY: number) => {
    const resizing = editor.isInAny("select.resizing", "select.pointing_resize_handle");
    let onHandle = resizing;
    if (!onHandle && editor.getSelectedShapeIds().length) {
      const p = editor.screenToPage({ x: clientX, y: clientY });
      const o = editor.overlays.getOverlayAtPoint(p);
      onHandle = !!o && (o.props as { overlayType?: string }).overlayType === "resize_handle";
    }
    // Nothing to give way to and nothing giving way: no DOM work at all.
    if (!onHandle && !yielding) return;
    yielding = onHandle;
    // Fresh boxes here: only on a handle, rare (a control may have just
    // appeared, tldraw's picture toolbar).
    if (onHandle) cache.at = -Infinity;
    for (const { el, r } of rects()) {
      const over = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
      const give = onHandle && (over || (resizing && "yield" in el.dataset));
      if (give !== "yield" in el.dataset) {
        if (give) el.dataset.yield = "";
        else delete el.dataset.yield;
      }
      // Its wrappers up to tldraw's layout (which lets the pointer through
      // itself) would catch the press instead: they let it through too.
      for (let w = el.parentElement; w && !w.classList.contains("tlui-layout") && !w.classList.contains("tl-container"); w = w.parentElement) {
        if (give) {
          if (!("yieldWrap" in w.dataset)) w.dataset.yieldWrap = "";
        } else if ("yieldWrap" in w.dataset && !w.querySelector("[data-yield]")) delete w.dataset.yieldWrap;
      }
    }
  };
  const move = (e: PointerEvent) => yieldAt(e.clientX, e.clientY);
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", move, true);
  return () => {
    stopDim();
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", move, true);
    for (const el of els()) {
      delete el.dataset.yield;
      delete el.dataset.underSelection;
    }
    for (const w of document.querySelectorAll<HTMLElement>("[data-yield-wrap]")) delete w.dataset.yieldWrap;
  };
}
