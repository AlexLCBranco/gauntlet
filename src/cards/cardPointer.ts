import type { Editor, TLShapeId } from "tldraw";

import { boardkitOverlayOpen, controlAt, editCardTitle } from "../boards/BoardShape";
import { moveWhiteboardCards } from "../boards/boardkit";
import { boxKeyHeld } from "../pages/edges";
import { together } from "../whiteboard/pageUndo";
import { cardShapeId, isCard, type CardShape } from "./CardShape";
import { dropTargetAt, LIST_HOLDS, type DropTarget } from "./drop";
import { syncCardsNow } from "./sync";
import "./cards.css";

/** How far (screen pixels) a press must travel to be a drag. */
const DRAG_AFTER = 4;
/** Two presses on a card this close in time (ms) and place are a double-click. */
const DOUBLE_MS = 450;
const DOUBLE_PX = 6;

/** The card's own element, drawn by its board widget. */
function cardElement(card: CardShape): HTMLElement | null {
  const root = document.getElementById(card.parentId);
  return root?.querySelector<HTMLElement>(`[data-boardkit-board] article[data-card-id="${CSS.escape(card.props.cardId)}"]`) ?? null;
}

/** The card object under the screen point, as a click would pick it (the
    topmost thing there; a locked board's cards are not picked). */
function cardAt(editor: Editor, x: number, y: number): CardShape | null {
  const hit = editor.getShapeAtPoint(editor.screenToPage({ x, y }), { hitInside: true, renderingOnly: true });
  return isCard(hit) ? hit : null;
}

/** Whether `target` is a part of a card that works by itself while its
    board is edited (the board takes the pointer only then): a field being
    typed in, a link, any of the card's buttons (thots, check circle, its
    hover buttons). Not its title: a press there picks or drags the card,
    and a double-click types in it. */
function ownPart(target: Element): boolean {
  if (target.closest("textarea, input, select, [contenteditable='true'], a[href], [data-control]")) return true;
  // The title as shown (Boardkit's marker), a button too: the card's.
  if (target.closest("[data-card-title] [data-inline-display]")) return false;
  return !!target.closest("button, [role='button']:not(article)");
}

interface Press {
  readonly pointerId: number;
  readonly card: CardShape;
  readonly x: number;
  readonly y: number;
  /** The card was already picked with others: a click (no drag) picks it alone. */
  readonly pickAloneOnUp: boolean;
  drag: Drag | null;
}

interface Drag {
  /** The cards dragged, in the order they are drawn (list by list, top down). */
  readonly cards: readonly { readonly shape: CardShape; readonly el: HTMLElement }[];
  readonly ghost: HTMLElement;
  readonly line: HTMLElement;
  readonly note: HTMLElement;
  readonly marks: HTMLStyleElement;
  target: DropTarget | null;
}

/**
 * Cards are picked and moved by the whiteboard (GT-6 step 1). A press on a
 * card, with the select tool, is taken here before tldraw or Boardkit see
 * it:
 *  - a click picks that card (Shift: adds it to, or takes it from, what is
 *    picked); no double-click to enter the board first;
 *  - a drag moves the picked cards to a place in a list, of the same board
 *    or another: a line shows where they land and that list lights up;
 *    Escape, or a drop off every list, puts them back;
 *  - a double-click types in the card's title.
 * A press on one of the card's own buttons is the board's, as before
 * (BoardShape.tsx). The move is made in Boardkit's data (same board in
 * /boardkit) and is one step of the page's undo. Returns a stop function.
 */
