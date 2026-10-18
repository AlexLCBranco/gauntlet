/**
 * The canvas layout: a vertical stack of 16:9 pages, each holding frames
 * ("stones") placed in fractions of its page, so they scale with the window.
 * Pure: no DOM, no storage. Saved as `gauntlet:canvas`.
 */

export type App = "boardkit" | "linkkit";

/** Where a stone sits on its page: every number is a fraction of the page
    (x, w of its width; y, h of its height). */
export type Rect = { x: number; y: number; w: number; h: number };

export type Stone = Rect & {
  id: string;
  app: App;
  /** The board or map shown. */
  itemId: string;
  /** Its name when added; the live name comes from the app's registry. */
  name: string;
};

export type Page = { id: string; stones: Stone[] };

export type Layout = { version: 1; pages: Page[] };

export const PAGE_RATIO = 16 / 9;
/** The smallest frame, as fractions of the page. */
export const MIN_W = 0.12;
export const MIN_H = 0.15;

export const emptyLayout = (id: string): Layout => ({ version: 1, pages: [{ id, stones: [] }] });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The rectangle kept inside the page and no smaller than the minimum.
    Size wins over place: a frame too big for where it is moves back in. */
export function clampRect(r: Rect): Rect {
  const w = clamp(r.w, MIN_W, 1);
  const h = clamp(r.h, MIN_H, 1);
  return { x: clamp(r.x, 0, 1 - w), y: clamp(r.y, 0, 1 - h), w, h };
}

/** Moved by (dx, dy) fractions, staying inside the page. */
export const moveRect = (r: Rect, dx: number, dy: number): Rect => clampRect({ ...r, x: r.x + dx, y: r.y + dy });

export type Edge = "e" | "s" | "se";

/** Resized from its right edge, bottom edge or bottom-right corner by
    (dx, dy) fractions. The top-left corner stays put; the size stops at the
    page's edge and at the minimum. */
