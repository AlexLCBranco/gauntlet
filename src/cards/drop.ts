import type { Editor, TLShapeId } from "tldraw";

/** Where in a list a card dropped at height `y` lands: before the first
    card whose middle is below `y` (`middles`: the middles of the list's
    cards, top to bottom, without the cards being dragged). Pure; tested in
    drop.test.ts. */
export function placeAmong(middles: readonly number[], y: number): number {
  const at = middles.findIndex((middle) => y < middle);
  return at < 0 ? middles.length : at;
}

/** The most cards a Boardkit list holds (Boardkit's own rule,
    `domain/limits.ts`; Boardkit refuses a move past it either way). */
export const LIST_HOLDS = 50;

/** Where dragged cards would land: a place in a list of a board widget. */
export interface DropTarget {
  readonly boardShapeId: TLShapeId;
  readonly boardId: string;
  readonly listId: string;
  /** The place, counting the list's cards without the dragged ones. */
  readonly index: number;
  /** The landing line, in screen pixels. */
  readonly line: { readonly x: number; readonly y: number; readonly w: number };
  /** The list can't take the cards (Boardkit's limit): nothing lands. */
  readonly full: boolean;
}

/**
 * The list place under the screen point (`x`, `y`): in the topmost board
 * widget there, the list the point is over (or the nearest one, over a gap
 * between lists), at the height of the point. `dragged`: the cards' own
 * elements, left out of the count. `null` off every board.
 */
export function dropTargetAt(editor: Editor, x: number, y: number, dragged: ReadonlySet<Element>): DropTarget | null {
  const board = editor.getShapeAtPoint(editor.screenToPage({ x, y }), { hitInside: true, filter: (s) => s.type === "boardkit-board" });
  if (!board) return null;
  const root = document.getElementById(board.id);
  const lists = [...(root?.querySelectorAll<HTMLElement>("[data-boardkit-board] section[data-list-id]") ?? [])].map((el) => ({ el, r: el.getBoundingClientRect() })).filter((l) => l.r.width > 0);
  if (lists.length === 0) return null;
  const off = (r: DOMRect) => (x < r.left ? r.left - x : x > r.right ? x - r.right : 0);
  const list = lists.reduce((best, l) => (off(l.r) < off(best.r) ? l : best));
  const listId = list.el.dataset.listId;
  if (!listId) return null;
  const all = [...list.el.querySelectorAll<HTMLElement>("article[data-card-id]")];
  const cards = all.filter((el) => !dragged.has(el)).map((el) => el.getBoundingClientRect());
  const index = placeAmong(cards.map((r) => r.top + r.height / 2), y);
  // The line: in the gap above the card it lands before, or under the last.
  const gap = cards.length > 1 ? Math.max(0, cards[1].top - cards[0].bottom) : 8 * (list.r.width / (list.el.offsetWidth || list.r.width));
  const header = list.el.querySelector("[data-list-header]")?.getBoundingClientRect();
  const side = cards[0] ?? all[0]?.getBoundingClientRect();
  const lineY = cards.length === 0 ? (header ? header.bottom + gap / 2 : list.r.top + gap) : index < cards.length ? cards[index].top - gap / 2 : cards[cards.length - 1].bottom + gap / 2;
  const line = side ? { x: side.left, y: lineY, w: side.width } : { x: list.r.left + gap, y: lineY, w: list.r.width - 2 * gap };
  // Cards already in this list only change place: they need no room.
  const coming = [...dragged].filter((el) => !list.el.contains(el)).length;
  return { boardShapeId: board.id, boardId: (board.props as { boardId: string }).boardId, listId, index, line, full: coming > 0 && all.length + coming > LIST_HOLDS };
}
