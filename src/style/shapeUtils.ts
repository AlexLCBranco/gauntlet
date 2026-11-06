import {
  ArrowShapeUtil,
  DrawShapeUtil,
  GeoShapeUtil,
  LineShapeUtil,
  NoteShapeUtil,
  TextShapeUtil,
  getColorValue,
  type TLDefaultFillStyle,
  type TLGeoShape,
  type TLTextShape,
} from "tldraw";

import { shownHex, withAlpha } from "./colors";
import { caseOf, shownInCase } from "./textCase";
import { fillColorOf, metaFontPx, metaNumber } from "./styleMeta";

type Mode = "dark" | "light";

/** Which shade of a colour tldraw fills with, per fill style (tldraw's own
    table, which it doesn't export). */
const FILL_SHADE: Record<Exclude<TLDefaultFillStyle, "none" | "semi">, "semi" | "pattern" | "fill" | "linedFill"> = {
  solid: "semi",
  pattern: "pattern",
  fill: "fill",
  "lined-fill": "linedFill",
};

/** Meta keys that change how big a text or label is drawn. */
const MEASURED = ["fontStep", "fontPx", "lineHeight", "labelPad", "textCase"] as const;

/** tldraw re-measures a text or a shape's label (and grows the box to fit)
    only when its own size, font or text changes. A font size (or line
    height, label padding) picked in meta goes the same way: tldraw is shown
    a size change. */
function remeasureOnFontStep<S extends TLGeoShape | TLTextShape>(prev: S, next: S, run: (prev: S, next: S) => S | undefined): S | undefined {
  // Measured in the case it is shown in (textCase.ts); the stored text is
  // put back as typed.
  const typed = next.props.richText;
  const keep = (out: S | undefined) => (out ? ({ ...out, props: { ...out.props, richText: typed } } as S) : out);
  const p = shownInCase(prev);
  const n = shownInCase(next);
  if (MEASURED.every((k) => prev.meta[k] === next.meta[k])) return keep(run(p, n));
  const sizeChanged = { ...p, props: { ...p.props, size: p.props.size === "s" ? "m" : "s" } };
  return keep(run(sizeChanged, n)) ?? { ...next, props: { ...next.props } };
}

/** Draws, exports and measures a shape's text in its picked case (meta
    textCase, the case switcher), not while it is typed in. */
// oxlint-disable-next-line typescript/no-explicit-any
function withCase<T extends abstract new (...args: any[]) => { editor: { getEditingShapeId(): string | null }; component(s: any): any; toSvg?(s: any, c: any): any; getGeometry(s: any, o?: any): any }>(Base: T) {
  abstract class Cased extends Base {
    // oxlint-disable-next-line typescript/no-explicit-any
    override component(shape: any) {
      return super.component(shownInCase(shape, this.editor.getEditingShapeId() === shape.id));
    }
    // oxlint-disable-next-line typescript/no-explicit-any
    override toSvg(shape: any, ctx: any) {
      return super.toSvg?.(shownInCase(shape), ctx);
    }
    // oxlint-disable-next-line typescript/no-explicit-any
    override getGeometry(shape: any, opts?: any) {
      return super.getGeometry(shownInCase(shape), opts);
    }
  }
  return Cased;
}

/** Exact (fixed or custom) colours and sizes kept in meta, as tldraw's
    display values (colors.ts, styleMeta.ts). */
function exact(meta: Record<string, unknown>, mode: Mode) {
  const out: { strokeColor?: string; strokeWidth?: number; labelColor?: string; labelFontSize?: number; labelLineHeight?: number } = {};
  const stroke = shownHex(meta, "strokeHex", mode);
  if (stroke) out.strokeColor = stroke;
  const text = shownHex(meta, "textHex", mode);
  if (text) out.labelColor = text;
  const width = metaNumber(meta, "strokePx");
  if (width !== null) out.strokeWidth = width;
  const px = metaFontPx(meta);
  if (px) out.labelFontSize = px;
  const lh = metaNumber(meta, "lineHeight");
  if (lh) out.labelLineHeight = lh;
  return out;
}

/** A fixed or custom background, per fill style: solid as is, tint
    see-through, hatch and lines drawn in it. */
function exactFill(meta: Record<string, unknown>, fill: TLDefaultFillStyle, mode: Mode) {
  const hex = shownHex(meta, "fillHex", mode);
  if (!hex || fill === "none") return {};
  return { fillColor: fill === "solid" ? withAlpha(hex, 0.35) : hex, patternFillFallbackColor: withAlpha(hex, 0.35) };
}

