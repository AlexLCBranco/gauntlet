import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { atom, createShapeId, useEditor, useValue, type Editor, type TLUiToolItem } from "tldraw";

import { SHEET } from "../pages/sheet";
import { BOARD_TYPE, type BoardShape } from "./BoardShape";
import { registryBoards, useRegistry } from "./registry";

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

/** The toolbar's "Board" button, a tool like the others (so it shares the
    toolbar's row and its overflow menu): it opens the list of Boardkit's
    boards (BoardPicker). Wired in the whiteboard's `overrides.tools`. */
export function boardToolItem(): TLUiToolItem {
  return {
    id: "board",
    label: "tool.board" as never,
    icon: boardIcon,
    // (tldraw calls it on pointer down and again on click, so no toggle.)
    onSelect: () => pickerOpen.set(true),
  };
}

/** The button, on the toolbar or in its overflow menu. */
const BUTTON = '[data-testid="tools.board"], [data-testid="tools.more.board"]';

/** The list of Boardkit's boards, under the Board button (or under the
    toolbar when the button is in the overflow menu). A click puts that
    board on the current page, in the middle, selected. */
export function BoardPicker() {
  const editor = useEditor();
  const open = useValue(pickerOpen);
  const raw = useRegistry();
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const boards = registryBoards(raw);

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
      <div className="gb-picker-title">Boardkit boards</div>
      {boards.length === 0 && <div className="gb-picker-empty">No boards yet: make one at /boardkit.</div>}
      {boards.map((b) => (
        <button key={b.id} role="menuitem" data-board={b.id} onClick={() => placeBoard(editor, b.id)}>
          {b.name}
        </button>
      ))}
    </div>
  );
}

function placeBoard(editor: Editor, boardId: string) {
  const id = createShapeId();
  const { w, h } = editor.getShapeUtil<BoardShape>(BOARD_TYPE).getDefaultProps();
  editor.markHistoryStoppingPoint("add board");
  editor.createShape<BoardShape>({ id, type: BOARD_TYPE, x: SHEET.w / 2 - w / 2, y: SHEET.h / 2 - h / 2, props: { boardId } });
  editor.setCurrentTool("select");
  editor.select(id);
  pickerOpen.set(false);
}
