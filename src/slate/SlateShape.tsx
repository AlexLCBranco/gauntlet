import { lazy, Suspense } from "react";
import { ExportStyles } from "../whiteboard/exportStyles";
import { BaseBoxShapeUtil, HTMLContainer, T, createShapePropsMigrationIds, createShapePropsMigrationSequence, resizeBox, type RecordProps, type TLResizeInfo, type TLShape } from "tldraw";
import { WidgetBoundary } from "../widgets/WidgetBoundary";

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
      /** The notes hidden (GT-7): the info-only cards of calendarkit's copy
          with notes hidden; shown (false, a new Slate's): the copy's cards with
          their note boxes. Always 2 columns, so notes growing a card never
          reflow the night under the drawings. Hiding never touches a note. */
      hideNotes: boolean;
    };
  }
}

export type SlateShape = TLShape<typeof SLATE_TYPE>;

const versions = createShapePropsMigrationIds(SLATE_TYPE, { TwoColumns: 1 });
/** GT-7: `cols` (columns chosen once at insert) goes, always 2 columns;
    `hideNotes` comes, notes shown. Saved Slates (and backups) switch to
    the new layout as they load. */
export const slateMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: versions.TwoColumns,
      up(props: Record<string, unknown>) {
        delete props.cols;
        props.hideNotes = false;
      },
      down(props: Record<string, unknown>) {
        delete props.hideNotes;
        props.cols = 2;
      },
    },
  ],
});

/** calendarkit's code, loaded with the first Slate widget a page shows. */
const SlateWidget = lazy(() => import("./SlateWidget"));

/**
 * One night of NBA games as calendarkit's Slate cards (game info + note
 * box), a widget on the whiteboard (owner, 2026-10-31, "Slate widget"
 * steps 1-5; this is step 2: static). It sits on the page as a board does:
 * select, move, drag a corner to scale it, cards and all; the cards are
 * real text, drawn on nothing (a tight grid since calendarkit v1.74, CK-7:
 * cards share a 1 px divider; the margin round them is the page's). The
 * shape stores its date and size, never the games: those come from the
 * live schedule (SlateWidget.tsx).
 */
export class SlateShapeUtil extends BaseBoxShapeUtil<SlateShape> {
  static override type = SLATE_TYPE;
  static override migrations = slateMigrations;
  static override props: RecordProps<SlateShape> = {
    date: T.string,
    w: T.number,
    h: T.number,
    scale: T.number,
    hideNotes: T.boolean,
  };

  override getDefaultProps(): SlateShape["props"] {
    return { date: "", w: 480, h: 140, scale: 0, hideNotes: false };
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
      <WidgetBoundary kind="slate">
        <HTMLContainer id={shape.id} style={{ pointerEvents: "none", overflow: "visible" }}>
          <ExportStyles shapeId={shape.id} />
          <Suspense fallback={null}>
            <SlateWidget shape={shape} />
          </Suspense>
        </HTMLContainer>
      </WidgetBoundary>
    );
  }
  override getIndicatorPath(shape: SlateShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
