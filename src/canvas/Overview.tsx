import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { Layout } from "../domain/layout";
import styles from "./Canvas.module.css";

type Props = {
  layout: Layout;
  current: number;
  nameOf: (app: "boardkit" | "linkkit", itemId: string, fallback: string) => string;
  onJump: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onClose: () => void;
};

/** Every page as an outline: its frames as rectangles with names. Click a
    page to jump to it, drag it to reorder. */
export function Overview({ layout, current, nameOf, onJump, onMove, onRemove, onClose }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; x0: number; y0: number; moved: boolean } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** The thumbnail slot under the pointer. */
  const slotAt = (x: number, y: number) => {
    const thumbs = [...(grid.current?.querySelectorAll<HTMLElement>("[data-thumb]") ?? [])];
    let best = 0;
    let bestD = Infinity;
    thumbs.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bestD) [best, bestD] = [i, d];
    });
    return best;
  };

  const down = (index: number) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ from: index, to: index, x0: e.clientX, y0: e.clientY, moved: false });
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5;
    setDrag({ ...drag, moved, to: moved ? slotAt(e.clientX, e.clientY) : drag.from });
  };
  const up = () => {
    if (!drag) return;
    setDrag(null);
    if (!drag.moved) onJump(drag.from);
    else if (drag.to !== drag.from) onMove(drag.from, drag.to);
  };

  // While dragging, show the order it would drop into.
  const order = layout.pages.map((_, i) => i);
  if (drag?.moved && drag.to !== drag.from) {
    order.splice(drag.from, 1);
    order.splice(drag.to, 0, drag.from);
  }

  return (
    <div className={styles.overview} role="dialog" aria-label="Pages" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.overviewHead}>
        <span>Pages: click to jump, drag to reorder</span>
        <button type="button" className={styles.toolButton} onClick={onClose}>
          Close
        </button>
      </div>
      <div className={styles.thumbs} ref={grid}>
        {order.map((pageIndex, slot) => {
          const page = layout.pages[pageIndex];
          return (
            <div
              key={page.id}
              data-thumb={pageIndex}
              data-page-id={page.id}
              className={styles.thumb}
              data-current={pageIndex === current}
              data-dragging={drag?.moved && drag.from === pageIndex}
              onPointerDown={down(pageIndex)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => setDrag(null)}
              aria-label={`Page ${slot + 1}`}
              role="button"
            >
              {page.stones.map((s) => (
                <div key={s.id} className={styles.thumbStone} data-app={s.app} style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }}>
                  {nameOf(s.app, s.itemId, s.name)}
                </div>
              ))}
              <span className={styles.thumbNumber}>{slot + 1}</span>
              <button
                type="button"
                className={styles.thumbRemove}
                aria-label={`Remove page ${slot + 1}`}
                title="Remove this page and its frames (Ctrl+Z brings it back)"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onRemove(pageIndex)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
