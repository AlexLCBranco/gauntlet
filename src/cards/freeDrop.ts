import type { Editor, TLShape } from "tldraw";

import { putWhiteboardCards, whiteboardListRoom } from "../boards/boardkit";
import { together } from "../whiteboard/pageUndo";
import { dropTargetAt, landingOrder, LIST_HOLDS, type DropTarget } from "./drop";
import { isFreeCard, type FreeCardShape } from "./FreeCardShape";
import { pickCardsSoon } from "./sync";
import "./cards.css";

/**
 * A card that lives on the page (FreeCardShape.tsx) is moved by the
 * whiteboard like any item. Let go over a list of a board, it becomes that
 * list's card again (GT-6 step 2): while it is dragged there, a line shows
 * where it will land and the list lights up, as for a card dragged from a
 * list (cardPointer.ts). The card goes into Boardkit's record and its
 * object here goes away; the drag and the drop are one step of the page's
 * undo. Anything else dragged along just moves. Returns a stop function.
 */
export function keepFreeCardDrops(editor: Editor): () => void {
  let marks: { readonly line: HTMLElement; readonly note: HTMLElement; readonly lit: HTMLStyleElement } | null = null;

  const dragged = (): FreeCardShape[] => (editor.isIn("select.translating") ? editor.getSelectedShapes().filter(isFreeCard) : []);

  const clear = () => {
    if (!marks) return;
    marks.line.remove();
    marks.note.remove();
    marks.lit.remove();
    marks = null;
  };

  const show = (t: DropTarget, x: number, y: number) => {
    if (!marks) {
      const line = document.createElement("div");
      line.className = "gc-line";
      line.dataset.testid = "card-landing-line";
      const note = document.createElement("div");
      note.className = "gc-note";
      const lit = document.createElement("style");
      document.body.append(line, note);
      document.head.append(lit);
      marks = { line, note, lit };
    }
    const { line, note, lit } = marks;
    line.hidden = t.full;
    note.hidden = !t.full;
    if (t.full) {
      note.textContent = `This list is full. A list holds ${LIST_HOLDS} cards.`;
      note.style.left = `${x + 14}px`;
      note.style.top = `${y + 14}px`;
    } else {
      line.style.left = `${t.line.x}px`;
      line.style.top = `${t.line.y}px`;
      line.style.width = `${t.line.w}px`;
      line.dataset.list = t.listId;
      line.dataset.index = String(t.index);
    }
    const css = t.full ? "" : `[id="${CSS.escape(t.boardShapeId)}"] section[data-list-id="${CSS.escape(t.listId)}"]{outline:3px solid #4f7cff;outline-offset:2px;border-radius:10px}`;
    if (lit.textContent !== css) lit.textContent = css;
  };

  const listCount = (t: DropTarget) => document.getElementById(t.boardShapeId)?.querySelectorAll(`[data-boardkit-board] section[data-list-id="${CSS.escape(t.listId)}"] article[data-card-id]`).length ?? 0;

  /** Where the cards would land now: the list place under the pointer; a
      list with no room for all of them takes none. */
  const aim = (x: number, y: number, count: number): DropTarget | null => {
    const t = dropTargetAt(editor, x, y, new Set());
    if (!t) return null;
    return t.full || count > LIST_HOLDS - listCount(t) ? { ...t, full: true } : t;
  };

  const onMove = (e: PointerEvent) => {
    const cards = dragged();
    const t = cards.length > 0 ? aim(e.clientX, e.clientY, cards.length) : null;
    if (t) show(t, e.clientX, e.clientY);
    else clear();
  };

  /** Puts the dropped cards into the list, and takes their objects off the
      page: with the drag that brought them, one step of the page's undo. */
  const drop = (cards: readonly FreeCardShape[], t: DropTarget) => {
    const live = landingOrder(cards.map((c) => editor.getShape<FreeCardShape>(c.id)).filter((s): s is FreeCardShape => !!s));
    if (live.length === 0 || whiteboardListRoom(t.boardId, t.listId) < live.length) return;
    let ids: readonly string[] | null = null;
    together(
      () => {
        // Off the page first: still the drag's own step in tldraw's undo
        // (a board step ends it).
        editor.deleteShapes(live.map((s) => s.id));
        ids = putWhiteboardCards({ boardId: t.boardId, listId: t.listId, index: t.index, cards: live.map((s) => s.props.card) });
        // Not taken after all: they stay on the page.
        if (!ids) editor.createShapes(live as TLShape[]);
      },
      { withDrawingBefore: true },
    );
    if (ids) pickCardsSoon(editor, t.boardShapeId, ids);
  };

  const onUp = (e: PointerEvent) => {
    const cards = dragged();
    const t = e.type === "pointerup" && cards.length > 0 ? aim(e.clientX, e.clientY, cards.length) : null;
    clear();
    if (!t || t.full) return;
    // tldraw ends its drag on this same release; then the cards go in.
    const after = (tries: number) => {
      if (editor.isIn("select.translating")) {
        if (tries > 0) requestAnimationFrame(() => after(tries - 1));
        return;
      }
      drop(cards, t);
    };
    queueMicrotask(() => after(10));
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") clear();
  };

  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", clear);
  return () => {
    clear();
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", clear);
  };
}
