// Excalidraw elements -> whiteboard shapes, keeping their look: position,
// size, rotation, stroke width and style, roundness, opacity, exact colours
// (src/style/colors.ts), fonts and font sizes, text alignment and wrapping,
// pictures with their crop, arrows with their points, heads and bindings,
// frames and groups. Anything that can't be converted becomes a visible
// placeholder and is listed in `notConverted`. Pure: no editor (text is
// measured through `measure`, ids come from `newId`); tested in
// convert.test.ts. The editor side is importExcalidraw.ts.

import { getIndices } from "@tldraw/utils";
import { b64Vecs } from "@tldraw/tlschema";

import { normalizeHex } from "../../style/colors";

// ---------------------------------------------------------------------------
// Excalidraw's side (only what is read here)

export interface ExcElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  frameId?: string | null;
  roundness?: { type: number; value?: number } | null;
  isDeleted?: boolean;
  boundElements?: { id: string; type: string }[] | null;
  link?: string | null;
  locked?: boolean;
  // text
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  lineHeight?: number;
  // linear
  points?: number[][];
  pressures?: number[];
  simulatePressure?: boolean;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  elbowed?: boolean;
  polygon?: boolean;
  // image
  fileId?: string | null;
  scale?: [number, number];
  crop?: { x: number; y: number; width: number; height: number; naturalWidth: number; naturalHeight: number } | null;
  // frame
  name?: string | null;
}

export interface ExcFile {
  id?: string;
  mimeType: string;
  dataURL: string;
}

export interface ExcData {
  elements: ExcElement[];
  files?: Record<string, ExcFile> | null;
}

/** Reads a pasted or opened Excalidraw document: a .excalidraw file
    ("excalidraw") or Excalidraw's clipboard ("excalidraw/clipboard").
    null if it isn't one. */
export function parseExcalidraw(value: unknown): ExcData | null {
  let v = value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as { type?: unknown; elements?: unknown; files?: unknown };
  if (o.type !== "excalidraw" && o.type !== "excalidraw/clipboard") return null;
  if (!Array.isArray(o.elements)) return null;
  return { elements: o.elements as ExcElement[], files: (o.files as Record<string, ExcFile>) ?? null };
}

// ---------------------------------------------------------------------------
// The whiteboard's side

export type FontKind = "draw" | "sans" | "mono";

export interface Measure {
  (text: string, style: { font: FontKind; fontPx: number; lineHeight: number }): { w: number; h: number };
}

export interface PlannedShape {
  id: string;
  type: "geo" | "text" | "arrow" | "line" | "draw" | "image" | "frame";
  /** A frame's id when the shape sits in it (x, y are then the frame's). */
  parentId?: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  isLocked?: boolean;
  props: Record<string, unknown>;
  meta: Record<string, unknown>;
}

export interface PlannedBinding {
  fromId: string;
  toId: string;
  terminal: "start" | "end";
  normalizedAnchor: { x: number; y: number };
}

export interface PlannedAsset {
  assetId: string;
  fileId: string;
  mimeType: string;
  dataURL: string;
}

export interface Plan {
  shapes: PlannedShape[];
  bindings: PlannedBinding[];
  /** Shape ids to group, innermost groups first; `id` is the group's own. */
  groups: { id: string; children: string[] }[];
  assets: PlannedAsset[];
  /** What couldn't be converted exactly, one line each. */
  notConverted: string[];
  /** Everything's bounds in Excalidraw's coordinates (rotation included). */
  bounds: { x: number; y: number; w: number; h: number };
  /** How many elements were read (deleted ones and bound texts excluded). */
  count: number;
}

export interface ConvertOptions {
  /** A new unique id for a shape made from `excId` (or a group, an asset). */
  newId: (kind: "shape" | "asset" | "group", excId: string) => string;
  measure?: Measure;
}

/** Excalidraw's padding round text bound to a container (BOUND_TEXT_PADDING). */
export const BOUND_TEXT_PADDING = 5;
const PLACEHOLDER_IMAGE_TEXT = "Picture not included in the paste — import the .excalidraw file instead";

/** Excalidraw's font families (FONT_FAMILY): hand-drawn ones -> tldraw's
    draw font, code ones -> mono, every other -> a clean sans. */
export function fontKind(family: number | undefined): FontKind {
  if (family === 1 || family === 5) return "draw"; // Virgil, Excalifont
  if (family === 3 || family === 8) return "mono"; // Cascadia, Comic Shanns
  return "sans"; // Helvetica, Nunito, Lilita One, Liberation Sans, Assistant, local fonts
}

