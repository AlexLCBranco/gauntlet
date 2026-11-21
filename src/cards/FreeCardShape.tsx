import { useLayoutEffect, useRef } from "react";
import { BaseBoxShapeUtil, HTMLContainer, T, useEditor, type JsonValue, type RecordProps, type TLShape } from "tldraw";

import { WhiteboardCard } from "../boards/boardkit";
import { ExportStyles, useInExport } from "../whiteboard/exportStyles";
import { CARD_TYPE } from "./CardShape";

export const FREE_CARD_TYPE = "boardkit-free-card";

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [FREE_CARD_TYPE]: {
      /** The card itself, as Boardkit keeps one (title, colour, thots...):
          it is in no board's record while it is here. */
      card: Record<string, JsonValue>;
      /** The box on the page. `h` follows what the card needs (its text). */
      w: number;
      h: number;
      /** How much the card is scaled: the size it had on the board it left. */
      scale: number;
    };
  }
}

export type FreeCardShape = TLShape<typeof FREE_CARD_TYPE>;

export const isFreeCard = (shape: TLShape | undefined | null): shape is FreeCardShape => shape?.type === FREE_CARD_TYPE;
/** A card's object: in a list, or free on the page. */
export const isCardType = (type: string) => type === CARD_TYPE || type === FREE_CARD_TYPE;

/**
 * A card outside every list (GT-6 step 2, owner 2026-10-20): dropped on the
 * empty page, it left its list and its board's record (/boardkit no longer
 * has it) and lives here, its data in the shape, so the page's saves,
 * backups, archive files and exports carry it. Unlike a list's card
 * (CardShape.tsx) it is the whiteboard's to move, like any item. Dropped on
 * a list, it is that list's card again (freeDrop.ts). It keeps the size it
 * had on the board it left (owner, 2026-11-21).
 */
export class FreeCardShapeUtil extends BaseBoxShapeUtil<FreeCardShape> {
  static override type = FREE_CARD_TYPE;
  static override props: RecordProps<FreeCardShape> = { card: T.dict(T.string, T.jsonValue), w: T.number, h: T.number, scale: T.number };

  override getDefaultProps(): FreeCardShape["props"] {
    return { card: { id: "", title: "" }, w: 264, h: 40, scale: 1 };
  }
  override canEdit() {
    return false;
  }
  override canResize() {
    return false;
  }
  // Arrows on a card: GT-18.
  override canBind() {
    return false;
  }
  override hideResizeHandles() {
    return true;
  }
  override hideRotateHandle() {
    return true;
  }
  override component(shape: FreeCardShape) {
    return <FreeCard shape={shape} />;
  }
  override getIndicatorPath(shape: FreeCardShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, Math.min(8, shape.props.h / 4));
    return path;
  }
}

function FreeCard({ shape }: { shape: FreeCardShape }) {
  const editor = useEditor();
  const inExport = useInExport();
  const content = useRef<HTMLDivElement>(null);
  const { card, w, scale } = shape.props;
  const s = scale > 0 ? scale : 1;

  // The box is as tall as the card drawn (its text wraps). Not an undo step.
  useLayoutEffect(() => {
    const el = content.current;
    if (!el || inExport) return;
    const measure = () => {
      const current = editor.getShape<FreeCardShape>(shape.id);
      const h = el.offsetHeight * s;
      if (!current || !(h > 0) || Math.abs(current.props.h - h) < 0.5) return;
      editor.run(() => editor.updateShape<FreeCardShape>({ id: shape.id, type: FREE_CARD_TYPE, props: { h } }), { history: "ignore", ignoreShapeLock: true });
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(el);
    return () => sizes.disconnect();
  }, [editor, shape.id, s, inExport]);

  return (
    <HTMLContainer id={shape.id} style={{ pointerEvents: "none", overflow: "visible" }}>
      <ExportStyles shapeId={shape.id} />
      <div ref={content} className="gc-free" data-testid="free-card" data-card-id={typeof card.id === "string" ? card.id : undefined} style={{ width: w / s, transform: `scale(${s})` }}>
        <WhiteboardCard card={card} />
      </div>
    </HTMLContainer>
  );
}
