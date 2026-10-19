import {
  ArrowShapeUtil,
  GeoShapeUtil,
  NoteShapeUtil,
  TextShapeUtil,
  getColorValue,
  type TLDefaultFillStyle,
  type TLGeoShape,
  type TLTextShape,
} from "tldraw";

import { fillColorOf, metaFontPx } from "./styleMeta";

/** Which shade of a colour tldraw fills with, per fill style (tldraw's own
    table, which it doesn't export). */
const FILL_SHADE: Record<Exclude<TLDefaultFillStyle, "none" | "semi">, "semi" | "pattern" | "fill" | "linedFill"> = {
  solid: "semi",
  pattern: "pattern",
  fill: "fill",
  "lined-fill": "linedFill",
};

/** tldraw re-measures a text or a shape's label (and grows the box to fit)
    only when its own size, font or text changes. A font size picked in meta
    goes the same way: tldraw is shown a size change. */
function remeasureOnFontStep<S extends TLGeoShape | TLTextShape>(prev: S, next: S, run: (prev: S, next: S) => S | undefined): S | undefined {
  if (prev.meta.fontStep === next.meta.fontStep) return run(prev, next);
  const sizeChanged = { ...prev, props: { ...prev.props, size: prev.props.size === "s" ? "m" : "s" } };
  return run(sizeChanged, next) ?? { ...next, props: { ...next.props } };
}

const GeoWithMeta = GeoShapeUtil.configure({
  getCustomDisplayValues(_editor, shape, theme, mode) {
    const out: { fillColor?: string; patternFillFallbackColor?: string; labelFontSize?: number } = {};
    const px = metaFontPx(shape.meta);
    if (px) out.labelFontSize = px;
    const { fill, color } = shape.props;
    if (shape.meta.fillColor && fill !== "none" && fill !== "semi") {
      const colors = theme.colors[mode];
      const name = fillColorOf(shape.meta, color);
      out.fillColor = getColorValue(colors, name, FILL_SHADE[fill]);
      out.patternFillFallbackColor = getColorValue(colors, name, "semi");
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
    const px = metaFontPx(shape.meta);
    return px ? { fontSize: px } : {};
  },
});
class TextUtil extends TextWithMeta {
  override onBeforeUpdate(prev: TLTextShape, next: TLTextShape) {
    return remeasureOnFontStep(prev, next, (p, n) => super.onBeforeUpdate(p, n));
  }
}

/** tldraw's shapes, drawn with the styles kept in `meta` (styleMeta.ts):
    a picked font size, and a rectangle/ellipse/diamond's own background
    colour. Shapes without them look exactly as tldraw draws them. */
export const shapeUtils = [
  GeoUtil,
  TextUtil,
  NoteShapeUtil.configure({
    getCustomDisplayValues(_editor, shape) {
      const px = metaFontPx(shape.meta);
      return px ? { labelFontSize: px } : {};
    },
  }),
  ArrowShapeUtil.configure({
    getCustomDisplayValues(_editor, shape) {
      const px = metaFontPx(shape.meta);
      return px ? { labelFontSize: px } : {};
    },
  }),
];

/** The types whose text size the panel's font sizes change. */
export const TEXT_TYPES = new Set(["text", "geo", "note", "arrow"]);
