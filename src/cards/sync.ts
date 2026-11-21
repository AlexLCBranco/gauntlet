import { useLayoutEffect, type RefObject } from "react";
import { useEditor, type Editor, type TLShapeId, type TLShapePartial } from "tldraw";

import { CARD_TYPE, cardShapeId, isCard, type CardShape } from "./CardShape";

/** A card as the board draws it: its box inside the board widget, in the
    widget's own page units. */
export interface DrawnCard {
  readonly cardId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** What to do so the card objects match the cards drawn. Pure; tested in
    sync.test.ts. A box within half a unit of where it should be is left. */
export function cardChanges(
  have: readonly { readonly id: TLShapeId; readonly cardId: string; readonly boardId: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }[],
  drawn: readonly DrawnCard[],
  boardId: string,
  idOf: (cardId: string) => TLShapeId,
): { readonly remove: TLShapeId[]; readonly add: DrawnCard[]; readonly move: (DrawnCard & { readonly id: TLShapeId })[] } {
  const wanted = new Map(drawn.map((card) => [idOf(card.cardId), card]));
  const remove: TLShapeId[] = [];
  const move: (DrawnCard & { id: TLShapeId })[] = [];
  const seen = new Set<TLShapeId>();
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  for (const shape of have) {
    const card = wanted.get(shape.id);
    // Not a card drawn here (gone, moved to another board), or a stray copy.
    if (!card || card.cardId !== shape.cardId || seen.has(shape.id)) {
      remove.push(shape.id);
      continue;
    }
    seen.add(shape.id);
    if (shape.boardId !== boardId || !near(shape.x, card.x) || !near(shape.y, card.y) || !near(shape.w, card.w) || !near(shape.h, card.h)) move.push({ ...card, id: shape.id });
  }
  const add = drawn.filter((card) => !seen.has(idOf(card.cardId)));
  return { remove, add, move };
}

/** The cards `content` (a board widget's scaled content) draws now, as
    boxes in the widget's page units; `null` when it isn't drawn (hidden,
    off screen), so nothing is known. */
function drawnCards(content: HTMLElement, scale: number): DrawnCard[] | null {
  const box = content.getBoundingClientRect();
  if (!(box.width > 0) || !(content.offsetWidth > 0) || !(scale > 0)) return null;
  // Screen pixels per page unit of the widget.
  const ratio = box.width / (content.offsetWidth * scale);
  const cards: DrawnCard[] = [];
  const seen = new Set<string>();
  for (const el of content.querySelectorAll<HTMLElement>("[data-boardkit-board] section[data-list-id] article[data-card-id]")) {
    const cardId = el.dataset.cardId;
    if (!cardId || seen.has(cardId)) continue;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    seen.add(cardId);
    cards.push({ cardId, x: (r.left - box.left) / ratio, y: (r.top - box.top) / ratio, w: r.width / ratio, h: r.height / ratio });
  }
  return cards;
}

/** Makes the card objects of the board widget `boardShapeId` match the
    cards it draws. Never an undo step. */
export function syncCards(editor: Editor, boardShapeId: TLShapeId, content: HTMLElement): void {
  const board = editor.getShape(boardShapeId);
  if (!board || board.type !== "boardkit-board") return;
  const { boardId, scale } = board.props as { boardId: string; scale: number };
  // One of Boardkit's own drags (a list, while the board is edited) moves
  // things about for a moment: wait for it to end.
  if (document.querySelector("[data-boardkit-lifted]")) return;
  const drawn = drawnCards(content, scale);
  if (!drawn) return;
  const have = editor
    .getSortedChildIdsForParent(boardShapeId)
    .map((id) => editor.getShape(id))
    .filter(isCard)
    .map((s) => ({ id: s.id, cardId: s.props.cardId, boardId: s.props.boardId, x: s.x, y: s.y, w: s.props.w, h: s.props.h }));
  const { remove, add, move } = cardChanges(have, drawn, boardId, (cardId) => cardShapeId(boardShapeId, cardId));
  if (remove.length === 0 && add.length === 0 && move.length === 0) return;
  syncing = true;
  try {
    apply();
  } finally {
    syncing = false;
  }
  function apply() {
    editor.run(
    () => {
      if (remove.length > 0) editor.deleteShapes(remove);
      if (add.length > 0)
        editor.createShapes(
          add.map(
            (card): TLShapePartial<CardShape> => ({ id: cardShapeId(boardShapeId, card.cardId), type: CARD_TYPE, parentId: boardShapeId, x: card.x, y: card.y, props: { boardId, cardId: card.cardId, w: card.w, h: card.h } }),
          ),
        );
      if (move.length > 0)
        editor.updateShapes(move.map((card): TLShapePartial<CardShape> => ({ id: card.id, type: CARD_TYPE, x: card.x, y: card.y, rotation: 0, props: { boardId, cardId: card.cardId, w: card.w, h: card.h } })));
    },
    { history: "ignore", ignoreShapeLock: true },
    );
  }
}

/** Set while `syncCards` itself adds and removes card objects. */
let syncing = false;

/**
 * Card objects only ever mirror the cards their boards draw: tldraw's own
 * ways of deleting and copying things don't apply to them (deleting and
 * copying cards is GT-6 step 3, done in Boardkit's data). So:
 *  - a card object is deleted only by the sync, or along with its board
 *    (Delete on a picked card does nothing);
 *  - a card object made any other way (a duplicate, a paste) is taken away
 *    at once.
 * Returns a stop function.
 */
export function keepCardObjectsTrue(editor: Editor): () => void {
  /** Boards being deleted right now: their cards go with them. */
  const leaving = new Set<TLShapeId>();
  const stopDelete = editor.sideEffects.registerBeforeDeleteHandler("shape", (shape, source) => {
    if (source !== "user") return;
    if (shape.type === "boardkit-board") {
      if (leaving.size === 0) queueMicrotask(() => leaving.clear());
      leaving.add(shape.id);
      return;
    }
    if (!isCard(shape) || syncing) return;
    const parent = editor.getShape(shape.parentId as TLShapeId);
    if (!parent || parent.type !== "boardkit-board" || leaving.has(parent.id)) return;
    // A stray one (a duplicate, a paste) may go.
    if (shape.id !== cardShapeId(parent.id, shape.props.cardId)) return;
    return false;
  });
  // A board taken off the page without its cards (an undo of placing it:
  // the cards were never undo steps): they go with it.
  const stopOrphans = editor.sideEffects.registerAfterDeleteHandler("shape", (shape) => {
    if (shape.type !== "boardkit-board") return;
    queueMicrotask(() => {
      if (editor.getShape(shape.id)) return;
      const left = editor.getSortedChildIdsForParent(shape.id).filter((id) => isCard(editor.getShape(id)));
      if (left.length === 0) return;
      syncing = true;
      try {
        editor.run(() => editor.deleteShapes(left), { history: "ignore", ignoreShapeLock: true });
      } finally {
        syncing = false;
      }
    });
  });
  const stopCreate = editor.sideEffects.registerAfterCreateHandler("shape", (shape, source) => {
    if (source !== "user" || !isCard(shape) || syncing) return;
    const parent = editor.getShape(shape.parentId as TLShapeId);
    if (parent?.type === "boardkit-board" && shape.id === cardShapeId(parent.id, shape.props.cardId)) return;
    queueMicrotask(() => {
      if (!editor.getShape(shape.id)) return;
      syncing = true;
      try {
        editor.run(() => editor.deleteShapes([shape.id]), { history: "ignore", ignoreShapeLock: true });
      } finally {
        syncing = false;
      }
    });
  });
  return () => {
    stopDelete();
    stopCreate();
    stopOrphans();
  };
}

/** The scaled content of each board widget drawn now, to sync at once
    (after a card move: the objects follow before the next frame). */
const drawnBoards = new Map<TLShapeId, HTMLElement>();
export function syncCardsNow(editor: Editor, boardShapeId?: TLShapeId): void {
  for (const [id, content] of drawnBoards) if (!boardShapeId || id === boardShapeId) syncCards(editor, id, content);
}

/**
 * Keeps the card objects of a board widget where its cards are drawn:
 * after every change to what the board shows (cards added, moved, renamed,
 * a list folded) and to the widget's scale.
 */
export function useCardObjects(shapeId: TLShapeId, content: RefObject<HTMLElement | null>, scale: number, off: boolean): void {
  const editor = useEditor();
  useLayoutEffect(() => {
    const el = content.current;
    if (!el || off) return;
    drawnBoards.set(shapeId, el);
    let frame = 0;
    const sizes = new ResizeObserver(() => later());
    sizes.observe(el);
    const watched = new Set<Element>();
    const run = () => {
      frame = 0;
      syncCards(editor, shapeId, el);
      // Lists come and go: watch the ones there now (a card changing height
      // changes its list's).
      const lists = new Set(el.querySelectorAll("section[data-list-id]"));
      for (const list of watched) {
        if (lists.has(list)) continue;
        sizes.unobserve(list);
        watched.delete(list);
      }
      for (const list of lists) {
        if (watched.has(list)) continue;
        sizes.observe(list);
        watched.add(list);
      }
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    const changes = new MutationObserver(later);
    changes.observe(el, { childList: true, subtree: true, characterData: true });
    run();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      sizes.disconnect();
      changes.disconnect();
      if (drawnBoards.get(shapeId) === el) drawnBoards.delete(shapeId);
    };
  }, [editor, shapeId, content, scale, off]);
}