/** The nearest tldraw size to a stroke width (Excalidraw: 1, 2, 4). */
function sizeForStroke(px: number): "s" | "m" | "l" | "xl" {
  if (px <= 1.5) return "s";
  if (px <= 3) return "m";
  if (px <= 6) return "l";
  return "xl";
}

/** The nearest tldraw size to a font size (tldraw: 18, 24, 36, 44 px). */
function sizeForFont(px: number): "s" | "m" | "l" | "xl" {
  if (px < 21) return "s";
  if (px < 30) return "m";
  if (px < 40) return "l";
  return "xl";
}

/** Excalidraw's rounded-rectangle corner radius (getCornerRadius). */
export function cornerRadius(el: ExcElement): number {
  const r = el.roundness;
  if (!r) return 0;
  const x = Math.min(Math.abs(el.width), Math.abs(el.height));
  if (r.type === 3) {
    const fixed = r.value ?? 32;
    return x <= fixed / 0.25 ? x * 0.25 : fixed;
  }
  return x * 0.25;
}

const ALIGN: Record<string, "start" | "middle" | "end"> = { left: "start", center: "middle", right: "end" };
const VALIGN: Record<string, "start" | "middle" | "end"> = { top: "start", middle: "middle", bottom: "end" };

const ARROWHEADS: Record<string, string> = {
  arrow: "arrow",
  triangle: "triangle",
  triangle_outline: "triangle",
  dot: "dot",
  circle: "dot",
  circle_outline: "dot",
  bar: "bar",
  diamond: "diamond",
  diamond_outline: "diamond",
  crowfoot_one: "bar",
  crowfoot_many: "inverted",
  crowfoot_one_or_many: "inverted",
};
const EXACT_HEADS = new Set(["arrow", "triangle", "dot", "bar", "diamond"]);

/** tldraw's rich text for plain lines. */
export function richText(text: string) {
  return {
    type: "doc",
    content: text.split("\n").map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })),
  };
}

type Pt = { x: number; y: number };
const rotate = (p: Pt, a: number): Pt => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

/** A linear element's points' box, relative to its x, y. */
function pointsBox(points: number[][]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Where tldraw's origin goes so a shape rotated about it (tldraw's way)
    covers what Excalidraw drew rotated about the element's centre. */
function rotatedOrigin(origin: Pt, center: Pt, angle: number): Pt {
  if (!angle) return origin;
  const r = rotate({ x: origin.x - center.x, y: origin.y - center.y }, angle);
  return { x: center.x + r.x, y: center.y + r.y };
}

/** The element's axis-aligned bounds, rotation included. */
function elementBounds(el: ExcElement) {
  let box = { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  if ((el.type === "arrow" || el.type === "line" || el.type === "freedraw") && el.points?.length) {
    const b = pointsBox(el.points);
    box = { minX: el.x + b.minX, minY: el.y + b.minY, maxX: el.x + b.maxX, maxY: el.y + b.maxY };
  }
  const a = el.angle ?? 0;
  if (!a) return box;
  const c = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const corners = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ].map((p) => {
    const r = rotate({ x: p.x - c.x, y: p.y - c.y }, a);
    return { x: c.x + r.x, y: c.y + r.y };
  });
  return {
    minX: Math.min(...corners.map((p) => p.x)),
    minY: Math.min(...corners.map((p) => p.y)),
    maxX: Math.max(...corners.map((p) => p.x)),
    maxY: Math.max(...corners.map((p) => p.y)),
  };
}

/** The bend tldraw draws an arc arrow with so it passes the middle point
    (tldraw's own Excalidraw converter does the same). */
export function bendThrough(start: Pt, mid: Pt, end: Pt): number {
  const d = { x: end.x - start.x, y: end.y - start.y };
  const len2 = d.x * d.x + d.y * d.y;
  if (len2 === 0) return 0;
  const med = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  // `mid` projected on the start-end line's perpendicular through its middle.
  const v = { x: d.y, y: -d.x };
  const t = ((mid.x - med.x) * v.x + (mid.y - med.y) * v.y) / len2;
  const point = { x: med.x + v.x * t, y: med.y + v.y * t };
  const bend = Math.hypot(point.x - med.x, point.y - med.y);
  // tldraw's Vec.Clockwise(point, end, med).
  const clockwise = (med.x - point.x) * (end.y - point.y) - (end.x - point.x) * (med.y - point.y) < 0;
  return clockwise ? -bend : bend;
}

