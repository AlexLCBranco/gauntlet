import { useEffect, useRef, type ReactNode } from "react";
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  GeoShapeUtil,
  useEditor,
  useRelevantStyles,
  useValue,
  type Editor,
  type StyleProp,
  type TLShape,
  type TLShapePartial,
} from "tldraw";

import { ColorRow } from "./ColorRow";
import { metaHex, normalizeHex, type ColorKey } from "./colors";
import { TEXT_TYPES } from "./shapeUtils";
import { FONT_STEPS, fontStepOf, shared, type FontStep, type StyleMeta } from "./styleMeta";
import "./style-panel.css";

/** tldraw doesn't export the label colour style by name; it's the geo
    shape's (notes and arrows share the same style). */
const LabelColorStyle = GeoShapeUtil.props.labelColor as StyleProp<string>;

/** Tools that draw something: with one of these on, the panel shows the
    styles the next shape gets (as in Excalidraw). */
const DRAWING_TOOLS = new Set(["geo", "draw", "line", "arrow", "text", "note", "highlight", "frame"]);
/** Shapes that have an outline (their "size" is a stroke width). */
const STROKED = new Set(["geo", "draw", "line", "arrow", "frame"]);

type Tri<T> = T | "mixed" | undefined;

// ---------------------------------------------------------------------------
// Reading and writing

/** Styles for the next shapes that tldraw doesn't keep: in the instance's
    meta, so they're saved with the rest of the tab's state. */
export function nextMeta(editor: Editor): StyleMeta {
  return (editor.getInstanceState().meta.next ?? {}) as StyleMeta;
}

/** meta with patch applied; an undefined value removes its key. */
function merged(meta: object, patch: object): Record<string, never> {
  const out: Record<string, unknown> = { ...meta, ...patch };
  for (const [k, v] of Object.entries(out)) if (v === undefined) delete out[k];
  return out as Record<string, never>;
}

function setNextMeta(editor: Editor, patch: StyleMeta) {
  const meta = editor.getInstanceState().meta;
  editor.updateInstanceState({ meta: { ...meta, next: merged(nextMeta(editor), patch) } });
}

/** Sets a tldraw style on the selection and for the next shapes, as one
    undo step (tldraw's own panel does the same). */
function setStyle<T>(editor: Editor, style: StyleProp<T>, value: T) {
  editor.markHistoryStoppingPoint("set style");
  editor.run(() => {
    if (editor.getSelectedShapeIds().length > 0) editor.setStyleForSelectedShapes(style, value);
    editor.setStyleForNextShapes(style, value);
  });
}

/** Writes meta-kept styles (styleMeta.ts) on the selected shapes of the
    given types, and for the next shapes. */
function setMeta(editor: Editor, patch: StyleMeta, types: Set<string>, alsoProps?: (s: TLShape) => object) {
  editor.markHistoryStoppingPoint("set style");
  editor.run(() => {
    const updates: TLShapePartial[] = editor
      .getSelectedShapes()
      .filter((s) => types.has(s.type))
      .map((s) => ({ id: s.id, type: s.type, meta: merged(s.meta, patch), ...(alsoProps ? { props: alsoProps(s) } : {}) }) as TLShapePartial);
    if (updates.length > 0) editor.updateShapes(updates);
    setNextMeta(editor, patch);
  });
}

/** Types each colour row colours. */
const COLOR_TYPES: Record<ColorKey, Set<string>> = {
  strokeHex: new Set(["geo", "text", "note", "arrow", "draw", "line"]),
  fillHex: new Set(["geo"]),
  textHex: new Set(["geo", "note", "arrow"]),
};

/** Picks a colour in one of the three rows, as one undo step: an exact
    "#rrggbb" goes in meta (colors.ts); a tldraw colour goes in its style
    (`tldraw()`) and drops the exact one. */
function setColor(editor: Editor, key: ColorKey, picked: string, tldraw: () => void, alsoProps?: (s: TLShape) => object) {
  const hex = normalizeHex(picked);
  editor.markHistoryStoppingPoint("set colour");
  editor.run(() => {
    if (!hex) tldraw();
    const updates: TLShapePartial[] = editor
      .getSelectedShapes()
      .filter((s) => COLOR_TYPES[key].has(s.type))
      // tldraw merges a meta update into the old meta: null (not a missing
      // key) is what clears an exact colour.
      .map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, [key]: hex, ...ownedHex(s.meta, key) }, ...(hex && alsoProps ? { props: alsoProps(s) } : {}) }) as TLShapePartial);
    if (updates.length > 0) editor.updateShapes(updates);
    setNextMeta(editor, { [key]: hex ?? undefined });
  });
}

