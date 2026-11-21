import { Box, type Editor, type StateNode, type TLShapeId } from "tldraw";

import { isCard } from "./CardShape";

/** What a selection box picks of a board and its cards. A box touches a
    board whenever it touches one of its cards, so tldraw picks both; only
    one of the two is meant. Pure; tested in brush.test.ts.
     - the box holds the whole board: the board (as one thing);
     - else, it touches some of its cards: those cards, not the board;
     - it touches the board but none of its cards: the board, as before. */
export function boardOrCards(picked: readonly TLShapeId[], parentOfCard: (id: TLShapeId) => TLShapeId | null, holdsWhole: (boardId: TLShapeId) => boolean): TLShapeId[] {
  const set = new Set(picked);
  const drop = new Set<TLShapeId>();
  for (const id of picked) {
    const board = parentOfCard(id);
    if (!board || !set.has(board)) continue;
    drop.add(holdsWhole(board) ? id : board);
  }
  return drop.size === 0 ? [...picked] : picked.filter((id) => !drop.has(id));
}

/** Wraps tldraw's box select (select.brushing; tldraw is pinned for this)
    so a box picks single cards (GT-6). Returns a stop function. */
export function brushPicksCards(editor: Editor): () => void {
  const brushing = editor.getStateDescendant("select.brushing") as (StateNode & { hitTestShapes: () => void }) | undefined;
  if (!brushing) return () => {};
  const own = brushing.hitTestShapes;
  const wrapped = function (this: unknown) {
    own.call(this);
    const brush = editor.getInstanceState().brush;
    const picked = editor.getSelectedShapeIds();
    if (!brush || picked.length < 2) return;
    const box = Box.From(brush);
    const next = boardOrCards(
      picked,
      (id) => {
        const shape = editor.getShape(id);
        return isCard(shape) ? (shape.parentId as TLShapeId) : null;
      },
      (boardId) => {
        const bounds = editor.getShapePageBounds(boardId);
        return !!bounds && box.contains(bounds);
      },
    );
    if (next.length !== picked.length) editor.setSelectedShapes(next);
  };
  Object.defineProperty(brushing, "hitTestShapes", { value: wrapped, configurable: true, writable: true });
  return () => Object.defineProperty(brushing, "hitTestShapes", { value: own, configurable: true, writable: true });
}
