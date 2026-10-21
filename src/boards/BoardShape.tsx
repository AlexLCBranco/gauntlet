import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  resizeBox,
  useEditor,
  useIsEditing,
  useValue,
  type RecordProps,
  type TLResizeInfo,
  type TLShape,
} from "tldraw";

import { useLinkedMap } from "../maps/linkedMap";
import type { PageRect } from "../maps/linkkit";
import { MapView } from "../maps/MapView";
import { pageBox } from "../pages/keepFilled";
import { insideDelta } from "../pages/sheet";
import { portalEventsHandled } from "../whiteboard/widgetEvents";
import { BoardName } from "./BoardName";
import { WhiteboardBoard, useSelectionStore } from "./boardkit";
import { fitBoard } from "./fit";
import { editingHalf, viewOf } from "./views";
import { ViewSwitch } from "./ViewSwitch";
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
 *
 * A board with a linked Linkkit map is one widget with both: its list, its
 * map, or the two side by side ("List | Map | Both", `meta.view`, views.ts),
 * moved and scaled as one (owner, 2026-10-21). In Both, the half
 * double-clicked is the one edited; a press on the other half edits that.
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
  const selected = useValue("board selected", () => editor.getSelectedShapeIds().includes(shape.id), [editor, shape.id]);
  const hovered = useValue("board hovered", () => editor.getHoveredShapeId() === shape.id, [editor, shape.id]);
  const content = useRef<HTMLDivElement>(null);
  const mapHalf = useRef<HTMLDivElement>(null);
  const { boardId, scale } = shape.props;
  const linkedMap = useLinkedMap(boardId);
  const view = linkedMap ? viewOf(shape) : "list";
  const half = useValue(
    "half edited",
    () => {
      const h = editingHalf.get();
      return h?.shapeId === shape.id ? h.half : "list";
    },
    [shape.id],
  );
  // What is being edited: the list (Boardkit's), or the map (Linkkit's).
  const listEditing = editing && (view === "list" || (view === "both" && half === "list"));
  const mapEditing = editing && linkedMap !== null && (view === "map" || (view === "both" && half === "map"));

  // In Both, editing starts on the half last pressed (the double-click's;
  // Enter: the list). Seen as the press happens: once editing starts, the
  // halves are drawn anew and may move for a moment.
  const pressedMap = useRef(false);
  useEffect(() => {
    if (editing || view !== "both") return;
    const onDown = (e: PointerEvent) => {
      const r = mapHalf.current?.getBoundingClientRect();
      pressedMap.current = !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [editing, view]);
  useLayoutEffect(() => {
    if (!editing) {
      if (editingHalf.get()?.shapeId === shape.id) editingHalf.set(null);
      return;
    }
    if (view !== "both" || editingHalf.get()?.shapeId === shape.id) return;
    editingHalf.set({ shapeId: shape.id, half: pressedMap.current ? "map" : "list" });
  }, [editing, view, shape.id]);

  // In Both, while one half is edited, a press on the other edits that one.
  useEffect(() => {
    if (!editing || view !== "both") return;
    const el = content.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const onMap = !!mapHalf.current?.contains(e.target as Node);
      const onList = !onMap && !!el.querySelector("[data-boardkit-board]")?.contains(e.target as Node);
      if (!onMap && !onList) return;
      const now = editingHalf.get();
      const next = onMap ? "map" : "list";
      if (now?.shapeId === shape.id && now.half === next) return;
      editor.markEventAsHandled(e);
      e.stopPropagation();
      editingHalf.set({ shapeId: shape.id, half: next });
    };
    el.addEventListener("pointerdown", onDown, true);
    return () => el.removeEventListener("pointerdown", onDown, true);
  }, [editing, view, editor, shape.id]);

  // The part of Linkkit's page the map shows moved its top-left corner (a
  // box further left or up): the widget moves by as much, so the boxes stay
  // where they are on the whiteboard (as a map widget does, maps/MapShape).
  const onMapContent = useCallback(
    (box: PageRect) => {
      const current = editor.getShape<BoardShape>(shape.id);
      if (!current) return;
      const crop = current.meta?.crop as { x: number; y: number } | undefined;
      if (crop?.x === box.left && crop?.y === box.top) return;
      const s = current.props.scale || 1;
      const move = crop && current.props.scale > 0 ? { x: current.x + (box.left - crop.x) * s, y: current.y + (box.top - crop.y) * s } : {};
      editor.run(
        () => editor.updateShape<BoardShape>({ id: shape.id, type: BOARD_TYPE, ...move, meta: { ...current.meta, crop: { x: box.left, y: box.top } } }),
        { history: "ignore" },
      );
    },
    [editor, shape.id],
  );

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
  // as a click on a title does in Boardkit. On an add button ("+ Add a
  // card", "+ Add a list" or their slim "+"; anywhere, on a board with no
  // lists yet): open it. Found by Boardkit's fixed markers (`data-add`),
  // never by their text.
  useEffect(() => {
    if (!listEditing) return;
    // Where the press was: its own point for a slim "+" (tldraw's pointer
    // can lag a move behind on a busy page, and then hit a card instead).
    const p = editor.inputs.getCurrentScreenPoint();
    const vp = editor.getViewportScreenBounds();
    const at = slimPress ?? { x: p.x + vp.x, y: p.y + vp.y };
    slimPress = null;
    const find = (tries: number) => {
      const hit = document.elementFromPoint(at.x, at.y);
      const root = content.current?.querySelector('[data-boardkit-board][data-editing="true"]');
      if (!root) {
        if (tries < 10) frame = requestAnimationFrame(() => find(tries + 1));
        return;
      }
      if (!hit || !content.current?.contains(hit)) return;
      const adds = [...root.querySelectorAll<HTMLElement>("[data-add]")];
      const empty = !root.querySelector("section[data-list-id]");
      const title = root.contains(hit) ? hit.closest("[data-card-title], h2")?.querySelector<HTMLElement>("button") : null;
      (title ?? adds.find((b) => b.contains(hit)) ?? (empty ? adds.find((b) => b.dataset.add === "list") : null))?.click();
    };
    let frame = requestAnimationFrame(() => find(0));
    return () => cancelAnimationFrame(frame);
  }, [listEditing, editor]);

  // Not editing, the board ignores the pointer (it is moved as a whole), and
  // its slim "+" buttons sit just outside its box. A press on one that is
  // showing starts editing right there, and the effect above opens it.
  useEffect(() => {
    if (listEditing || view === "map") return;
    const el = content.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || editor.getCurrentToolId() !== "select") return;
      const hit = [...el.querySelectorAll<HTMLElement>("[data-add][data-slim]")].find((b) => {
        if (Number(getComputedStyle(b).opacity) < 0.5) return false;
        const r = b.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (!hit) return;
      editor.markEventAsHandled(e);
      slimPress = { x: e.clientX, y: e.clientY };
      editingHalf.set({ shapeId: shape.id, half: "list" });
      editor.select(shape.id);
      editor.setEditingShape(shape.id);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [listEditing, view, editor, shape.id]);

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
    if (!listEditing) return;
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
  }, [listEditing, editor]);

  return (
    <HTMLContainer id={shape.id} style={{ pointerEvents: editing ? "all" : "none", overflow: "visible" }}>
      <div
        ref={content}
        className="gb-scaled"
        data-active={selected || editing || hovered ? "" : undefined}
        data-view={view}
        style={{ transform: `scale(${scale || 1})`, visibility: scale ? "visible" : "hidden" }}
        {...portalEventsHandled(editor)}
        // A right-click inside the board being edited opens Boardkit's menu
        // (or its thots), not the whiteboard's.
        onContextMenu={(e) => {
          if (listEditing || !e.currentTarget.contains(e.target as Node)) e.stopPropagation();
        }}
      >
        <div className="gb-head">
          <BoardName shapeId={shape.id} boardId={boardId} shown={scale > 0} />
          {linkedMap && <ViewSwitch shapeId={shape.id} view={view} />}
        </div>
        <div className="gb-views">
          {view !== "map" && <WhiteboardBoard boardId={boardId} editing={listEditing} active={selected || editing} />}
          {view !== "list" && linkedMap && (
            <div ref={mapHalf} className="gb-map">
              <MapView mapId={linkedMap} editing={mapEditing} onContent={onMapContent} room={view === "both" ? BOTH_ROOM : undefined} />
            </div>
          )}
        </div>
      </div>
    </HTMLContainer>
  );
}

/** In Both, the map's paper while it is edited reaches only part of the
    way back towards the list beside it (boards.css: .gb-views' gap). */
const BOTH_ROOM = { left: 24, top: 120, right: 120, bottom: 120 };

/** Where a press on a slim "+" was (window pixels), for the editing that
    press starts to open that "+". */
let slimPress: { x: number; y: number } | null = null;

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
