import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { atom, createShapeId, useEditor, useValue, type Editor, type TLUiToolItem } from "tldraw";

import { pageBox } from "../pages/keepFilled";
import { insideDelta, SHEET } from "../pages/sheet";
import { BOARD_TYPE, type BoardShape } from "./BoardShape";
import { useLinkedMaps } from "../maps/linkedMap";
import { namingBoard } from "./BoardName";
import { MapBadge } from "./mapLink";
import { createWhiteboardBoard } from "./boardkit";
import { NEW_BOARD_NAME } from "./emptyNewBoards";
import { registryBoards, registryChanged, useRegistry } from "./registry";

const boardIcon = (
  <div>
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="2" y="3" width="4.5" height="12" rx="1" />
      <rect x="7.75" y="3" width="4.5" height="8" rx="1" />
      <rect x="13.5" y="3" width="2.5" height="5" rx="0.8" />
    </svg>
  </div>
);

/** Whether the board list is open. */
const pickerOpen = atom("board picker open", false);
/** A new board could not be stored: the list opens to say so. */
const newFailed = atom("new board failed", false);

/** The main menu's "Add existing board…": the list of boards, under the
    toolbar's Board button. */
export function openBoardPicker() {
  newFailed.set(false);
  pickerOpen.set(true);
}

/** A new, empty board on the current page (newBoard); when it can't be
    stored, the list opens with the reason. */
function addNewBoard(editor: Editor) {
  pickerOpen.set(false);
  if (!newBoard(editor)) {
    newFailed.set(true);
    pickerOpen.set(true);
  }
}

/** The toolbar's "Board" button: a click puts a new, empty Boardkit board
    on the current page (owner, 2026-10-22). An existing board is added from
    the main menu (openBoardPicker). Wired in the whiteboard's
    `overrides.tools`. */
export function boardToolItem(editor: Editor): TLUiToolItem {
  return {
    id: "board",
    label: "tool.board" as never,
    icon: boardIcon,
    onSelect: () => addNewBoard(editor),
  };
}

/** The button, on the toolbar or in its overflow menu. */
const BUTTON = '[data-testid="tools.board"], [data-testid="tools.more.board"]';

/** The list of Boardkit's boards, under the Board button. A click puts that
    board on the current page, in the middle of the view, selected. "+ New board" first
    makes a new one in Boardkit (newBoard). */
export function BoardPicker() {
  const editor = useEditor();
  const open = useValue(pickerOpen);
  const raw = useRegistry();
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const failed = useValue(newFailed);
  const boards = registryBoards(raw);
  const links = useLinkedMaps();

  useLayoutEffect(() => {
    if (!open) return;
    // The button on show (tldraw keeps hidden copies for measuring), else
    // the toolbar; kept inside the window.
    const shown = [...document.querySelectorAll(BUTTON), document.querySelector(".gauntlet-top-toolbar")]
      .map((el) => el?.getBoundingClientRect())
      .find((r) => r && r.width > 0);
    const half = 120;
    const left = shown ? shown.left + shown.width / 2 : window.innerWidth / 2;
    setAt({ left: Math.min(Math.max(left, half + 8), window.innerWidth - half - 8), top: shown ? shown.bottom + 6 : 60 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Element;
      // A click on the button keeps it open.
      if (!box.current?.contains(t) && !t.closest?.(BUTTON)) pickerOpen.set(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && pickerOpen.set(false);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  if (!open || !at) return null;
  return (
    <div className="gb-picker" role="menu" data-testid="board-picker" ref={box} style={at}>
      <button role="menuitem" data-testid="new-board" className="gb-picker-new" onClick={() => addNewBoard(editor)}>
        + New board
      </button>
      {failed && <div className="gb-picker-empty">The board could not be saved: this browser's storage is full.</div>}
      <div className="gb-picker-title">Boardkit boards</div>
      {boards.length === 0 && <div className="gb-picker-empty">No boards yet.</div>}
      {boards.map((b) => (
        <button key={b.id} role="menuitem" data-board={b.id} onClick={() => place(editor, b.id, "add board")}>
          {b.name}
          {links[b.id] && <MapBadge />}
        </button>
      ))}
    </div>
  );
}

/**
 * "+ New board": a new, empty Boardkit board named "Untitled" (in Boardkit's
 * storage, so /boardkit lists it), placed in the middle of the view, inside
 * the page, selected, with its name ready to type (BoardName). One Ctrl+Z
 * takes it off the whiteboard; still empty, the board leaves Boardkit too
 * (emptyNewBoards.ts). Returns false when Boardkit could not store it.
 */
function newBoard(editor: Editor): boolean {
  const boardId = createWhiteboardBoard(NEW_BOARD_NAME);
  if (!boardId) return false;
  registryChanged();
  namingBoard.set(place(editor, boardId, "new board", { newBoard: true }));
  return true;
}

/** One undo step: the widget for `boardId` in the middle of the view, kept
    inside the page (placed there at once, so keepInside has nothing to
    move), selected. Both picker entries place boards this way. */
function place(editor: Editor, boardId: string, step: string, meta: Record<string, boolean> = {}) {
  const { w, h } = editor.getShapeUtil<BoardShape>(BOARD_TYPE).getDefaultProps();
  const view = editor.getViewportPageBounds();
  const at = { x: view.midX - w / 2, y: view.midY - h / 2, w, h };
  const d = insideDelta(at, pageBox.get() ?? SHEET);
  const id = createShapeId();
  editor.markHistoryStoppingPoint(step);
  editor.createShape<BoardShape>({ id, type: BOARD_TYPE, x: at.x + d.x, y: at.y + d.y, props: { boardId }, meta });
  editor.setCurrentTool("select");
  editor.select(id);
  pickerOpen.set(false);
  return id;
}
