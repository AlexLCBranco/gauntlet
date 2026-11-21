import { BaseBoxShapeUtil, HTMLContainer, T, createShapeId, type RecordProps, type TLShape, type TLShapeId } from "tldraw";

export const CARD_TYPE = "boardkit-card";

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [CARD_TYPE]: {
      /** The Boardkit board the card is on (its `boardkit:board:<id>` record). */
      boardId: string;
      /** The card, in that board's record. */
      cardId: string;
      /** The box on the page: where the board draws the card. */
      w: number;
      h: number;
    };
  }
}

export type CardShape = TLShape<typeof CARD_TYPE>;

export const isCard = (shape: TLShape | undefined | null): shape is CardShape => shape?.type === CARD_TYPE;

/** The id of the object for `cardId` on the board widget `boardShapeId`:
    always the same, so an undo, a reload or another tab never makes a
    second one for the same card. */
export const cardShapeId = (boardShapeId: TLShapeId, cardId: string): TLShapeId => createShapeId(`card-${boardShapeId.slice("shape:".length)}-${cardId}`);

/**
 * A card of a board, as a whiteboard object of its own (GT-6, owner
 * 2026-10-20): what a click picks, a box or lasso selects and a drag moves.
 * It is a child of its board widget and sits exactly where the board draws
 * that card (src/cards/sync.ts keeps it there); it draws nothing itself,
 * the board does. The card's data stays in Boardkit's record.
 *
 * It is never moved or sized by tldraw: a press on a card is taken by
 * src/cards/cardPointer.ts, which moves the card in Boardkit's data.
 */
export class CardShapeUtil extends BaseBoxShapeUtil<CardShape> {
  static override type = CARD_TYPE;
  static override props: RecordProps<CardShape> = { boardId: T.string, cardId: T.string, w: T.number, h: T.number };

  override getDefaultProps(): CardShape["props"] {
    return { boardId: "", cardId: "", w: 100, h: 40 };
  }
  override canEdit() {
    return false;
  }
  override canResize() {
    return false;
  }
  override canSnap() {
    return false;
  }
  // Arrows still attach to the board as a whole (arrows on a card: GT-18).
  override canBind() {
    return false;
  }
  override hideResizeHandles() {
    return true;
  }
  override hideRotateHandle() {
    return true;
  }
  override component() {
    return <HTMLContainer style={{ pointerEvents: "none" }} />;
  }
  override getIndicatorPath(shape: CardShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, Math.min(8, shape.props.h / 4));
    return path;
  }
}