/** A colour picked here on a shape imported from Excalidraw is the owner's
    own: it no longer follows Excalidraw's dark mode (colors.ts shownHex). */
function ownedHex(meta: TLShape["meta"], key: ColorKey) {
  if (!meta.excalidrawId) return {};
  const own = Array.isArray(meta.ownHex) ? (meta.ownHex as string[]) : [];
  return own.includes(key) ? {} : { ownHex: [...own, key] };
}

/** A shape's colour in a row: its exact one, else tldraw's. */
function colorIn(s: TLShape, key: ColorKey): string | undefined {
  const props = s.props as { color?: string; labelColor?: string; fill?: string };
  if (key === "fillHex") return props.fill === "none" ? "transparent" : (metaHex(s.meta, key) ?? (s.meta.fillColor as string) ?? props.color);
  const exact = metaHex(s.meta, key) ?? (s.type === "text" && key === "strokeHex" ? metaHex(s.meta, "textHex") : null);
  return exact ?? (key === "textHex" ? props.labelColor : props.color);
}

/** New shapes drawn with a tool get the meta-kept next styles. Returns a
    stop function. */
export function applyNextMeta(editor: Editor): () => void {
  return editor.sideEffects.registerBeforeCreateHandler("shape", (shape) => {
    if (!DRAWING_TOOLS.has(editor.getCurrentToolId())) return shape;
    const next = nextMeta(editor);
    const meta: Record<string, unknown> = { ...shape.meta };
    if (next.fontStep && TEXT_TYPES.has(shape.type) && meta.fontStep === undefined) meta.fontStep = next.fontStep;
    if (next.fillColor && shape.type === "geo" && meta.fillColor === undefined) meta.fillColor = next.fillColor;
    for (const key of ["strokeHex", "fillHex", "textHex"] as const) {
      if (next[key] && COLOR_TYPES[key].has(shape.type) && meta[key] === undefined) meta[key] = next[key];
    }
    return { ...shape, meta } as typeof shape;
  });
}

// ---------------------------------------------------------------------------
// Pieces

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="gk-section">
      <legend>{title}</legend>
      <div className="gk-row">{children}</div>
    </fieldset>
  );
}

function ColorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="gk-section gk-section--colors">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function Choice<T extends string>({
  label,
  value,
  current,
  onPick,
  children,
  testId,
}: {
  label: string;
  value: T;
  current: Tri<T>;
  onPick: (v: T) => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="gk-choice"
      aria-label={label}
      title={label}
      aria-pressed={current === value}
      data-testid={testId}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onPick(value)}
    >
      {children}
    </button>
  );
}