export function keepCardPointer(editor: Editor): () => void {
  let press: Press | null = null;
  let last: { readonly id: TLShapeId; readonly at: number; readonly x: number; readonly y: number } | null = null;

  const take = (e: Event) => {
    e.stopPropagation();
    editor.markEventAsHandled(e);
  };

  const onDown = (e: PointerEvent) => {
    if (press || e.button !== 0 || !e.isPrimary || editor.getCurrentToolId() !== "select") return;
    // The box key: a selection box starts even on a card (src/pages/edges.ts).
    if (boxKeyHeld() || editor.inputs.getIsPanning() || editor.getInstanceState().isReadonly) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || !target.closest(".tl-canvas") || ownPart(target)) return;
    const card = cardAt(editor, e.clientX, e.clientY);
    if (!card) return;
    const el = cardElement(card);
    const content = document.getElementById(card.parentId);
    if (!el || !content) return;
    // One of the card's own buttons, showing: the board's (one press does it).
    if (controlAt(content, e.clientX, e.clientY)) return;
    // A menu or panel of Boardkit's is open over the page: the press closes it.
    if (boardkitOverlayOpen(editor.getContainer())) return;

    take(e);
    e.preventDefault();
    // A board being edited (a title being typed, say) stops being edited.
    if (editor.getEditingShapeId()) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      editor.setEditingShape(null);
    }
    editor.getContainer().focus({ preventScroll: true });

    const selected = editor.getSelectedShapeIds();
    const was = selected.includes(card.id);
    const double = last && last.id === card.id && e.timeStamp - last.at < DOUBLE_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_PX;
    last = { id: card.id, at: e.timeStamp, x: e.clientX, y: e.clientY };
    if (double && !e.shiftKey) {
      last = null;
      editor.markHistoryStoppingPoint("card title");
      editCardTitle(editor, card.parentId as TLShapeId, card.props.cardId);
      return;
    }
    if (e.shiftKey) {
      // Its board picked too would be the same card twice: the card it is.
      editor.setSelectedShapes(was ? selected.filter((id) => id !== card.id) : [...selected.filter((id) => id !== card.parentId), card.id]);
      return;
    }
    if (!was) editor.setSelectedShapes([card.id]);
    press = { pointerId: e.pointerId, card, x: e.clientX, y: e.clientY, pickAloneOnUp: was && selected.length > 1, drag: null };
  };

  const startDrag = (): Drag | null => {
    const picked = editor.getSelectedShapes().filter(isCard);
    const cards = picked
      .map((shape) => ({ shape, el: cardElement(shape) }))
      .filter((c): c is { shape: CardShape; el: HTMLElement } => c.el !== null)
      .map((c) => ({ ...c, r: c.el.getBoundingClientRect(), list: c.el.closest("section")?.getBoundingClientRect() }))
      // As drawn: board by board and list by list (left to right), top down.
      .sort((a, b) => (a.list?.left ?? 0) - (b.list?.left ?? 0) || (a.list?.top ?? 0) - (b.list?.top ?? 0) || a.r.top - b.r.top);
    if (cards.length === 0) return null;
    // Only cards move: anything else picked with them is let go.
    if (picked.length !== editor.getSelectedShapeIds().length) editor.setSelectedShapes(picked.map((s) => s.id));

    // The lifted copy: the pressed card as drawn, the others behind it.
    const lead = cards.find((c) => c.shape.id === press?.card.id) ?? cards[0];
    const ratio = lead.r.width / (lead.el.offsetWidth || lead.r.width);
    const ghost = document.createElement("div");
    ghost.className = "gc-ghost";
    ghost.dataset.testid = "card-ghost";
    ghost.style.left = `${lead.r.left}px`;
    ghost.style.top = `${lead.r.top}px`;
    ghost.style.width = `${lead.el.offsetWidth}px`;
    ghost.style.height = `${lead.el.offsetHeight}px`;
    ghost.style.setProperty("--gc-scale", String(ratio));
    for (const [i, c] of [lead, ...cards.filter((c) => c !== lead)].slice(0, 3).entries()) {
      const copy = c.el.cloneNode(true) as HTMLElement;
      copy.removeAttribute("data-card-id");
      copy.removeAttribute("data-pointer-over");
      copy.style.width = `${lead.el.offsetWidth}px`;
      copy.classList.add("gc-ghost-card");
      copy.style.setProperty("--gc-behind", String(i));
      ghost.append(copy);
    }
    if (cards.length > 1) {
      const count = document.createElement("span");
      count.className = "gc-ghost-count";
      count.textContent = String(cards.length);
      ghost.append(count);
    }
    const line = document.createElement("div");
    line.className = "gc-line";
    line.dataset.testid = "card-landing-line";
    line.hidden = true;
    const note = document.createElement("div");
    note.className = "gc-note";
    note.hidden = true;
    const marks = document.createElement("style");
    document.body.append(line, note, ghost);
    document.head.append(marks);
    document.documentElement.classList.add("gc-dragging");
    return { cards, ghost, line, note, marks, target: null };
  };

  /** The dragged cards dimmed where they are, and the target list lit. */
  const mark = (drag: Drag) => {
    const dim = drag.cards.map((c) => `[id="${CSS.escape(c.shape.parentId)}"] article[data-card-id="${CSS.escape(c.shape.props.cardId)}"]`).join(",");
    const t = drag.target;
    const lit = t && !t.full ? `[id="${CSS.escape(t.boardShapeId)}"] section[data-list-id="${CSS.escape(t.listId)}"]{outline:3px solid #4f7cff;outline-offset:2px;border-radius:10px}` : "";
    const css = `${dim}{opacity:.3 !important}${lit}`;
    if (drag.marks.textContent !== css) drag.marks.textContent = css;
  };

  const moveDrag = (drag: Drag, e: PointerEvent) => {
    if (!press) return;
    drag.ghost.style.transform = `translate(${e.clientX - press.x}px, ${e.clientY - press.y}px) scale(var(--gc-scale))`;
    const target = dropTargetAt(editor, e.clientX, e.clientY, new Set(drag.cards.map((c) => c.el)));
    drag.target = target;
    drag.line.hidden = !target || target.full;
    drag.note.hidden = !target?.full;
    if (target && !target.full) {
      drag.line.style.left = `${target.line.x}px`;
      drag.line.style.top = `${target.line.y}px`;
      drag.line.style.width = `${target.line.w}px`;
      drag.line.dataset.list = target.listId;
      drag.line.dataset.index = String(target.index);
    } else if (target) {
      drag.note.textContent = `This list is full. A list holds ${LIST_HOLDS} cards.`;
      drag.note.style.left = `${e.clientX + 14}px`;
      drag.note.style.top = `${e.clientY + 14}px`;
    }
    mark(drag);
  };

  const endDrag = (drag: Drag) => {
    drag.ghost.remove();
    drag.line.remove();
    drag.note.remove();
    drag.marks.remove();
    document.documentElement.classList.remove("gc-dragging");
  };

  /** Moves the dragged cards to `target` in Boardkit's data, as one step of
      the page's undo, and picks them where they are now. */
  const drop = (drag: Drag, target: DropTarget) => {
    // Cards of several boards: board by board, kept in the order drawn.
    const groups = new Map<string, string[]>();
    for (const c of drag.cards) groups.set(c.shape.props.boardId, [...(groups.get(c.shape.props.boardId) ?? []), c.shape.props.cardId]);
    const now: string[] = [];
    editor.markHistoryStoppingPoint("card move");
    together(() => {
      for (const [fromBoardId, cardIds] of groups) {
        const ids = moveWhiteboardCards({ fromBoardId, cardIds, toBoardId: target.boardId, toListId: target.listId, index: target.index + now.length });
        // Not moved (already there): still counted, it sits before the next.
        now.push(...(ids ?? (fromBoardId === target.boardId ? cardIds : [])));
      }
    });
    // The boards draw the cards in their new places first; then the objects
    // follow, and the moved cards stay picked.
    const pick = (tries: number) => {
      syncCardsNow(editor);
      const ids = now.map((cardId) => cardShapeId(target.boardShapeId, cardId)).filter((id) => editor.getShape(id));
      if (ids.length < now.length && tries > 0) return void requestAnimationFrame(() => pick(tries - 1));
      if (ids.length > 0) editor.setSelectedShapes(ids);
    };
    requestAnimationFrame(() => pick(20));
  };

  const onMove = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.pointerId) return;
    take(e);
    if (!press.drag) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_AFTER) return;
      press.drag = startDrag();
      if (!press.drag) return void (press = null);
      last = null;
    }
    moveDrag(press.drag, e);
  };

  const onUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.pointerId) return;
    take(e);
    const { drag, card, pickAloneOnUp } = press;
    press = null;
    if (!drag) {
      if (pickAloneOnUp) editor.setSelectedShapes([card.id]);
      return;
    }
    const target = e.type === "pointerup" ? drag.target : null;
    endDrag(drag);
    if (target && !target.full) drop(drag, target);
  };

  const cancel = () => {
    if (!press) return;
    if (press.drag) endDrag(press.drag);
    press = null;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !press?.drag) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    editor.markEventAsHandled(e);
    cancel();
  };

  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", cancel);
  return () => {
    cancel();
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", cancel);
  };
}
