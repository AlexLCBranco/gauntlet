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

import { metaHex, withAlpha } from "./colors";
import { fillColorOf, metaFontPx, metaNumber } from "./styleMeta";

/** Which shade of a colour tldraw fills with, per fill style (tldraw's own
    table, which it doesn't export). */
const FILL_SHADE: Record<Exclude<TLDefaultFillStyle, "none" | "semi">, "semi" | "pattern" | "fill" | "linedFill"> = {
  solid: "semi",
  pattern: "pattern",
  fill: "fill",
  "lined-fill": "linedFill",
};

/** Meta keys that change how big a text or label is drawn. */
const MEASURED = ["fontStep", "fontPx", "lineHeight", "labelPad"] as const;

/** tldraw re-measures a text or a shape's label (and grows the box to fit)
    only when its own size, font or text changes. A font size (or line
    height, label padding) picked in meta goes the same way: tldraw is shown
    a size change. */
function remeasureOnFontStep<S extends TLGeoShape | TLTextShape>(prev: S, next: S, run: (prev: S, next: S) => S | undefined): S | undefined {
  if (MEASURED.every((k) => prev.meta[k] === next.meta[k])) return run(prev, next);
  const sizeChanged = { ...prev, props: { ...prev.props, size: prev.props.size === "s" ? "m" : "s" } };
  return run(sizeChanged, next) ?? { ...next, props: { ...next.props } };
}

/** Exact (fixed or custom) colours and sizes kept in meta, as tldraw's
    display values (colors.ts, styleMeta.ts). */
function exact(meta: Record<string, unknown>) {
  const out: { strokeColor?: string; strokeWidth?: number; labelColor?: string; labelFontSize?: number; labelLineHeight?: number } = {};
  const stroke = metaHex(meta, "strokeHex");
  if (stroke) out.strokeColor = stroke;
  const text = metaHex(meta, "textHex");
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
function exactFill(meta: Record<string, unknown>, fill: TLDefaultFillStyle) {
  const hex = metaHex(meta, "fillHex");
  if (!hex || fill === "none") return {};
  return { fillColor: fill === "solid" ? withAlpha(hex, 0.35) : hex, patternFillFallbackColor: withAlpha(hex, 0.35) };
}

const GeoWithMeta = GeoShapeUtil.configure({
  // No halo in the page's colour round a shape's text (Excalidraw has
  // none): on a dark fill it showed as a light rim round the letters.
  showTextOutline: false,
  getCustomDisplayValues(_editor, shape, theme, mode) {
    const out: Record<string, unknown> = exact(shape.meta);
    const { fill, color } = shape.props;
    if (shape.meta.fillColor && fill !== "none" && fill !== "semi") {
      const colors = theme.colors[mode];
      const name = fillColorOf(shape.meta, color);
      out.fillColor = getColorValue(colors, name, FILL_SHADE[fill]);
      out.patternFillFallbackColor = getColorValue(colors, name, "semi");
    }
    Object.assign(out, exactFill(shape.meta, fill === "semi" ? "fill" : fill));
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
class GeoUtil extends GeoWithMeta {
  override onBeforeUpdate(prev: TLGeoShape, next: TLGeoShape) {
    return remeasureOnFontStep(prev, next, (p, n) => super.onBeforeUpdate(p, n));
  }
}

const TextWithMeta = TextShapeUtil.configure({
  getCustomDisplayValues(_editor, shape) {
    const out: { fontSize?: number; color?: string; lineHeight?: number } = {};
    const px = metaFontPx(shape.meta);
    if (px) out.fontSize = px;
    // A text's one colour is its "stroke" in the panel (tldraw's way).
    const color = metaHex(shape.meta, "textHex") ?? metaHex(shape.meta, "strokeHex");
    if (color) out.color = color;
    const lh = metaNumber(shape.meta, "lineHeight");
    if (lh) out.lineHeight = lh;
    return out;
  },
});
class TextUtil extends TextWithMeta {
  override onBeforeUpdate(prev: TLTextShape, next: TLTextShape) {
    return remeasureOnFontStep(prev, next, (p, n) => super.onBeforeUpdate(p, n));
  }
}

/** tldraw's shapes, drawn with the styles kept in `meta` (styleMeta.ts,
    colors.ts): a picked font size, a rectangle/ellipse/diamond's own
    background colour, exact (fixed or custom) colours, and the exact sizes
    an Excalidraw import keeps. Shapes without them look exactly as tldraw
    draws them. */
export const shapeUtils = [
  GeoUtil,
  TextUtil,
  NoteShapeUtil.configure({
    getCustomDisplayValues(_editor, shape) {
      const out: { labelFontSize?: number; labelColor?: string; noteBackgroundColor?: string } = {};
      const px = metaFontPx(shape.meta);
      if (px) out.labelFontSize = px;
      const text = metaHex(shape.meta, "textHex");
      if (text) out.labelColor = text;
      // A note's "stroke" colour is its paper (tldraw's way).
      const paper = metaHex(shape.meta, "strokeHex");
      if (paper) out.noteBackgroundColor = paper;
      return out;
    },
  }),
  ArrowShapeUtil.configure({
    getCustomDisplayValues(_editor, shape) {
      return { ...exact(shape.meta), ...exactFill(shape.meta, shape.props.fill) };
    },
  }),
  DrawShapeUtil.configure({
    getCustomDisplayValues(_editor, shape) {
      const { strokeColor, strokeWidth } = exact(shape.meta);
      return { ...(strokeColor ? { strokeColor } : {}), ...(strokeWidth !== undefined ? { strokeWidth } : {}), ...exactFill(shape.meta, shape.props.fill) };
    },
  }),
  LineShapeUtil.configure({
    getCustomDisplayValues(_editor, shape) {
      const { strokeColor, strokeWidth } = exact(shape.meta);
      return { ...(strokeColor ? { strokeColor } : {}), ...(strokeWidth !== undefined ? { strokeWidth } : {}) };
    },
  }),
];

/** The types whose text size the panel's font sizes change. */
export const TEXT_TYPES = new Set(["text", "geo", "note", "arrow"]);
