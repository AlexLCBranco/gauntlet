import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  resizeBox,
  useEditor,
  useIsEditing,
  useValue,
  type Editor,
  type RecordProps,
  type TLResizeInfo,
  type TLShape,
} from "tldraw";

import { useLinkedMap } from "../maps/linkedMap";
import type { PageRect } from "../maps/linkkit";
import { useEditedMap } from "../maps/mapEditing";
import { AddMapView, BoardMenu } from "./mapLink";
import { MapView, type MapShift } from "../maps/MapView";
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
    (box: PageRect, shift: MapShift) => {
      const current = editor.getShape<BoardShape>(shape.id);
      if (!current) return;
      const crop = current.meta?.crop as { x: number; y: number } | undefined;
      const left = box.left - shift.x;
      const top = box.top - shift.y;
      if (crop?.x === left && crop?.y === top) return;
      const s = current.props.scale || 1;
      const move = crop && current.props.scale > 0 ? { x: current.x + (left - crop.x) * s, y: current.y + (top - crop.y) * s } : {};
      editor.run(
        () => editor.updateShape<BoardShape>({ id: shape.id, type: BOARD_TYPE, ...move, meta: { ...current.meta, crop: { x: left, y: top } } }),
        { history: "ignore" },
      );
    },
    [editor, shape.id],
  );
  // While its map is edited, the whole page is the map's (maps/mapEditing.tsx).
  useEditedMap(mapEditing && linkedMap ? { shapeId: shape.id, mapId: linkedMap } : null);

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

  // Editing began with a press on one of the board's controls (below): that
  // control does its part now, as if pressed while editing. Or with a
  // double-click on a card or list title: rename it, as a click on a title
  // does in Boardkit; on an add button (anywhere, on a board with no lists
  // yet): open it. Found by Boardkit's fixed markers (`data-add`,
  // `data-control`), never by their text.
  useEffect(() => {
    if (!listEditing) return;
    const p = editor.inputs.getCurrentScreenPoint();
    const vp = editor.getViewportScreenBounds();
    const at = { x: p.x + vp.x, y: p.y + vp.y };
    const control = pressedControl;
    pressedControl = null;
    const find = (tries: number) => {
      const root = content.current?.querySelector('[data-boardkit-board][data-editing="true"]');
      if (!root) {
        if (tries < 10) frame = requestAnimationFrame(() => find(tries + 1));
        return;
      }
      if (control) {
        root.querySelector<HTMLElement>(controlSelector(control))?.click();
        if (control.add) frame = requestAnimationFrame(() => typeHeldKeys(root, 0));
        return;
      }
      const hit = document.elementFromPoint(at.x, at.y);
      if (!hit || !content.current?.contains(hit)) return;
      const adds = [...root.querySelectorAll<HTMLElement>("[data-add]")];
      const empty = !root.querySelector("section[data-list-id]");
      const title = root.contains(hit) ? hit.closest("[data-card-title], h2")?.querySelector<HTMLElement>("button") : null;
      (title ?? adds.find((b) => b.contains(hit)) ?? (empty ? adds.find((b) => b.dataset.add === "list") : null))?.click();
    };
    // Its field opened: what was typed meanwhile goes into it.
    const typeHeldKeys = (root: Element, tries: number) => {
      const field = root.querySelector<HTMLTextAreaElement>("textarea");
      if (field && document.activeElement === field) releaseHeldKeys(field);
      else if (tries < 30) frame = requestAnimationFrame(() => typeHeldKeys(root, tries + 1));
      else heldKeys?.stop();
    };
    let frame = requestAnimationFrame(() => find(0));
    return () => cancelAnimationFrame(frame);
  }, [listEditing, editor]);

  // Not editing, the board ignores the pointer (it is moved as a whole), and
  // some of its controls sit just outside its box. One press on a control
  // that is showing (a "+" to add a card or a list, a list header's
  // buttons, "⋯" included) starts editing and does that control's part at
  // once (owner, 2026-10-21: one click, not two). Which control is noted
  // here by its markers: once editing starts the board is drawn anew, and
  // its hover-only controls hide again until the pointer moves. A press
  // anywhere else on the board just selects it, as before.
  useEffect(() => {
    if (listEditing || view === "map") return;
    const el = content.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || editor.getCurrentToolId() !== "select") return;
      const hit = [...el.querySelectorAll<HTMLElement>("[data-boardkit-board] [data-add], [data-boardkit-board] [data-list-header] [data-control]")].find((b) => {
        const style = getComputedStyle(b);
        if (Number(style.opacity) < 0.05 || style.visibility === "hidden") return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (!hit) return;
      editor.markEventAsHandled(e);
      pressedControl = {
        add: hit.dataset.add ?? null,
        control: hit.dataset.control ?? null,
        listId: hit.closest<HTMLElement>("section[data-list-id]")?.dataset.listId ?? null,
      };
      // A "+": its field opens a moment from now; typing that starts at once
      // is kept for it.
      if (hit.dataset.add) holdKeys(editor);
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
          {linkedMap ? <BoardMenu shapeId={shape.id} mapId={linkedMap} /> : <AddMapView shapeId={shape.id} boardId={boardId} />}
        </div>
        <div className="gb-views">
          {view !== "map" && <WhiteboardBoard boardId={boardId} editing={listEditing} active={selected || editing} />}
          {view !== "list" && linkedMap && (
            <div ref={mapHalf} className="gb-map" data-editing={mapEditing ? "" : undefined}>
              <MapView mapId={linkedMap} editing={mapEditing} onContent={onMapContent} />
            </div>
          )}
        </div>
      </div>
    </HTMLContainer>
  );
}

/** The control a press started editing on (see above), by its markers. */
type PressedControl = { readonly add: string | null; readonly control: string | null; readonly listId: string | null };
let pressedControl: PressedControl | null = null;

/**
 * Keys typed after a press on a "+" and before its field has the focus
 * (the board is drawn anew for editing first, a frame or two): held here,
 * not taken as whiteboard shortcuts, and typed into the field once it
 * opens (owner, 2026-10-21: typing at once keeps every character).
 * Characters, Backspace and Enter; given up after two seconds.
 */
let heldKeys: { readonly keys: string[]; readonly stop: () => void } | null = null;

function holdKeys(editor: Editor) {
  heldKeys?.stop();
  const keys: string[] = [];
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    // The field has the focus already: what was held goes in first, then
    // this key as typed.
    if (el instanceof HTMLTextAreaElement) {
      releaseHeldKeys(el);
      return;
    }
    if (el && el.tagName === "INPUT") return;
    if (e.ctrlKey || e.metaKey || e.altKey || !(e.key.length === 1 || e.key === "Enter" || e.key === "Backspace")) return;
    keys.push(e.key);
    e.preventDefault();
    e.stopImmediatePropagation();
    editor.markEventAsHandled(e);
  };
  const stop = () => {
    window.removeEventListener("keydown", onKey, true);
    clearTimeout(timer);
    if (heldKeys?.keys === keys) heldKeys = null;
  };
  const timer = setTimeout(stop, 2000);
  window.addEventListener("keydown", onKey, true);
  heldKeys = { keys, stop };
}

/** Types the held keys into `field` (focused), as typed there. */
function releaseHeldKeys(field: HTMLTextAreaElement) {
  const held = heldKeys;
  if (!held) return;
  held.stop();
  let text = "";
  const flush = () => {
    if (text) document.execCommand("insertText", false, text);
    text = "";
  };
  for (const key of held.keys) {
    if (key.length === 1) {
      text += key;
      continue;
    }
    flush();
    if (key === "Backspace") document.execCommand("delete");
    else field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }
  flush();
}

/** The same control on the board being edited. */
function controlSelector({ add, control, listId }: PressedControl): string {
  const inList = listId ? `section[data-list-id="${CSS.escape(listId)}"] ` : "";
  return add ? `${inList}[data-add="${add}"]` : `${inList}[data-list-header] [data-control="${control}"]`;
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
