// Styles tldraw doesn't have, kept in a shape's `meta`. Pure, no tldraw;
// tested in styleMeta.test.ts.
//
// - fontStep: the font size, independent of the stroke width (tldraw ties
//   both to its one "size"), with two sizes smaller than tldraw's smallest.
// - fillColor: the background colour of a shape, apart from its outline
//   colour (tldraw fills with the outline's colour).
// - strokeHex, fillHex, textHex: exact colours (colors.ts).
// - fontPx, lineHeight, strokePx, roundPx, labelPad: exact sizes, set by an
//   Excalidraw import (src/import/excalidraw/) so its drawing keeps its
//   look; fontPx wins over fontStep until a font size is picked.

export type FontStep = "xxs" | "xs" | "s" | "m" | "l" | "xl";

/** Font sizes in px, smallest first. s–xl are tldraw's own text sizes. */
export const FONT_STEPS: readonly { id: FontStep; label: string; px: number }[] = [
  { id: "xxs", label: "XXS", px: 10 },
  { id: "xs", label: "XS", px: 14 },
  { id: "s", label: "S", px: 18 },
  { id: "m", label: "M", px: 24 },
  { id: "l", label: "L", px: 36 },
  { id: "xl", label: "XL", px: 44 },
];

export interface StyleMeta {
  fontStep?: FontStep;
  fillColor?: string;
  strokeHex?: string;
  fillHex?: string;
  textHex?: string;
  fontPx?: number;
}

const isStep = (v: unknown): v is FontStep => FONT_STEPS.some((s) => s.id === v);

/** A number of zero or more kept in meta, or null. */
export function metaNumber(meta: Record<string, unknown> | undefined, key: string): number | null {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** The font size (px) a shape's meta asks for, or null to keep tldraw's. */
export function metaFontPx(meta: Record<string, unknown> | undefined): number | null {
  const exact = metaNumber(meta, "fontPx");
  if (exact) return exact;
  const step = meta?.fontStep;
  return isStep(step) ? FONT_STEPS.find((s) => s.id === step)!.px : null;
}

/** The font step a shape shows in the panel: its own, else the nearest to
    tldraw's size (which is what it's drawn with until one is picked). */
export function fontStepOf(meta: Record<string, unknown> | undefined, size: string): FontStep {
  const step = meta?.fontStep;
  if (isStep(step)) return step;
  return isStep(size) ? size : "m";
}

/** The colour name a shape is filled with: its own fill colour, else its
    outline's (tldraw's way). */
export function fillColorOf(meta: Record<string, unknown> | undefined, color: string): string {
  const c = meta?.fillColor;
  return typeof c === "string" && c ? c : color;
}

/** The one value every item shares, or "mixed". Undefined for no items. */
export function shared<T>(values: readonly T[]): T | "mixed" | undefined {
  if (values.length === 0) return undefined;
  return values.every((v) => v === values[0]) ? values[0] : "mixed";
}
