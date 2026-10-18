import { useEffect, useRef, useState } from "react";
import { createShapeId, useEditor } from "tldraw";

import { SHEET } from "../pages/sheet";
import { BOARD_TYPE, type BoardShape } from "./BoardShape";
import { registryBoards } from "./record";
import { useRegistry } from "./store";

const boardIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <rect x="2" y="3" width="4.5" height="12" rx="1" />
    <rect x="7.75" y="3" width="4.5" height="8" rx="1" />
    <rect x="13.5" y="3" width="2.5" height="5" rx="0.8" />
  </svg>
);

/** The toolbar's "Board" button: lists Boardkit's boards; a click puts one
    on the current page, in the middle, selected. */
export function AddBoard() {
  const editor = useEditor();
  const raw = useRegistry();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const boards = registryBoards(raw);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  const place = (boardId: string) => {
    const id = createShapeId();
    const { w, h } = editor.getShapeUtil<BoardShape>(BOARD_TYPE).getDefaultProps();
    editor.markHistoryStoppingPoint("add board");
    editor.createShape<BoardShape>({ id, type: BOARD_TYPE, x: SHEET.w / 2 - w / 2, y: SHEET.h / 2 - h / 2, props: { boardId } });
    editor.setCurrentTool("select");
    editor.select(id);
    setOpen(false);
  };

  return (
    <div className="gb-add-board" ref={box}>
      <button
        className="tlui-button tlui-button__tool"
        data-testid="add-board"
        aria-label="Board"
        title="Board: put a Boardkit board on the page"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {boardIcon}
      </button>
      {open && (
        <div className="gb-picker" role="menu" data-testid="board-picker">
          <div className="gb-picker-title">Boardkit boards</div>
          {boards.length === 0 && <div className="gb-picker-empty">No boards yet: make one at /boardkit.</div>}
          {boards.map((b) => (
            <button key={b.id} role="menuitem" data-board={b.id} onClick={() => place(b.id)}>
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
