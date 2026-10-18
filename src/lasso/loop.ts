// The lasso loop: pure geometry, no tldraw; tested in loop.test.ts.

export interface Point {
  x: number;
  y: number;
}

/** Ray casting: is `p` inside the closed polygon `poly`? */
export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function cross(o: Point, a: Point, b: Point) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Do segments ab and cd cross (touching ends count)? */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d));
}

function edges(points: readonly Point[], closed: boolean): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 0; i + 1 < points.length; i++) out.push([points[i], points[i + 1]]);
  if (closed && points.length > 2) out.push([points[points.length - 1], points[0]]);
  return out;
}

/** Is the outline `points` (a shape's edge, in page space; `closed` for a
    rectangle or ellipse, open for a line or stroke) wholly inside the lasso
    `loop`? Every point must be inside and no lasso edge may cut the outline,
    so a curvy lasso that dips into a shape doesn't select it. The loop is
    always treated as closed (start joined to end), as in Excalidraw. */
export function enclosedBy(points: readonly Point[], closed: boolean, loop: readonly Point[]): boolean {
  if (loop.length < 3 || points.length === 0) return false;
  if (!points.every((p) => pointInPolygon(p, loop))) return false;
  const loopEdges = edges(loop, true);
  for (const [a, b] of edges(points, closed)) {
    for (const [c, d] of loopEdges) if (segmentsCross(a, b, c, d)) return false;
  }
  return true;
}
