import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  resizeBox,
  useEditor,
  useIsEditing,
  type RecordProps,
  type TLResizeInfo,
  type TLShape,
} from "tldraw";

import { SHEET } from "../pages/sheet";
import { BoardView } from "./BoardView";
import { fitBoard } from "./fit";
import { redo, undo } from "./store";
import "./boards.css";

export const BOARD_TYPE = "boardkit-board";

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [BOARD_TYPE]: {
      /** The Boardkit board shown (its `boardkit:board:<id>` record). */
      boardId: string;
      /** The box on the page: natural size x `scale` (fit.ts). */
      w: number;
      h: number;
      /** How much the board is scaled; 0 until first drawn (fit.ts). */
      scale: number;
    };
  }
}

export type BoardShape = TLShape<typeof BOARD_TYPE>;

/**
 * A Boardkit board as a whiteboard object: a "live screenshot". It sits on
 * the page like a picture (select, move, drag a corner to scale it, the
 * whole board with it) and shows the real board, kept current. Double-click
 * it (or Enter) to edit the cards in place; Escape or a click outside ends
 * that. The board's data stays in Boardkit's record (PROJECT.md, DECISIONS).
 */
export class BoardShapeUtil extends BaseBoxShapeUtil<BoardShape> {
  static override type = BOARD_TYPE;
  static override props: RecordProps<BoardShape> = { boardId: T.string, w: T.number, h: T.number, scale: T.number };

  override getDefaultProps(): BoardShape["props"] {
    return { boardId: "", w: 320, h: 200, scale: 0 };
  }
  override canEdit() {
    return true;
  }
  override isAspectRatioLocked() {
    return true;
  }
  override onResize(shape: BoardShape, info: TLResizeInfo<BoardShape>) {
    const next = resizeBox(shape, info);
    const from = info.initialShape.props;
    return { ...next, props: { ...next.props, scale: (from.scale || 1) * (next.props.w / from.w) } };
  }
  override component(shape: BoardShape) {
    return <BoardShapeComponent shape={shape} />;
  }
  override getIndicatorPath(shape: BoardShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

function BoardShapeComponent({ shape }: { shape: BoardShape }) {
  const editor = useEditor();
  const editing = useIsEditing(shape.id);
  const content = useRef<HTMLDivElement>(null);
  const { boardId, scale } = shape.props;

  // Keep the box the size of the content (fit.ts). Not an undo step.
  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const measure = () => {
      const current = editor.getShape<BoardShape>(shape.id);
      if (!current) return;
      const fit = fitBoard({ w: el.offsetWidth, h: el.offsetHeight }, current.props.scale, SHEET);
      const p = current.props;
      if (Math.abs(fit.w - p.w) < 0.5 && Math.abs(fit.h - p.h) < 0.5 && fit.scale === p.scale) return;
      // Placed new: grow from the middle, where it was put.
      const move = p.scale === 0 ? { x: current.x + (p.w - fit.w) / 2, y: current.y + (p.h - fit.h) / 2 } : {};
      editor.run(() => editor.updateShape<BoardShape>({ id: shape.id, type: BOARD_TYPE, ...move, props: fit }), { history: "ignore" });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, shape.id]);

  // Where the double-click was, so editing starts on the card under it.
  const [startAt, setStartAt] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!editing) return setStartAt(null);
    const p = editor.inputs.getCurrentScreenPoint();
    const vp = editor.getViewportScreenBounds();
    setStartAt({ x: p.x + vp.x, y: p.y + vp.y });
  }, [editing, editor]);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y while this board is being edited (and
  // no text field has the keys) undo and redo its card edits.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("textarea, input, [contenteditable='true']")) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      e.preventDefault();
      e.stopPropagation();
      if (k === "y" || e.shiftKey) redo(boardId);
      else undo(boardId);
    };
    // Keys that reach only the page (focus fell off a field or button that
    // went away) never reach tldraw: Escape still ends editing.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.target !== document.body) return;
      editor.setEditingShape(null);
      editor.getContainer().focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [editing, boardId, editor]);

  return (
    <HTMLContainer id={shape.id} style={{ pointerEvents: editing ? "all" : "none", overflow: "visible" }}>
      <div
        ref={content}
        className="gb-scaled"
        style={{ transform: `scale(${scale || 1})`, visibility: scale ? "visible" : "hidden" }}
      >
        <BoardView
          boardId={boardId}
          editing={editing}
          startAt={startAt}
          contentScale={() => editor.getZoomLevel() * (editor.getShape<BoardShape>(shape.id)?.props.scale || 1)}
        />
      </div>
    </HTMLContainer>
  );
}
