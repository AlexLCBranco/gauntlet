import type { Editor, TLRecord } from "tldraw";

import { createWhiteboardBoard, deleteEmptyWhiteboardBoard } from "./boardkit";
import { BOARD_TYPE, type BoardShape } from "./BoardShape";
import { registryChanged } from "./registry";

/** The name "+ New board" gives a board (AddBoard.tsx). */
export const NEW_BOARD_NAME = "Untitled";

/** Boardkit's board id type (a branded string). */
type BoardkitId = Parameters<typeof deleteEmptyWhiteboardBoard>[0];

const isBoard = (r: TLRecord): r is BoardShape => r.typeName === "shape" && (r as BoardShape).type === BOARD_TYPE;

/**
 * A board made with "+ New board" (its widget's `meta.newBoard`) that is
 * still empty (no lists, nothing in its trash, never renamed) is deleted
 * from Boardkit too when its widget leaves the whiteboard: its creation
 * undone, the widget deleted, its page cleared (owner, 2026-10-20). Not
 * while another widget still shows it. If the widget comes back (redo,
 * undo of the delete), the board is made again with the same id. A board
 * with anything in it is never deleted: the widget goes, the board stays
 * in Boardkit. Returns a stop function.
 */
export function takeBackEmptyNewBoards(editor: Editor): () => void {
  const taken = new Set<string>();
  const shown = (boardId: string) => editor.store.allRecords().some((r) => isBoard(r) && r.props.boardId === boardId);
  const stopDelete = editor.sideEffects.registerAfterDeleteHandler("shape", (shape, source) => {
    if (source !== "user" || !isBoard(shape) || shape.meta?.newBoard !== true) return;
    const { boardId } = shape.props;
    // After the whole change: a page cleared removes every widget at once.
    queueMicrotask(() => {
      if (shown(boardId) || !deleteEmptyWhiteboardBoard(boardId as BoardkitId, NEW_BOARD_NAME)) return;
      taken.add(boardId);
      registryChanged();
    });
  });
  const stopCreate = editor.sideEffects.registerAfterCreateHandler("shape", (shape, source) => {
    if (source !== "user" || !isBoard(shape) || !taken.has(shape.props.boardId)) return;
    taken.delete(shape.props.boardId);
    createWhiteboardBoard(NEW_BOARD_NAME, shape.props.boardId as BoardkitId);
    registryChanged();
  });
  return () => {
    stopDelete();
    stopCreate();
  };
}
