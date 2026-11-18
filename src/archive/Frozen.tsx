import { lazy, Suspense } from "react";
import type { TLShape } from "tldraw";

import { frozenMark } from "./format";

// GT-10: what every board, map and Slate widget renders for its badge.
// Nothing at all for a live widget (no hooks, no archive code: the hover
// speed check in perf.e2e.ts); the badge and the archive code load only when
// a frozen widget is on the page.
const FrozenBadge = lazy(() => import("./FrozenBadge").then((m) => ({ default: m.FrozenBadge })));

export function Frozen({ shape }: { shape: TLShape }) {
  if (!frozenMark(shape.meta)) return null;
  return (
    <Suspense fallback={null}>
      <FrozenBadge shape={shape} />
    </Suspense>
  );
}