export function resizeRect(r: Rect, edge: Edge, dx: number, dy: number): Rect {
  const w = edge === "s" ? r.w : clamp(r.w + dx, MIN_W, 1 - r.x);
  const h = edge === "e" ? r.h : clamp(r.h + dy, MIN_H, 1 - r.y);
  return { ...r, w, h };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where a new stone goes on a page: the left half, else the right half,
    else stacked a little down and right of the last one. */
export function placeNew(stones: Rect[]): Rect {
  const halves: Rect[] = [
    { x: 0.01, y: 0.02, w: 0.48, h: 0.96 },
    { x: 0.51, y: 0.02, w: 0.48, h: 0.96 },
  ];
  const free = halves.find((slot) => !stones.some((s) => overlaps(s, slot)));
  if (free) return free;
  const step = (stones.length % 8) * 0.04;
  return clampRect({ x: 0.05 + step, y: 0.05 + step, w: 0.5, h: 0.75 });
}

// ------------------------------------------------------------- page geometry

/** Pixel geometry of the stack for a viewport: each page is as big as fits
    the viewport with `margin` around it, at 16:9. `pitch` is the distance
    from one page's top to the next's. */
export type Geometry = { pageW: number; pageH: number; margin: number; pitch: number };

export function geometry(viewportW: number, viewportH: number, margin = 24): Geometry {
  const pageW = Math.max(160, Math.floor(Math.min(viewportW - 2 * margin, (viewportH - 2 * margin) * PAGE_RATIO)));
  const pageH = Math.round(pageW / PAGE_RATIO);
  return { pageW, pageH, margin, pitch: pageH + margin };
}

/** The scroll position that shows page `index` aligned: its top `margin`
    below the top of the viewport. */
export const pageTop = (g: Geometry, index: number) => index * g.pitch;

/** The page most in view: the one under the middle of the viewport. */
export function currentPage(g: Geometry, scrollTop: number, viewportH: number, pageCount: number): number {
  const middle = scrollTop + viewportH / 2 - g.margin;
  return clamp(Math.floor(middle / g.pitch), 0, Math.max(0, pageCount - 1));
}

/** The page a jump by `step` (+1 down, -1 up) lands on. Scrolled part way
    into a page, "up" first goes back to that page's own top. */
export function jumpTarget(g: Geometry, scrollTop: number, step: 1 | -1, pageCount: number): number {
  const exact = scrollTop / g.pitch;
  const at = Math.round(exact);
  const aligned = Math.abs(exact - at) * g.pitch < 2;
  const from = aligned ? at : step > 0 ? Math.floor(exact) : Math.ceil(exact);
  return clamp(from + step, 0, Math.max(0, pageCount - 1));
}

/** Pages within `radius` of the current one stay loaded. */
export const isNear = (pageIndex: number, current: number, radius = 1) => Math.abs(pageIndex - current) <= radius;

// ------------------------------------------------------------------- editing

export const findStone = (layout: Layout, stoneId: string) => {
  for (const [pageIndex, page] of layout.pages.entries()) {
    const stone = page.stones.find((s) => s.id === stoneId);
    if (stone) return { stone, pageIndex };
  }
  return null;
};

export function addStone(layout: Layout, pageIndex: number, stone: Omit<Stone, keyof Rect>): Layout {
  return {
    ...layout,
    pages: layout.pages.map((p, i) => (i === pageIndex ? { ...p, stones: [...p.stones, { ...stone, ...placeNew(p.stones) }] } : p)),
  };
}

export function setRect(layout: Layout, stoneId: string, rect: Rect): Layout {
  const r = clampRect(rect);
  return {
    ...layout,
    pages: layout.pages.map((p) => ({ ...p, stones: p.stones.map((s) => (s.id === stoneId ? { ...s, ...r } : s)) })),
  };
}

export const removeStone = (layout: Layout, stoneId: string): Layout => ({
  ...layout,
  pages: layout.pages.map((p) => ({ ...p, stones: p.stones.filter((s) => s.id !== stoneId) })),
});

export const addPage = (layout: Layout, id: string): Layout => ({ ...layout, pages: [...layout.pages, { id, stones: [] }] });

/** Removes a page and its stones. The last page stays (emptied). */
export function removePage(layout: Layout, pageIndex: number): Layout {
  if (layout.pages.length <= 1) return { ...layout, pages: [{ ...layout.pages[0], stones: [] }] };
  return { ...layout, pages: layout.pages.filter((_, i) => i !== pageIndex) };
}

/** Moves the page at `from` so it ends up at index `to`. */
export function movePage(layout: Layout, from: number, to: number): Layout {
  const n = layout.pages.length;
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return layout;
  const pages = [...layout.pages];
  const [page] = pages.splice(from, 1);
  pages.splice(to, 0, page);
  return { ...layout, pages };
}

// ------------------------------------------------------------------- storage

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The saved layout, or null when there is none or it can't be read. Bad
    stones are dropped, the rest kept and clamped into their page. */
export function readLayout(raw: string | null): Layout | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const d = data as { version?: unknown; pages?: unknown };
  if (d?.version !== 1 || !Array.isArray(d.pages)) return null;
  const pages: Page[] = [];
  for (const p of d.pages as { id?: unknown; stones?: unknown }[]) {
    if (typeof p?.id !== "string" || !Array.isArray(p.stones)) continue;
    const stones: Stone[] = [];
    for (const s of p.stones as Partial<Stone>[]) {
      if (typeof s?.id !== "string" || (s.app !== "boardkit" && s.app !== "linkkit") || typeof s.itemId !== "string") continue;
      if (![s.x, s.y, s.w, s.h].every(isNum)) continue;
      stones.push({ id: s.id, app: s.app, itemId: s.itemId, name: typeof s.name === "string" ? s.name : "", ...clampRect(s as Rect) });
    }
    pages.push({ id: p.id, stones });
  }
  return pages.length ? { version: 1, pages } : null;
}

// ---------------------------------------------------------------------- undo

/** The canvas's own undo history: whole layouts, newest last. */
export type History = { past: Layout[]; present: Layout; future: Layout[] };

const LIMIT = 100;

export const historyOf = (present: Layout): History => ({ past: [], present, future: [] });

/** A canvas action: undoable, and it clears the redo list. No change, no
    entry. */
export function commit(h: History, next: Layout): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}

export function undo(h: History): History {
  const prev = h.past.at(-1);
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  const [next, ...future] = h.future;
  if (!next) return h;
  return { past: [...h.past, h.present], present: next, future };
}