function label(el: ExcElement) {
  const what = el.type === "text" ? `text "${(el.text ?? "").split("\n")[0].slice(0, 30)}"` : el.type;
  return `${what} (${el.id})`;
}

export function convertExcalidraw(data: ExcData, opts: ConvertOptions): Plan {
  const notConverted: string[] = [];
  const all = data.elements.filter((e) => e && !e.isDeleted);
  const byId = new Map(all.map((e) => [e.id, e]));
  const files = data.files ?? {};

  // Texts bound to a container become that container's label.
  const labelOf = new Map<string, ExcElement>();
  for (const t of all) {
    if (t.type !== "text" || !t.containerId) continue;
    const c = byId.get(t.containerId);
    if (c && ["rectangle", "ellipse", "diamond", "arrow"].includes(c.type)) labelOf.set(c.id, t);
  }
  const isLabel = (e: ExcElement) => e.type === "text" && !!e.containerId && labelOf.get(e.containerId) === e;
  const elements = all.filter((e) => !isLabel(e));

  const shapeId = new Map(elements.map((e) => [e.id, opts.newId("shape", e.id)]));
  const frames = new Map(elements.filter((e) => e.type === "frame" || e.type === "magicframe").map((e) => [e.id, e]));

  const colors = (el: ExcElement, key: "strokeColor" | "backgroundColor", what: string): string | "transparent" | null => {
    const v = el[key];
    if (v === undefined || v === "transparent") return v === "transparent" ? "transparent" : null;
    const hex = normalizeHex(v);
    if (!hex) notConverted.push(`${label(el)}: ${what} colour "${v}" not understood, left as tldraw's`);
    return hex;
  };

  const shapes: PlannedShape[] = [];
  const bindings: PlannedBinding[] = [];
  const assets: PlannedAsset[] = [];
  const assetFor = new Map<string, string>();

  for (const el of elements) {
    const id = shapeId.get(el.id)!;
    const angle = el.angle ?? 0;
    const frame = el.frameId ? frames.get(el.frameId) : undefined;
    // Inside a frame, positions are the frame's (frames aren't rotated).
    const off = frame ? { x: frame.x, y: frame.y } : { x: 0, y: 0 };
    const stroke = colors(el, "strokeColor", "stroke");
    const background = colors(el, "backgroundColor", "background");
    const strokePx = stroke === "transparent" ? 0 : (el.strokeWidth ?? 2);
    const dash = el.strokeStyle === "dashed" ? "dashed" : el.strokeStyle === "dotted" ? "dotted" : (el.roughness ?? 1) > 0 ? "draw" : "solid";
    const fill = !background || background === "transparent" ? "none" : el.fillStyle === "solid" || !el.fillStyle ? "fill" : "pattern";
    const meta: Record<string, unknown> = { excalidrawId: el.id, strokePx };
    if (stroke && stroke !== "transparent") meta.strokeHex = stroke;
    if (background && background !== "transparent") meta.fillHex = background;
    const base = (x: number, y: number, w: number, h: number) => {
      const o = rotatedOrigin({ x, y }, { x: x + w / 2, y: y + h / 2 }, angle);
      return {
        id,
        ...(frame ? { parentId: shapeId.get(frame.id)! } : {}),
        x: o.x - off.x,
        y: o.y - off.y,
        rotation: angle,
        opacity: Math.max(0, Math.min(1, (el.opacity ?? 100) / 100)),
        ...(el.locked ? { isLocked: true } : {}),
      };
    };

    switch (el.type) {
      case "rectangle":
      case "ellipse":
      case "diamond": {
        const props: Record<string, unknown> = {
          geo: el.type,
          w: Math.max(1, el.width),
          h: Math.max(1, el.height),
          dash,
          size: sizeForStroke(strokePx),
          fill,
          url: el.link ?? "",
        };
        const m = { ...meta, roundPx: el.type === "rectangle" ? cornerRadius(el) : 0 };
        const t = labelOf.get(el.id);
        if (t) {
          const font = fontKind(t.fontFamily);
          const fontPx = t.fontSize ?? 20;
          const lineHeight = t.lineHeight ?? 1.25;
          const text = t.text ?? t.originalText ?? "";
          Object.assign(props, { richText: richText(text), font, align: ALIGN[t.textAlign ?? "center"] ?? "middle", verticalAlign: VALIGN[t.verticalAlign ?? "middle"] ?? "middle" });
          const textColor = colors(t, "strokeColor", "text");
          if (textColor && textColor !== "transparent") Object.assign(m, { textHex: textColor });
          let pad = BOUND_TEXT_PADDING;
          // Our font may run wider than Excalidraw's: give its widest line
          // the room it needs (down to no padding) so lines break as in
          // Excalidraw.
          if (opts.measure && text) {
            const widest = opts.measure(text, { font, fontPx, lineHeight }).w;
            if (widest > el.width - 2 * pad) pad = Math.max(0, Math.floor((el.width - widest) / 2 - 1));
          }
          Object.assign(m, { fontPx, lineHeight, labelPad: pad });
          props.size = sizeForFont(fontPx);
        }
        shapes.push({ ...base(el.x, el.y, el.width, el.height), type: "geo", props, meta: m });
        break;
      }

      case "text": {
        const font = fontKind(el.fontFamily);
        const fontPx = el.fontSize ?? 20;
        const lineHeight = el.lineHeight ?? 1.25;
        const text = el.text ?? el.originalText ?? "";
        const align = ALIGN[el.textAlign ?? "left"] ?? "start";
        let x = el.x;
        let w = Math.max(1, el.width);
        // Wide enough for its longest line in our font, so it breaks only
        // where Excalidraw broke it; the aligned edge stays put.
        if (opts.measure && text) {
          const need = Math.ceil(opts.measure(text, { font, fontPx, lineHeight }).w) + 1;
          if (need > w) {
            x -= align === "middle" ? (need - w) / 2 : align === "end" ? need - w : 0;
            w = need;
          }
        }
        const m: Record<string, unknown> = { excalidrawId: el.id, fontPx, lineHeight };
        if (stroke && stroke !== "transparent") m.strokeHex = stroke;
        if (stroke === "transparent") notConverted.push(`${label(el)}: transparent text shown in the default colour`);
        const b = base(el.x, el.y, el.width, el.height);
        // `base` placed the box Excalidraw drew; widening moves it along its own axis.
        const dx = x - el.x;
        shapes.push({
          ...b,
          x: b.x + dx * Math.cos(angle),
          y: b.y + dx * Math.sin(angle),
          type: "text",
          props: { richText: richText(text), font, size: sizeForFont(fontPx), textAlign: align, autoSize: false, w, scale: 1 },
          meta: m,
        });
        break;
      }

      case "arrow":
      case "line": {
        const pts = (el.points ?? []).map(([x, y]) => ({ x, y }));
        if (pts.length < 2) {
          notConverted.push(`${label(el)}: fewer than 2 points, left out`);
          break;
        }
        const pb = pointsBox(el.points!);
        const center = { x: el.x + (pb.minX + pb.maxX) / 2, y: el.y + (pb.minY + pb.maxY) / 2 };
        const o = rotatedOrigin({ x: el.x, y: el.y }, center, angle);
        const common = {
          id,
          ...(frame ? { parentId: shapeId.get(frame.id)! } : {}),
          x: o.x - off.x,
          y: o.y - off.y,
          rotation: angle,
          opacity: Math.max(0, Math.min(1, (el.opacity ?? 100) / 100)),
          ...(el.locked ? { isLocked: true } : {}),
        };
        if (el.type === "line") {
          const keys = getIndices(pts.length);
          const points = Object.fromEntries(pts.map((p, i) => [keys[i], { id: keys[i], index: keys[i], x: p.x, y: p.y }]));
          // Excalidraw fills a line only when it is closed.
          const closed = el.polygon || (pts.length > 2 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y);
          if (closed && background && background !== "transparent") notConverted.push(`${label(el)}: the fill inside the closed line is not kept`);
          shapes.push({ ...common, type: "line", props: { points, spline: el.roundness ? "cubic" : "line", dash, size: sizeForStroke(strokePx) }, meta });
          break;
        }
        const start = pts[0];
        const end = pts[pts.length - 1];
        const elbow = !!el.elbowed;
        let bend = 0;
        if (!elbow && pts.length >= 3) {
          bend = bendThrough(start, pts[Math.floor(pts.length / 2)], end);
          if (pts.length > 3) notConverted.push(`${label(el)}: ${pts.length} points, drawn as one curve through its middle point`);
          else if (!el.roundness) notConverted.push(`${label(el)}: a sharp corner, drawn as a curve through it`);
        }
        const heads = [el.startArrowhead, el.endArrowhead].map((h) => (h ? (ARROWHEADS[h] ?? "arrow") : "none"));
        for (const h of [el.startArrowhead, el.endArrowhead]) {
          if (h && !EXACT_HEADS.has(h)) notConverted.push(`${label(el)}: arrowhead "${h}" shown as ${ARROWHEADS[h] ?? "arrow"}`);
        }
        const props: Record<string, unknown> = {
          kind: elbow ? "elbow" : "arc",
          start,
          end,
          bend,
          dash,
          size: sizeForStroke(strokePx),
          arrowheadStart: heads[0],
          arrowheadEnd: heads[1],
        };
        const m = { ...meta };
        delete m.fillHex;
        const t = labelOf.get(el.id);
        if (t) {
          props.richText = richText(t.text ?? t.originalText ?? "");
          props.font = fontKind(t.fontFamily);
          Object.assign(m, { fontPx: t.fontSize ?? 20, lineHeight: t.lineHeight ?? 1.25 });
          const tc = colors(t, "strokeColor", "text");
          if (tc && tc !== "transparent") m.textHex = tc;
        }
        shapes.push({ ...common, type: "arrow", props, meta: m });
        // Bindings: keep each bound end where it is on its shape.
        for (const [terminal, binding, p] of [
          ["start", el.startBinding, start],
          ["end", el.endBinding, end],
        ] as const) {
          const target = binding ? elements.find((e) => e.id === binding.elementId) : undefined;
          if (!target || !shapeId.has(target.id) || target.type === "arrow" || target.type === "line") continue;
          const abs = { x: common.x + off.x + rotate(p, angle).x, y: common.y + off.y + rotate(p, angle).y };
          const tc = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
          const local = rotate({ x: abs.x - tc.x, y: abs.y - tc.y }, -(target.angle ?? 0));
          const clamp = (v: number) => Math.max(0, Math.min(1, v));
          bindings.push({
            fromId: id,
            toId: shapeId.get(target.id)!,
            terminal,
            normalizedAnchor: {
              x: clamp(target.width ? (local.x + target.width / 2) / target.width : 0.5),
              y: clamp(target.height ? (local.y + target.height / 2) / target.height : 0.5),
            },
          });
        }
        break;
      }

      case "freedraw": {
        const raw = el.points ?? [];
        if (raw.length === 0) break;
        const pressure = (i: number) => (el.simulatePressure === false && el.pressures?.[i] !== undefined ? el.pressures[i] : 0.5);
        const path = b64Vecs.encodePoints(raw.map(([x, y], i) => ({ x, y, z: pressure(i) })));
        const pb = pointsBox(raw);
        const center = { x: el.x + (pb.minX + pb.maxX) / 2, y: el.y + (pb.minY + pb.maxY) / 2 };
        const o = rotatedOrigin({ x: el.x, y: el.y }, center, angle);
        shapes.push({
          id,
          ...(frame ? { parentId: shapeId.get(frame.id)! } : {}),
          x: o.x - off.x,
          y: o.y - off.y,
          rotation: angle,
          opacity: Math.max(0, Math.min(1, (el.opacity ?? 100) / 100)),
          type: "draw",
          props: { segments: [{ type: "free", path }], dash: "draw", size: sizeForStroke(strokePx), fill, isComplete: true, isPen: el.simulatePressure === false },
          meta,
        });
        break;
      }

      case "image": {
        const file = el.fileId ? files[el.fileId] : undefined;
        if (!file?.dataURL) {
          notConverted.push(`${label(el)}: picture not included in the paste, shown as a placeholder`);
          shapes.push({
            ...base(el.x, el.y, el.width, el.height),
            type: "geo",
            props: { geo: "rectangle", w: Math.max(1, el.width), h: Math.max(1, el.height), dash: "dashed", size: "s", fill: "none", richText: richText(PLACEHOLDER_IMAGE_TEXT), font: "sans", align: "middle", verticalAlign: "middle" },
            meta: { excalidrawId: el.id, placeholder: "image", fontPx: 14, lineHeight: 1.25, labelPad: 8 },
          });
          break;
        }
        let assetId = assetFor.get(el.fileId!);
        if (!assetId) {
          assetId = opts.newId("asset", el.fileId!);
          assetFor.set(el.fileId!, assetId);
          assets.push({ assetId, fileId: el.fileId!, mimeType: file.mimeType, dataURL: file.dataURL });
        }
        const c = el.crop;
        const crop =
          c && c.naturalWidth > 0 && c.naturalHeight > 0
            ? { topLeft: { x: c.x / c.naturalWidth, y: c.y / c.naturalHeight }, bottomRight: { x: (c.x + c.width) / c.naturalWidth, y: (c.y + c.height) / c.naturalHeight } }
            : null;
        shapes.push({
          ...base(el.x, el.y, el.width, el.height),
          type: "image",
          props: { w: Math.max(1, el.width), h: Math.max(1, el.height), assetId, crop, flipX: (el.scale?.[0] ?? 1) < 0, flipY: (el.scale?.[1] ?? 1) < 0 },
          meta: { excalidrawId: el.id },
        });
        break;
      }

      case "frame":
      case "magicframe": {
        shapes.push({
          ...base(el.x, el.y, el.width, el.height),
          type: "frame",
          props: { w: Math.max(1, el.width), h: Math.max(1, el.height), name: el.name ?? "Frame" },
          meta: { excalidrawId: el.id },
        });
        break;
      }

      default: {
        // Embedded pages, iframes and anything newer: a visible placeholder.
        const what = el.link ? `${el.type} ${el.link}` : el.type;
        notConverted.push(`${label(el)}: can't be shown on the whiteboard, placeholder${el.link ? ` with its link` : ""}`);
        shapes.push({
          ...base(el.x, el.y, el.width, el.height),
          type: "geo",
          props: { geo: "rectangle", w: Math.max(1, el.width), h: Math.max(1, el.height), dash: "dashed", size: "s", fill: "none", richText: richText(`Not converted: ${what}`), font: "sans", align: "middle", verticalAlign: "middle", url: el.link ?? "" },
          meta: { excalidrawId: el.id, placeholder: el.type, fontPx: 14, lineHeight: 1.25, labelPad: 8 },
        });
      }
    }
  }

  // Frames first, so what sits in them can be put inside.
  const made = new Set(shapes.map((s) => s.id));
  shapes.sort((a, b) => Number(b.type === "frame") - Number(a.type === "frame"));
  for (const s of shapes) {
    if (s.parentId && !made.has(s.parentId)) delete s.parentId;
  }

  // Groups, innermost first; a group's children are its own elements and
  // the groups just inside it. A group whose members sit in different
  // frames stays ungrouped.
  const depth = new Map<string, number>();
  const parentGroup = new Map<string, string>();
  const directMembers = new Map<string, string[]>();
  for (const el of elements) {
    const gs = el.groupIds ?? [];
    if (!made.has(shapeId.get(el.id)!) || gs.length === 0) continue;
    (directMembers.get(gs[0]) ?? directMembers.set(gs[0], []).get(gs[0])!).push(shapeId.get(el.id)!);
    gs.forEach((g, i) => {
      depth.set(g, Math.max(depth.get(g) ?? 0, i));
      if (i + 1 < gs.length) parentGroup.set(g, gs[i + 1]);
    });
  }
  const groups: { id: string; children: string[] }[] = [];
  const groupShape = new Map<string, string>();
  const parentOf = new Map(shapes.map((s) => [s.id, s.parentId ?? ""]));
  for (const g of [...depth.keys()].sort((a, b) => depth.get(a)! - depth.get(b)!)) {
    const inner = [...parentGroup.entries()].filter(([, p]) => p === g).map(([c]) => groupShape.get(c) ?? null);
    const children = [...(directMembers.get(g) ?? []), ...inner.filter((c): c is string => c !== null)];
    if (children.length < 2) {
      if (children.length === 1) groupShape.set(g, children[0]);
      continue;
    }
    const parents = new Set(children.map((c) => parentOf.get(c) ?? ""));
    if (parents.size > 1) {
      notConverted.push(`group ${g}: its members sit in different frames, left ungrouped`);
      continue;
    }
    const gid = opts.newId("group", g);
    groups.push({ id: gid, children });
    groupShape.set(g, gid);
    parentOf.set(gid, [...parents][0]);
  }

  // Bounds of everything, labels included (they sit inside their containers).
  const boxes = elements.filter((e) => made.has(shapeId.get(e.id)!)).map(elementBounds);
  const minX = Math.min(...boxes.map((b) => b.minX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  const bounds = boxes.length ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : { x: 0, y: 0, w: 0, h: 0 };

  return { shapes, bindings, groups, assets, notConverted, bounds, count: elements.length };
}
