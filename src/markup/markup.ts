import { b64Vecs } from "@tldraw/tlschema";
import { atom, createShapeId, getIndicesBetween, react, StateNode, type Editor, type TLShapeId } from "tldraw";

import { snapStraight } from "../whiteboard/straightLines";

/**
 * Markup (owner, toolbar rework step 4; replaces the laser pointer): red
 * marks over the page that stay until cleared. While Markup is on, the
 * Arrow and Line tools draw red markup arrows and lines (snapped straight
 * as the real ones). Marks are never saved: they live here, in memory,
 * never in tldraw's store; leaving the page or a reload clears them.
 * "Keep marks" turns them into ordinary red drawings.
 */

type Pt = { x: number; y: number };
export type Mark = { kind: "pen"; points: Pt[] } | { kind: "line" | "arrow"; from: Pt; to: Pt };
export type MarkupKind = Mark["kind"];

export const MARKUP_TOOL = "markup";
/** The red marks are drawn in (Excalidraw's red, its stroke palette). */
export const MARKUP_COLOR = "#e03131";

/** The marks on the current page, and the one being drawn. */
export const markupMarks = atom<readonly Mark[]>("markup marks", []);
export const markupDraft = atom<Mark | null>("markup draft", null);
/** What the Markup tool draws: freehand, or (picked with A or L while
    Markup is on) arrows and lines. */
export const markupKind = atom<MarkupKind>("markup kind", "pen");

/** Shift: tldraw's own 15° steps for lines and arrows. */
function snap15(from: Pt, to: Pt): Pt {
  const step = Math.PI / 12;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step;
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
}

/** The Markup tool: a press-and-drag draws one mark. */
export class MarkupTool extends StateNode {
  static override id = MARKUP_TOOL;

  override onEnter() {
    this.editor.setCursor({ type: "cross", rotation: 0 });
  }
  override onExit() {
    markupDraft.set(null);
  }
  override onPointerDown() {
    const p = this.editor.inputs.getCurrentPagePoint();
    const kind = markupKind.get();
    markupDraft.set(kind === "pen" ? { kind, points: [{ x: p.x, y: p.y }] } : { kind, from: { x: p.x, y: p.y }, to: { x: p.x, y: p.y } });
  }
  override onPointerMove() {
    const draft = markupDraft.get();
    if (!draft || !this.editor.inputs.getIsDragging()) return;
    const p = this.editor.inputs.getCurrentPagePoint();
    if (draft.kind === "pen") {
      markupDraft.set({ ...draft, points: [...draft.points, { x: p.x, y: p.y }] });
    } else {
      const to = this.editor.inputs.getShiftKey() ? snap15(draft.from, p) : snapStraight(draft.from, p);
      markupDraft.set({ ...draft, to });
    }
  }
  override onPointerUp() {
    const draft = markupDraft.get();
    markupDraft.set(null);
    if (!draft) return;
    // A click without a drag leaves no mark.
    const size = draft.kind === "pen" ? draft.points.length : Math.hypot(draft.to.x - draft.from.x, draft.to.y - draft.from.y);
    if (size < 2) return;
    markupMarks.set([...markupMarks.get(), draft]);
  }
  override onCancel() {
    markupDraft.set(null);
  }
  override onInterrupt() {
    markupDraft.set(null);
  }
}

/** Turns on Markup drawing `kind`. */
export function startMarkup(editor: Editor, kind: MarkupKind = "pen") {
  markupKind.set(kind);
  if (editor.getCurrentToolId() !== MARKUP_TOOL) editor.setCurrentTool(MARKUP_TOOL);
}

export function clearMarkup() {
  markupMarks.set([]);
  markupDraft.set(null);
}

/**
 * "Keep marks": every mark becomes an ordinary red drawing on the page
 * (pen: a draw stroke, line: a line, arrow: an arrow), as one undo step,
 * and the markup is cleared.
 */
export function keepMarks(editor: Editor): TLShapeId[] {
  const marks = markupMarks.get();
  if (!marks.length) return [];
  const ids: TLShapeId[] = [];
  editor.markHistoryStoppingPoint("keep marks");
  editor.run(() => {
    for (const m of marks) {
      const id = createShapeId();
      ids.push(id);
      if (m.kind === "pen") {
        const o = m.points[0];
        const points = m.points.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
        editor.createShape({
          id,
          type: "draw",
          x: o.x,
          y: o.y,
          props: { color: "red", isComplete: true, segments: [{ type: "free", path: b64Vecs.encodePoints2D(points), dim: 2 }] },
        });
      } else if (m.kind === "line") {
        const [a, b] = getIndicesBetween(null, null, 2);
        editor.createShape({
          id,
          type: "line",
          x: m.from.x,
          y: m.from.y,
          props: {
            color: "red",
            points: { [a]: { id: a, index: a, x: 0, y: 0 }, [b]: { id: b, index: b, x: m.to.x - m.from.x, y: m.to.y - m.from.y } },
          },
        });
      } else {
        editor.createShape({
          id,
          type: "arrow",
          x: m.from.x,
          y: m.from.y,
          props: { color: "red", start: { x: 0, y: 0 }, end: { x: m.to.x - m.from.x, y: m.to.y - m.from.y } },
        });
      }
    }
  });
  clearMarkup();
  return ids;
}

/** Marks belong to the page they were drawn on: leaving it clears them. */
export function markup(editor: Editor): () => void {
  let page = editor.getCurrentPageId();
  const stop = react("markup cleared on leaving the page", () => {
    const now = editor.getCurrentPageId();
    if (now !== page) {
      page = now;
      clearMarkup();
    }
  });
  return () => {
    stop();
    clearMarkup();
  };
}