const GeoWithMeta = GeoShapeUtil.configure({
  // No halo in the page's colour round a shape's text (Excalidraw has
  // none): on a dark fill it showed as a light rim round the letters.
  showTextOutline: false,
  getCustomDisplayValues(_editor, shape, theme, mode) {
    const out: Record<string, unknown> = exact(shape.meta, mode);
    const { fill, color } = shape.props;
    if (shape.meta.fillColor && fill !== "none" && fill !== "semi") {
      const colors = theme.colors[mode];
      const name = fillColorOf(shape.meta, color);
      out.fillColor = getColorValue(colors, name, FILL_SHADE[fill]);
      out.patternFillFallbackColor = getColorValue(colors, name, "semi");
    }
    Object.assign(out, exactFill(shape.meta, fill === "semi" ? "fill" : fill, mode));
    const round = metaNumber(shape.meta, "roundPx");
    if (round !== null) out.strokeRoundness = round;
    const pad = metaNumber(shape.meta, "labelPad");
    if (pad !== null) {
      out.labelPadding = pad;
      out.labelExtraPadding = 0;
      out.labelEdgeMargin = 0;
      out.labelMinWidth = 0;
    }
    return out;
  },
});
class GeoUtil extends withCase(GeoWithMeta) {
  override onBeforeUpdate(prev: TLGeoShape, next: TLGeoShape) {
    return remeasureOnFontStep(prev, next, (p, n) => super.onBeforeUpdate(p, n));
  }
}

const TextWithMeta = TextShapeUtil.configure({
  getCustomDisplayValues(_editor, shape, _theme, mode) {
    const out: { fontSize?: number; color?: string; lineHeight?: number } = {};
    const px = metaFontPx(shape.meta);
    if (px) out.fontSize = px;
    // A text's one colour is its "stroke" in the panel (tldraw's way).
    const color = shownHex(shape.meta, "textHex", mode) ?? shownHex(shape.meta, "strokeHex", mode);
    if (color) out.color = color;
    const lh = metaNumber(shape.meta, "lineHeight");
    if (lh) out.lineHeight = lh;
    return out;
  },
});
class TextUtil extends withCase(TextWithMeta) {
  // tldraw sizes a text from its stored (typed) text; shown in caps it is
  // wider: an auto-sized text in a case is as wide as onBeforeUpdate
  // measured it in that case (props.w).
  override getMinDimensions(shape: TLTextShape) {
    const own = super.getMinDimensions(shape);
    if (!caseOf(shape.meta) || !shape.props.autoSize) return own;
    return { ...own, width: shape.props.w };
  }
  override onBeforeUpdate(prev: TLTextShape, next: TLTextShape) {
    return remeasureOnFontStep(prev, next, (p, n) => super.onBeforeUpdate(p, n));
  }
}

class ArrowUtil extends withCase(
  ArrowShapeUtil.configure({
    getCustomDisplayValues(_editor, shape, _theme, mode) {
      return { ...exact(shape.meta, mode), ...exactFill(shape.meta, shape.props.fill, mode) };
    },
  }),
) {}

/** tldraw's shapes, drawn with the styles kept in `meta` (styleMeta.ts,
    colors.ts): a picked font size, a rectangle/ellipse/diamond's own
    background colour, exact (fixed or custom) colours, and the exact sizes
    an Excalidraw import keeps. Shapes without them look exactly as tldraw
    draws them. */
export const shapeUtils = [
  GeoUtil,
  TextUtil,
  NoteShapeUtil.configure({
    getCustomDisplayValues(_editor, shape, _theme, mode) {
      const out: { labelFontSize?: number; labelColor?: string; noteBackgroundColor?: string } = {};
      const px = metaFontPx(shape.meta);
      if (px) out.labelFontSize = px;
      const text = shownHex(shape.meta, "textHex", mode);
      if (text) out.labelColor = text;
      // A note's "stroke" colour is its paper (tldraw's way).
      const paper = shownHex(shape.meta, "strokeHex", mode);
      if (paper) out.noteBackgroundColor = paper;
      return out;
    },
  }),
  ArrowUtil,
  DrawShapeUtil.configure({
    getCustomDisplayValues(_editor, shape, _theme, mode) {
      const { strokeColor, strokeWidth } = exact(shape.meta, mode);
      return { ...(strokeColor ? { strokeColor } : {}), ...(strokeWidth !== undefined ? { strokeWidth } : {}), ...exactFill(shape.meta, shape.props.fill, mode) };
    },
  }),
  LineShapeUtil.configure({
    getCustomDisplayValues(_editor, shape, _theme, mode) {
      const { strokeColor, strokeWidth } = exact(shape.meta, mode);
      return { ...(strokeColor ? { strokeColor } : {}), ...(strokeWidth !== undefined ? { strokeWidth } : {}) };
    },
  }),
];

/** The types whose text size the panel's font sizes change. */
export const TEXT_TYPES = new Set(["text", "geo", "note", "arrow"]);
