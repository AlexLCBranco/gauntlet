import { atom, type Editor, type TLShape, type TLShapeId } from "tldraw";

import { BOARD_TYPE, type BoardShape } from "../boards/BoardShape";
import { setWhiteboardItemUrl, whiteboardItemUrl, type WhiteboardLinkTarget } from "../boards/boardkit";
import { linkedMapOf, setWhiteboardBoxUrl, whiteboardBoxUrl } from "../maps/linkkit";
import { MAP_TYPE, type MapShape } from "../maps/MapShape";
import { checkUrl, isWebUrl } from "./url";

/**
 * What can hold a link on the whiteboard (owner, 2026-10-23), and where its
 * link lives:
 *  - a drawn item (rectangle, text, arrow, line, picture, web embed, group,
 *    a map widget...): `meta.url` on the tldraw shape, so it is saved,
 *    copied, duplicated, undone and backed up with the shape;
 *  - a board, a list or a card: Boardkit's record (`url`), so the same link
 *    shows in /boardkit;
 *  - a map box: Linkkit's record (`url`), so it shows in /linkkit.
 */
export type LinkTarget =
  | { readonly kind: "shape"; readonly shapeId: TLShapeId }
  | { readonly kind: "board"; readonly shapeId: TLShapeId; readonly boardId: string; readonly item: WhiteboardLinkTarget; readonly name: string }
  | { readonly kind: "box"; readonly shapeId: TLShapeId; readonly mapId: string; readonly nodeId: string; readonly name: string };

/** tldraw's shapes whose `url` prop is a link of their own. */
const LINK_PROP_TYPES = new Set(["geo", "image"]);

/** A drawn item's link: its own (`meta.url`), else tldraw's `url` prop on
    a shape or picture (a rectangle imported from Excalidraw with a link;
    a web embed's `url` is what it shows, not a link). Only http(s). */
export function shapeUrl(shape: TLShape): string | undefined {
  const own = (shape.meta as { url?: unknown } | undefined)?.url;
  if (isWebUrl(own)) return own;
  if (!LINK_PROP_TYPES.has(shape.type)) return undefined;
  const prop = (shape.props as { url?: unknown }).url;
  if (typeof prop !== "string" || !prop) return undefined;
  const check = checkUrl(prop);
  return check.ok ? check.url : undefined;
}

/** The link `target` holds now, if any. */
export function urlOf(editor: Editor, target: LinkTarget): string | undefined {
  if (target.kind === "board") return whiteboardItemUrl(target.boardId, target.item);
  if (target.kind === "box") return whiteboardBoxUrl(target.mapId, target.nodeId);
  const shape = editor.getShape(target.shapeId);
  return shape ? shapeUrl(shape) : undefined;
}

/** Sets (`undefined`: removes) `target`'s link, as one undo step of the
    page (a shape's in tldraw's history, a board's or map's in its app's,
    which the page undo hears). */
export function setUrlOf(editor: Editor, target: LinkTarget, url: string | undefined): void {
  if (target.kind === "board" || target.kind === "box") {
    // The app's store opens this board or map: no other one stays edited.
    editor.setEditingShape(null);
    if (target.kind === "board") setWhiteboardItemUrl(target.boardId, target.item, url);
    else setWhiteboardBoxUrl(target.mapId, target.nodeId, url);
    return;
  }
  const shape = editor.getShape(target.shapeId);
  if (!shape) return;
  const { url: _old, ...meta } = (shape.meta ?? {}) as Record<string, unknown>;
  const hasProp = LINK_PROP_TYPES.has(shape.type) && typeof (shape.props as { url?: unknown }).url === "string" && (shape.props as { url: string }).url !== "";
  editor.markHistoryStoppingPoint("link");
  // The whole record, not `updateShape`: that merges `meta`, so a removed
  // link would stay.
  editor.store.update(shape.id, (record) => ({
    ...record,
    meta: (url ? { ...meta, url } : meta) as TLShape["meta"],
    // A link from tldraw's own prop moves to ours (one link per item).
    ...(hasProp ? { props: { ...record.props, url: "" } } : {}),
  }) as typeof record);
}