const svg = (children: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const line = (w: number) => svg(<path d="M4 10h12" strokeWidth={w} />);
const DASH_ICONS: Record<string, ReactNode> = {
  draw: svg(<path d="M3 11c2-3 3.5 2 5.5-.5S12 7 13.5 9.5 16 11 17 9" />),
  solid: line(2),
  dashed: svg(<path d="M3 10h3M8.5 10h3M14 10h3" strokeWidth={2} />),
  dotted: svg(<path d="M4 10h.01M8 10h.01M12 10h.01M16 10h.01" strokeWidth={2.4} />),
};
const ALIGN_ICONS: Record<string, ReactNode> = {
  start: svg(<path d="M4 5h12M4 10h7M4 15h10" />),
  middle: svg(<path d="M4 5h12M6.5 10h7M5 15h10" />),
  end: svg(<path d="M4 5h12M9 10h7M6 15h10" />),
};
const FILL_ICONS: Record<string, ReactNode> = {
  pattern: svg(<><rect x="3.5" y="3.5" width="13" height="13" rx="2" /><path d="M5 13l8-8M8 15.5l7.5-7.5M3.5 9.5l6-6" /></>),
  "lined-fill": svg(<><rect x="3.5" y="3.5" width="13" height="13" rx="2" /><path d="M3.5 7.5h13M3.5 11h13M3.5 14h13" /></>),
  solid: svg(<rect x="3.5" y="3.5" width="13" height="13" rx="2" fill="currentColor" fillOpacity={0.35} />),
  fill: svg(<rect x="3.5" y="3.5" width="13" height="13" rx="2" fill="currentColor" />),
};
const FONT_LABELS: Record<string, string> = { draw: "Hand-drawn", sans: "Normal", serif: "Serif", mono: "Code" };
const FONT_FACES: Record<string, string> = {
  draw: "var(--tl-font-draw)",
  sans: "var(--tl-font-sans)",
  serif: "var(--tl-font-serif)",
  mono: "var(--tl-font-mono)",
};

// ---------------------------------------------------------------------------
// The panel

/** The style panel, as Excalidraw's: on the left under the menu, shown only
    while something is selected, and gone when nothing is (the owner's
    choice; Excalidraw also shows it while a drawing tool is on). New shapes
    take the styles last picked. Stroke, background, text colour, fill, stroke width and
    style, font size (smaller than tldraw's smallest too) and family, text
    alignment, opacity, layers and actions. */
export function StylePanel() {
  const editor = useEditor();
  const styles = useRelevantStyles();
  const ref = useRef<HTMLDivElement>(null);
  const view = useValue(
    "style panel",
    () => {
      if (editor.getIsReadonly() || editor.getInstanceState().isFocusMode) return null;
      if (editor.isInAny("select.translating", "select.resizing", "select.rotating")) return null;
      const shapes = editor.getSelectedShapes();
      if (shapes.length === 0) return null;
      const types = new Set(shapes.map((s) => s.type));
      const next = nextMeta(editor);
      const texty = shapes.filter((s) => TEXT_TYPES.has(s.type));
      const row = (key: ColorKey) => shared(shapes.filter((s) => COLOR_TYPES[key].has(s.type)).map((s) => colorIn(s, key)));
      return {
        types: [...types],
        count: shapes.length,
        strokeColor: row("strokeHex"),
        fillColor: row("fillHex"),
        textColor: row("textHex"),
        fontStep: shapes.length
          ? shared(texty.map((s) => fontStepOf(s.meta, (s.props as { size: string }).size)))
          : next.fontStep,
        opacity: editor.getSharedOpacity(),
        // One unlocked picture: the Actions row offers Crop.
        croppable: shapes.length === 1 && shapes[0].type === "image" && !shapes[0].isLocked,
      };
    },
    [editor],
  );

  // Pointer moves over the panel aren't the canvas's (tldraw's own panel
  // does the same).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = (e: PointerEvent) => editor.markEventAsHandled(e);
    el.addEventListener("pointermove", mark);
    return () => el.removeEventListener("pointermove", mark);
  }, [editor, view === null]);

  if (!view || !styles) return null;
  const types = new Set(view.types);
  const get = <T,>(style: StyleProp<T>): Tri<T> => {
    const s = styles.get(style);
    return s === undefined ? undefined : s.type === "mixed" ? "mixed" : s.value;
  };
  const stroke = get(DefaultColorStyle);
  const labelColor = get(LabelColorStyle);
  const fill = get(DefaultFillStyle);
  const dash = get(DefaultDashStyle);
  const size = get(DefaultSizeStyle);
  const font = get(DefaultFontStyle);
  const textAlign = get(DefaultTextAlignStyle);
  const hAlign = get(DefaultHorizontalAlignStyle);
  const hasStroke = [...types].some((t) => STROKED.has(t));
  const hasText = [...types].some((t) => TEXT_TYPES.has(t));
  const onlyText = [...types].every((t) => t === "text");
  const geoTypes = new Set(["geo"]);
  const selection = view.count > 0;

  const filled = (s: TLShape) => ((s.props as { fill: string }).fill === "none" || (s.props as { fill: string }).fill === "semi" ? { fill: "fill" } : {});
  const pickBackground = (c: string) => {
    if (c === "transparent") return setStyle(editor, DefaultFillStyle, "none");
    setColor(
      editor,
      "fillHex",
      c,
      () => {
        const updates = editor
          .getSelectedShapes()
          .filter((s) => geoTypes.has(s.type))
          .map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, fillColor: c }, props: filled(s) }) as TLShapePartial);
        if (updates.length > 0) editor.updateShapes(updates);
        setNextMeta(editor, { fillColor: c });
      },
      filled,
    );
    if (fill === "none" || fill === "semi" || fill === undefined) editor.setStyleForNextShapes(DefaultFillStyle, "fill");
  };
  const tldrawStyle = (style: StyleProp<string>, c: string) => () => {
    if (editor.getSelectedShapeIds().length > 0) editor.setStyleForSelectedShapes(style, c);
    editor.setStyleForNextShapes(style, c);
  };

  // A picked size replaces an imported exact one (fontPx, strokePx: null).
  const pickFont = (step: FontStep) => setMeta(editor, { fontStep: step, fontPx: null }, TEXT_TYPES);

  // Changing a stroke width must not change the text size (tldraw ties
  // both to "size"): shapes without a picked font size keep the one they
  // show.
  const pickStrokeWidth = (v: "s" | "m" | "l" | "xl") => {
    editor.markHistoryStoppingPoint("set style");
    editor.run(() => {
      const pin = editor
        .getSelectedShapes()
        .filter((s) => TEXT_TYPES.has(s.type) && s.type !== "text" && s.meta.fontStep === undefined)
        .map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, fontStep: fontStepOf(s.meta, (s.props as { size: string }).size) } }) as TLShapePartial);
      if (pin.length > 0) editor.updateShapes(pin);
      const exact = editor
        .getSelectedShapes()
        .filter((s) => s.meta.strokePx !== undefined && s.meta.strokePx !== null)
        .map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, strokePx: null } }) as TLShapePartial);
      if (exact.length > 0) editor.updateShapes(exact);
      if (editor.getSelectedShapeIds().length > 0) editor.setStyleForSelectedShapes(DefaultSizeStyle, v);
      editor.setStyleForNextShapes(DefaultSizeStyle, v);
    });
  };

  const act = (fn: () => void) => () => {
    editor.markHistoryStoppingPoint("panel action");
    fn();
    editor.focus();
  };

  return (
    <div ref={ref} className="gk-style-panel gauntlet-island" data-testid="style-panel" onPointerDown={(e) => e.stopPropagation()}>
      {stroke !== undefined && (
        <ColorSection title="Stroke">
          <ColorRow name="stroke" current={view.strokeColor} onPick={(c) => setColor(editor, "strokeHex", c, tldrawStyle(DefaultColorStyle as StyleProp<string>, c))} />
        </ColorSection>
      )}
      {types.has("geo") && (
        <ColorSection title="Background">
          <ColorRow name="background" current={view.fillColor} onPick={pickBackground} transparent />
        </ColorSection>
      )}
      {types.has("geo") && fill !== undefined && fill !== "none" && (
        <Section title="Fill">
          {(["pattern", "lined-fill", "solid", "fill"] as const).map((f) => (
            <Choice key={f} label={{ pattern: "Hatch", "lined-fill": "Lines", solid: "Tint", fill: "Solid" }[f]} value={f} current={fill === "semi" ? "solid" : fill} onPick={(v) => setStyle(editor, DefaultFillStyle, v)} testId={`fill-${f}`}>
              {FILL_ICONS[f]}
            </Choice>
          ))}
        </Section>
      )}
      {labelColor !== undefined && hasText && (
        <ColorSection title="Text colour">
          <ColorRow name="text" current={view.textColor} onPick={(c) => setColor(editor, "textHex", c, tldrawStyle(LabelColorStyle, c))} />
        </ColorSection>
      )}
      {hasStroke && size !== undefined && (
        <Section title="Stroke width">
          {(["s", "m", "l", "xl"] as const).map((v, i) => (
            <Choice key={v} label={["Thin", "Bold", "Extra bold", "Heavy"][i]} value={v} current={size} onPick={pickStrokeWidth} testId={`stroke-width-${v}`}>
              {line([1, 2, 3.2, 4.6][i])}
            </Choice>
          ))}
        </Section>
      )}
      {hasStroke && dash !== undefined && (
        <Section title="Stroke style">
          {(["draw", "solid", "dashed", "dotted"] as const).map((v) => (
            <Choice key={v} label={{ draw: "Sketchy", solid: "Solid", dashed: "Dashed", dotted: "Dotted" }[v]} value={v} current={dash} onPick={(d) => setStyle(editor, DefaultDashStyle, d)}>
              {DASH_ICONS[v]}
            </Choice>
          ))}
        </Section>
      )}
      {hasText && (
        <Section title="Font size">
          {FONT_STEPS.map((f) => (
            <Choice key={f.id} label={`Font size ${f.label} (${f.px} px)`} value={f.id} current={view.fontStep} onPick={pickFont} testId={`font-${f.id}`}>
              <span className="gk-text-choice">{f.label}</span>
            </Choice>
          ))}
        </Section>
      )}
      {hasText && font !== undefined && (
        <Section title="Font family">
          {(["draw", "sans", "serif", "mono"] as const).map((v) => (
            <Choice key={v} label={FONT_LABELS[v]} value={v} current={font} onPick={(f) => setStyle(editor, DefaultFontStyle, f)}>
              <span className="gk-text-choice" style={{ fontFamily: FONT_FACES[v] }}>Aa</span>
            </Choice>
          ))}
        </Section>
      )}
      {hasText && (textAlign !== undefined || hAlign !== undefined) && (
        <Section title="Text align">
          {(["start", "middle", "end"] as const).map((v) => (
            <Choice
              key={v}
              label={{ start: "Left", middle: "Center", end: "Right" }[v]}
              value={v}
              current={onlyText ? textAlign : (hAlign ?? textAlign)}
              onPick={(a) => {
                editor.markHistoryStoppingPoint("set style");
                editor.run(() => {
                  for (const style of [DefaultTextAlignStyle, DefaultHorizontalAlignStyle] as StyleProp<string>[]) {
                    if (styles.get(style) === undefined) continue;
                    if (editor.getSelectedShapeIds().length > 0) editor.setStyleForSelectedShapes(style, a);
                    editor.setStyleForNextShapes(style, a);
                  }
                });
              }}
            >
              {ALIGN_ICONS[v]}
            </Choice>
          ))}
        </Section>
      )}
      <fieldset className="gk-section">
        <legend>Opacity</legend>
        <input
          className="gk-slider"
          type="range"
          min={10}
          max={100}
          step={10}
          aria-label="Opacity"
          value={view.opacity.type === "shared" ? Math.round(view.opacity.value * 100) : 100}
          onPointerDown={() => editor.markHistoryStoppingPoint("opacity")}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            editor.run(() => {
              if (selection) editor.setOpacityForSelectedShapes(v);
              editor.setOpacityForNextShapes(v);
            });
          }}
        />
      </fieldset>
      {selection && (
        <Section title="Layers">
          <button type="button" className="gk-choice" title="Send to back" aria-label="Send to back" onClick={act(() => editor.sendToBack(editor.getSelectedShapeIds()))}>
            {svg(<path d="M10 4v9M6.5 9.5 10 13l3.5-3.5M4 16h12" />)}
          </button>
          <button type="button" className="gk-choice" title="Send backward" aria-label="Send backward" onClick={act(() => editor.sendBackward(editor.getSelectedShapeIds()))}>
            {svg(<path d="M10 4v12M6.5 12.5 10 16l3.5-3.5" />)}
          </button>
          <button type="button" className="gk-choice" title="Bring forward" aria-label="Bring forward" onClick={act(() => editor.bringForward(editor.getSelectedShapeIds()))}>
            {svg(<path d="M10 16V4M6.5 7.5 10 4l3.5 3.5" />)}
          </button>
          <button type="button" className="gk-choice" title="Bring to front" aria-label="Bring to front" onClick={act(() => editor.bringToFront(editor.getSelectedShapeIds()))}>
            {svg(<path d="M10 16V7M6.5 10.5 10 7l3.5 3.5M4 4h12" />)}
          </button>
        </Section>
      )}
      {view.count > 1 && (
        <Section title="Align">
          {(
            [
              ["left", "Align left", "M4 3v14M7 6h9M7 14h5"],
              ["center-horizontal", "Center horizontally", "M10 3v14M5 6h10M7 14h6"],
              ["right", "Align right", "M16 3v14M4 6h9M8 14h5"],
              ["top", "Align top", "M3 4h14M6 7v9M14 7v5"],
              ["center-vertical", "Center vertically", "M3 10h14M6 5v10M14 7v6"],
              ["bottom", "Align bottom", "M3 16h14M6 4v9M14 8v5"],
            ] as const
          ).map(([op, label, d]) => (
            <button key={op} type="button" className="gk-choice" title={label} aria-label={label} onClick={act(() => editor.alignShapes(editor.getSelectedShapeIds(), op))}>
              {svg(<path d={d} />)}
            </button>
          ))}
        </Section>
      )}
      {selection && (
        <Section title="Actions">
          <button type="button" className="gk-choice" title="Duplicate (Ctrl D)" aria-label="Duplicate" onClick={act(() => editor.duplicateShapes(editor.getSelectedShapeIds()))}>
            {svg(<><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></>)}
          </button>
          {view.croppable && (
            // tldraw's own crop mode, as its floating crop button starts it.
            <button
              type="button"
              className="gk-choice"
              title="Crop"
              aria-label="Crop"
              data-testid="action-crop"
              onClick={() => {
                editor.setCurrentTool("select.crop.idle");
                editor.focus();
              }}
            >
              {svg(<path d="M6 3v11h11M3 6h11v11" />)}
            </button>
          )}
          <button type="button" className="gk-choice gk-choice--danger" title="Delete (Delete)" aria-label="Delete" onClick={act(() => editor.deleteShapes(editor.getSelectedShapeIds()))}>
            {svg(<path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" />)}
          </button>
        </Section>
      )}
    </div>
  );
}
