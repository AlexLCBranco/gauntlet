// Pure, no tldraw; tested in edgeHit.test.ts.

export type ResizeHandle = "top_left" | "top" | "top_right" | "right" | "bottom_right" | "bottom" | "bottom_left" | "left";

/** tldraw's cursor for each resize handle. */
export const HANDLE_CURSOR: Record<ResizeHandle, "nwse-resize" | "nesw-resize" | "ew-resize" | "ns-resize"> = {
  top_left: "nwse-resize",
  bottom_right: "nwse-resize",
  top_right: "nesw-resize",
  bottom_left: "nesw-resize",
  left: "ew-resize",
  right: "ew-resize",
  top: "ns-resize",
  bottom: "ns-resize",
};

/** Screen pixels: how near an edge counts as on it (either side), and how
    far along an edge from a corner counts as the corner. */
export const EDGE_PX = 6;
export const CORNER_PX = 12;

/** Where a point (in the shape's own space) is on a box: a resize handle
    (on an edge or a corner), "inside" (well within it), or null (outside).
    `edge` and `corner` are in the same units as the point. */
export function edgeHit(
  p: { x: number; y: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
  edge: number,
  corner: number,
): ResizeHandle | "inside" | null {
  if (p.x < b.minX - edge || p.x > b.maxX + edge || p.y < b.minY - edge || p.y > b.maxY + edge) return null;
  const dl = Math.abs(p.x - b.minX);
  const dr = Math.abs(p.x - b.maxX);
  const dt = Math.abs(p.y - b.minY);
  const db = Math.abs(p.y - b.maxY);
  const dx = Math.min(dl, dr);
  const dy = Math.min(dt, db);
  const onEdge = dx <= edge || dy <= edge;
  if (!onEdge) return "inside";
  if (dx <= corner && dy <= corner) return `${dt <= db ? "top" : "bottom"}_${dl <= dr ? "left" : "right"}` as ResizeHandle;
  if (dx <= edge && (dy > edge || dx <= dy)) return dl <= dr ? "left" : "right";
  return dt <= db ? "top" : "bottom";
}