/** The target for a whole item: a board widget's board, any other shape
    itself (a map widget included: the map as a whole is a drawn item). */
export function itemTarget(shape: TLShape): LinkTarget {
  if (shape.type === BOARD_TYPE) {
    return { kind: "board", shapeId: shape.id, boardId: (shape as BoardShape).props.boardId, item: { kind: "board" }, name: "" };
  }
  return { kind: "shape", shapeId: shape.id };
}

const inside = (el: Element, x: number, y: number) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};
const textOf = (el: Element | null | undefined) => (el?.textContent ?? "").trim().replace(/\s+/g, " ");

/**
 * The card, list or box of a board or map widget under the screen point
 * (`x`, `y`), found by where its element is drawn (a widget not being
 * edited ignores the pointer, so the element is never the event's target).
 * `null` off any of them.
 */
export function innerTargetAt(shape: TLShape, x: number, y: number): LinkTarget | null {
  const root = document.getElementById(shape.id);
  if (!root) return null;
  const box = [...root.querySelectorAll("[data-box-id]")].find((el) => inside(el, x, y));
  if (box) {
    const mapId = shape.type === MAP_TYPE ? (shape as MapShape).props.mapId : shape.type === BOARD_TYPE ? linkedMapOf((shape as BoardShape).props.boardId) : null;
    if (mapId) return { kind: "box", shapeId: shape.id, mapId, nodeId: box.getAttribute("data-box-id") ?? "", name: textOf(box.querySelector(":scope > span")) };
  }
  if (shape.type !== BOARD_TYPE) return null;
  const boardId = (shape as BoardShape).props.boardId;
  const card = [...root.querySelectorAll<HTMLElement>("[data-boardkit-board] [data-card-id]")].find((el) => inside(el, x, y));
  if (card) {
    return { kind: "board", shapeId: shape.id, boardId, item: { kind: "card", cardId: card.dataset.cardId ?? "" }, name: textOf(card.querySelector("[data-card-title]")) };
  }
  const header = [...root.querySelectorAll<HTMLElement>("[data-boardkit-board] section[data-list-id] [data-list-header]")].find((el) => inside(el, x, y));
  const listId = header?.closest<HTMLElement>("section[data-list-id]")?.dataset.listId;
  if (header && listId) return { kind: "board", shapeId: shape.id, boardId, item: { kind: "list", listId }, name: textOf(header.querySelector("h2")) };
  return null;
}

/** What the target is, in a word ("card", "box", ...), for menus. */
export function kindOf(editor: Editor, target: LinkTarget): "card" | "list" | "board" | "box" | "map" | "item" {
  if (target.kind === "board") return target.item.kind;
  if (target.kind === "box") return "box";
  return editor.getShape(target.shapeId)?.type === MAP_TYPE ? "map" : "item";
}

/** The link field (LinkPrompt.tsx): what it is open for, and where on the
    screen (its top-left corner, viewport pixels). */
export const linkPrompt = atom<{ readonly target: LinkTarget; readonly at: { readonly x: number; readonly y: number } } | null>("link prompt", null);

/** Opens the link field for `target`, just under the item on the screen. */
export function openLinkPrompt(editor: Editor, target: LinkTarget, at?: { readonly x: number; readonly y: number }): void {
  let where = at;
  if (!where) {
    const bounds = editor.getShapePageBounds(target.shapeId);
    const vp = editor.getViewportScreenBounds();
    const p = bounds ? editor.pageToScreen({ x: bounds.minX, y: bounds.maxY }) : { x: vp.w / 4, y: vp.h / 4 };
    where = { x: p.x, y: p.y + 8 };
  }
  linkPrompt.set({ target, at: where });
}

/** Ctrl+K on the whiteboard: the link field of the one selected item.
    Inside a board or map being edited, Ctrl+K is Boardkit's or Linkkit's. */
export function editSelectedLink(editor: Editor): void {
  if (editor.getEditingShapeId() !== null) return;
  const selected = editor.getSelectedShapes();
  if (selected.length !== 1) return;
  openLinkPrompt(editor, itemTarget(selected[0]));
}
