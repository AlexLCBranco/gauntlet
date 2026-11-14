import { lazy, Suspense } from "react";
import { ExportStyles } from "../whiteboard/exportStyles";
import { BaseBoxShapeUtil, HTMLContainer, T, resizeBox, type RecordProps, type TLResizeInfo, type TLShape } from "tldraw";

export const SLATE_TYPE = "calendarkit-slate";

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [SLATE_TYPE]: {
      /** The night shown (the NBA's date, YYYY-MM-DD): set when inserted,
          never changed by the clock (owner, 2026-10-31). */
      date: string;
      /** The box on the page: natural size x `scale` (boards/fit.ts). */
      w: number;
      h: number;
      /** How much the cards are scaled; 0 until first sized. */
      scale: number;
      /** Columns of cards, chosen once by calendarkit's copies' rule
          (largest cards on the page); 0 until first sized. Kept, so notes
          growing a card never reflow the night under the drawings. */
      cols: number;
    };
  }
}

export type SlateShape = TLShape<typeof SLATE_TYPE>;

/** calendarkit's code, loaded with the first Slate widget a page shows. */
const SlateWidget = lazy(() => import("./SlateWidget"));

/**
 * One night of NBA games as calendarkit's Slate cards (game info + note
 * box), a widget on the whiteboard (owner, 2026-10-31, "Slate widget"
 * steps 1-5; this is step 2: static). It sits on the page as a board does:
 * select, move, drag a corner to scale it, cards and all; the cards are
 * real text, drawn on nothing (the gaps are the page's, for drawing). The
 * shape stores its date and size, never the games: those come from the
 * live schedule (SlateWidget.tsx).
 */
export class SlateShapeUtil extends BaseBoxShapeUtil<SlateShape> {
  static override type = SLATE_TYPE;
  static override props: RecordProps<SlateShape> = {
    date: T.string,
    w: T.number,
    h: T.number,
    scale: T.number,
    cols: T.number,
  };

  override getDefaultProps(): SlateShape["props"] {
    return { date: "", w: 480, h: 140, scale: 0, cols: 0 };
  }
  override canEdit() {
    return false;
  }
  override isAspectRatioLocked() {
    return true;
  }
  override onResize(shape: SlateShape, info: TLResizeInfo<SlateShape>) {
    const next = resizeBox(shape, info);
    const from = info.initialShape.props;
    return { ...next, props: { ...next.props, scale: (from.scale || 1) * (next.props.w / from.w) } };
  }
  override component(shape: SlateShape) {
    return (
      <HTMLContainer id={shape.id} style={{ pointerEvents: "none", overflow: "visible" }}>
        <ExportStyles shapeId={shape.id} />
        <Suspense fallback={null}>
          <SlateWidget shape={shape} />
        </Suspense>
      </HTMLContainer>
    );
  }
  override getIndicatorPath(shape: SlateShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
