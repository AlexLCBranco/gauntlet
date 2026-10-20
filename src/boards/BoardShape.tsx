import { useEffect, useLayoutEffect, useRef, type DOMAttributes, type SyntheticEvent } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  resizeBox,
  useEditor,
  useIsEditing,
  type Editor,
  type RecordProps,
  type TLResizeInfo,
  type TLShape,
} from "tldraw";

import { pageBox } from "../pages/keepFilled";
import { insideDelta } from "../pages/sheet";
import { BoardName } from "./BoardName";
import { WhiteboardBoard, useSelectionStore } from "./boardkit";
import { fitBoard } from "./fit";
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
      // Before the page is sized (first render), a board keeps its scale.
      const fit = fitBoard({ w: el.offsetWidth, h: el.offsetHeight }, current.props.scale, pageBox.get() ?? { w: Infinity, h: Infinity });
      const p = current.props;
      if (Math.abs(fit.w - p.w) < 0.5 && Math.abs(fit.h - p.h) < 0.5 && fit.scale === p.scale) return;
      // Placed new: grow from the middle, where it was put, inside the page.
      let move = {};
      if (p.scale === 0) {
        const at = { x: current.x + (p.w - fit.w) / 2, y: current.y + (p.h - fit.h) / 2 };
        const page = pageBox.get();
        const d = page ? insideDelta({ ...at, w: fit.w, h: fit.h }, page) : { x: 0, y: 0 };
        move = { x: at.x + d.x, y: at.y + d.y };
      }
      editor.run(() => editor.updateShape<BoardShape>({ id: shape.id, type: BOARD_TYPE, ...move, props: fit }), { history: "ignore" });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, shape.id]);

  // Editing began with a double-click on a card or list title: rename it,
  // as a click on a title does in Boardkit. On "+ Add a card" or "+ Add a
  // list" (anywhere, on a board with no lists yet): open it.
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
      if (!hit || !content.current?.contains(hit)) return;
      const adds = [...root.querySelectorAll<HTMLElement>("button")].filter((b) => b.textContent?.startsWith("+ Add a "));
      const empty = !root.querySelector("section[data-list-id]");
      const title = root.contains(hit) ? hit.closest("[data-card-title], h2")?.querySelector<HTMLElement>("button") : null;
      (title ?? adds.find((b) => b.contains(hit)) ?? (empty ? adds[0] : null))?.click();
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
  // field, a drag to cancel, a menu or panel to close, a selection or
  // copied cards to let go of).
  useEffect(() => {
    if (!editing) return;
    const el = content.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || boardkitTakesEscape(e.target)) editor.markEventAsHandled(e);
    };
    const onPointer = (e: Event) => editor.markEventAsHandled(e);
    // A drag can end anywhere, and a menu or panel can be open with focus
    // anywhere: Escape cancels the drag or closes it, and only that. Seen
    // first (window, capture), before Boardkit closes the menu.
    const onBoardkitEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (boardkitDragging() || boardkitOverlayOpen(editor.getContainer()))) editor.markEventAsHandled(e);
    };
    // Keys that reach only the page (focus fell off a field or button that
    // went away) never reach tldraw: Escape still ends editing.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || editor.wasEventAlreadyHandled(e) || e.target !== document.body) return;
      editor.setEditingShape(null);
      editor.getContainer().focus({ preventScroll: true });
    };
    const pointerEvents = ["pointerdown", "pointerup", "click"] as const;
    el.addEventListener("keydown", onKey);
    el.addEventListener("keyup", onKey);
    for (const type of pointerEvents) el.addEventListener(type, onPointer);
    window.addEventListener("keydown", onBoardkitEscape, true);
    window.addEventListener("keydown", onEscape);
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("keyup", onKey);
      for (const type of pointerEvents) el.removeEventListener(type, onPointer);
      window.removeEventListener("keydown", onBoardkitEscape, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [editing, editor]);

  return (
    <HTMLContainer id={shape.id} style={{ pointerEvents: editing ? "all" : "none", overflow: "visible" }}>
      <div
        ref={content}
        className="gb-scaled"
        style={{ transform: `scale(${scale || 1})`, visibility: scale ? "visible" : "hidden" }}
        {...portalEventsHandled(editor)}
        // A right-click inside the board being edited opens Boardkit's menu
        // (or its thots), not the whiteboard's.
        onContextMenu={(e) => {
          if (editing || !e.currentTarget.contains(e.target as Node)) e.stopPropagation();
        }}
      >
        <BoardName shapeId={shape.id} boardId={boardId} shown={scale > 0} />
        <WhiteboardBoard boardId={boardId} editing={editing} />
      </div>
    </HTMLContainer>
  );
}

/**
 * Boardkit draws its menus, dialogs, customise panels and selection bar at
 * the page's top level (React portals). React still sends their events up
 * through the board, and from there into tldraw's canvas: a press in a menu
 * then made tldraw take the pointer (the item never got its click) and end
 * editing, as for a press outside the board. Those events are marked
 * handled here, so tldraw's canvas skips them. Not stopped: React's
 * stopPropagation also stops the page's own listeners (Escape no longer
 * closed Boardkit's customise panel, a dragged card's lifted copy, a
 * portal too, no longer dropped).
 */
const PORTAL_EVENTS = ["onPointerDown", "onPointerUp", "onPointerCancel", "onClick", "onTouchStart", "onTouchEnd"] as const;
function portalEventsHandled(editor: Editor): DOMAttributes<HTMLDivElement> {
  const mark = (e: SyntheticEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.target as Node)) editor.markEventAsHandled(e);
  };
  return Object.fromEntries(PORTAL_EVENTS.map((name) => [name, mark]));
}

/** A card or list of a board is being dragged: Boardkit's lifted copy is up. */
const boardkitDragging = () => document.querySelector("[data-boardkit-lifted]") !== null;

/** One of Boardkit's menus, panels or dialogs is open. They are drawn at the
    page's top level, outside the whiteboard (whose own menus live inside). */
function boardkitOverlayOpen(container: HTMLElement): boolean {
  const open = document.querySelectorAll('[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"], [role="menu"]');
  return [...open].some((el) => !container.contains(el));
}

/** Whether Boardkit has a use for an Escape pressed on `target`. */
function boardkitTakesEscape(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return true;
  if (boardkitDragging()) return true;
  const { selected, clipboard } = useSelectionStore.getState();
  return Object.keys(selected).length > 0 || clipboard.length > 0;
}
