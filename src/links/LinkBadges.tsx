import { useEditor, useValue, type TLShapeId } from "tldraw";

import { BOARD_TYPE, type BoardShape } from "../boards/BoardShape";
import { useWhiteboardBoardUrl } from "../boards/boardkit";
import { pageBox } from "../pages/keepFilled";
import { shapeUrl } from "./targets";
import "./links.css";

/** The icon's size and its gap above the item, in screen pixels; it sits
    this far in from the top-right corner, clear of the corner's resize and
    rotate handles (and the edge's 6 px resize band). */
const SIZE = 20;
const ABOVE = 8;
const IN_FROM_CORNER = 16;

/**
 * The link icon of every item on the page that holds a link (owner,
 * 2026-10-23): the only way to open it, always in a new tab (`noopener`).
 * A click on the item itself still just selects it. Drawn on the canvas
 * (tldraw's OnTheCanvas: it moves and zooms with the page) but kept
 * screen-sized, above the item's top-right corner so it never covers the
 * item or its handles. A board's link is Boardkit's; cards, lists and map
 * boxes show their own icons inside the widget (Boardkit's, Linkkit's).
 */
export function LinkBadges() {
  const editor = useEditor();
  // Which items to look at: joined into one string, so moving an item
  // re-renders only its own icon, not this list.
  const ids = useValue(
    "linked items",
    () =>
      editor
        .getCurrentPageShapes()
        .filter((s) => s.type === BOARD_TYPE || shapeUrl(s))
        .map((s) => `${s.type === BOARD_TYPE ? "b" : "s"}:${s.id}`)
        .join(" "),
    [editor],
  );
  if (!ids) return null;
  return (
    <>
      {ids.split(" ").map((entry) => {
        // "b:shape:abc": the kind, then the id (which has a colon of its own).
        const kind = entry[0];
        const id = entry.slice(2) as TLShapeId;
        return kind === "b" ? <BoardBadge key={id} id={id} /> : <ShapeBadge key={id} id={id} />;
      })}
    </>
  );
}

function ShapeBadge({ id }: { readonly id: TLShapeId }) {
  const editor = useEditor();
  const url = useValue("link", () => {
    const shape = editor.getShape(id);
    return shape ? shapeUrl(shape) : undefined;
  }, [editor, id]);
  return url ? <Badge id={id} url={url} /> : null;
}

function BoardBadge({ id }: { readonly id: TLShapeId }) {
  const editor = useEditor();
  const boardId = useValue("board id", () => editor.getShape<BoardShape>(id)?.props.boardId ?? "", [editor, id]);
  const url = useWhiteboardBoardUrl(boardId);
  return url ? <Badge id={id} url={url} /> : null;
}

function Badge({ id, url }: { readonly id: TLShapeId; readonly url: string }) {
  const editor = useEditor();
  // Where it goes on the screen (the canvas's own pixels): follows the item,
  // the pan and the zoom.
  const at = useValue(
    "link icon place",
    () => {
      const b = editor.getShapePageBounds(id);
      if (!b) return null;
      const topLeft = editor.pageToViewport({ x: b.minX, y: b.minY });
      const bottomRight = editor.pageToViewport({ x: b.maxX, y: b.maxY });
      // A narrow item: the icon starts at its left edge instead.
      const left = Math.max(topLeft.x, bottomRight.x - IN_FROM_CORNER - SIZE);
      let top = topLeft.y - ABOVE - SIZE;
      // No room above (the page's top edge): just below the item instead.
      const pageTop = editor.pageToViewport({ x: 0, y: pageBox.get()?.y ?? 0 }).y;
      if (top < pageTop) top = bottomRight.y + ABOVE;
      return `${Math.round(left)},${Math.round(top)}`;
    },
    [editor, id],
  );
  if (!at) return null;
  const [left, top] = at.split(",").map(Number);
  return (
    <a
      className="gk-link-badge"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      aria-label={`Open link: ${url}`}
      data-link-badge={id}
      data-link-open=""
      draggable={false}
      style={{ transform: `translate(${left}px, ${top}px)` }}
      // The press is the icon's: never a selection, a drag or a resize.
      onPointerDown={(e) => {
        editor.markEventAsHandled(e);
        e.stopPropagation();
      }}
      onPointerUp={(e) => {
        editor.markEventAsHandled(e);
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        editor.markEventAsHandled(e);
        e.stopPropagation();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </a>
  );
}
