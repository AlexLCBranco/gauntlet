import { useEffect, useLayoutEffect, useRef } from "react";
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
import { WhiteboardBoard, useSelectionStore } from "./boardkit";
import { fitBoard } from "./fit";
import { registryBoards, useRegistry } from "./registry";
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

  // Editing began with a double-click on a card or list title: rename it,
  // as a click on a title does in Boardkit.
  useEffect(() => {
    if (!editing) return;
    const p = editor.inputs.getCurrentScreenPoint();
    const vp = editor.getViewportScreenBounds();
    const at = { x: p.x + vp.x, y: p.y + vp.y };
    let frame = requestAnimationFrame(function find(tries = 0) {
      const hit = document.elementFromPoint(at.x, at.y);
      const root = content.current?.querySelector('[data-editing="true"]');
      if (!root) {
        if (tries < 10) frame = requestAnimationFrame(() => find(tries + 1));
        return;
      }
      if (!hit || !root.contains(hit)) return;
      const title = hit.closest("[data-card-title], h2")?.querySelector<HTMLElement>("button");
      title?.click();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, editor]);

  // While editing, what happens inside the board is Boardkit's, not the
  // whiteboard's. Keys: Delete must not delete the board, arrows must not
  // nudge it. Presses: dragging a card must not move the board, a
  // double-click must not start anything else. tldraw reads both on its
  // container, before React; marking them handled makes it skip them,
  // while they still reach the page (Boardkit's menus close on a press
  // elsewhere, its drags follow the pointer there).
  // Escape still ends editing, unless Boardkit has a use for it (a text
  // field, a drag to cancel, a selection or copied cards to let go of).
  useEffect(() => {
    if (!editing) return;
    const el = content.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || boardkitTakesEscape(e.target)) editor.markEventAsHandled(e);
    };
    const onPointer = (e: Event) => editor.markEventAsHandled(e);
    // A drag can end anywhere, focus anywhere: Escape cancels it, and only that.
    const onDragEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && boardkitDragging()) editor.markEventAsHandled(e);
    };
    // Keys that reach only the page (focus fell off a field or button that
    // went away) never reach tldraw: Escape still ends editing.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.target !== document.body) return;
      editor.setEditingShape(null);
      editor.getContainer().focus({ preventScroll: true });
    };
    const pointerEvents = ["pointerdown", "pointerup", "click"] as const;
    el.addEventListener("keydown", onKey);
    el.addEventListener("keyup", onKey);
    for (const type of pointerEvents) el.addEventListener(type, onPointer);
    window.addEventListener("keydown", onDragEscape, true);
    window.addEventListener("keydown", onEscape);
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("keyup", onKey);
      for (const type of pointerEvents) el.removeEventListener(type, onPointer);
      window.removeEventListener("keydown", onDragEscape, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [editing, editor]);

  return (
    <HTMLContainer id={shape.id} style={{ pointerEvents: editing ? "all" : "none", overflow: "visible" }}>
      <div
        ref={content}
        className="gb-scaled"
        style={{ transform: `scale(${scale || 1})`, visibility: scale ? "visible" : "hidden" }}
        // A right-click inside the board being edited opens Boardkit's menu
        // (or its thots), not the whiteboard's.
        onContextMenu={editing ? (e) => e.stopPropagation() : undefined}
      >
        <BoardName boardId={boardId} />
        <WhiteboardBoard boardId={boardId} editing={editing} />
      </div>
    </HTMLContainer>
  );
}

/** A card or list of a board is being dragged (dnd-kit marks it pressed). */
const boardkitDragging = () => document.querySelector('[data-boardkit-board] [aria-pressed="true"]') !== null;

/** Whether Boardkit has a use for an Escape pressed on `target`. */
function boardkitTakesEscape(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return true;
  if (boardkitDragging()) return true;
  const { selected, clipboard } = useSelectionStore.getState();
  return Object.keys(selected).length > 0 || clipboard.length > 0;
}

/** The board's name in Boardkit's list, kept current. */
function BoardName({ boardId }: { boardId: string }) {
  const name = registryBoards(useRegistry()).find((b) => b.id === boardId)?.name;
  return name ? <div className="gb-name">{name}</div> : null;
}
