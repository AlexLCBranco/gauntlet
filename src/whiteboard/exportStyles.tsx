import { useLayoutEffect, useRef } from "react";
import { useSvgExportContext } from "tldraw";

/**
 * Exports draw widgets as they look on screen (speed session Part 9, owner
 * 2026-11-09 / 2026-11-14).
 *
 * The cause: tldraw (pinned 5.5.2; @tldraw/editor exports/StyleEmbedder.ts
 * and cssRules.ts) exports a widget by drawing its HTML in the picture and
 * writing each element's computed styles onto it, but to keep the file
 * small it leaves some out, on two guesses that are wrong in places:
 *  1. An inherited style (font, text-align, line-height, colour...) equal
 *     to an ancestor's is left out: "it will be inherited". Not for a
 *     button, input, textarea or select (or a link's colour): the browser
 *     gives those their own (13.3 px font, centred text, line-height normal...), so in the
 *     picture they lose the page's.
 *  2. Any style equal to the browser's default for that tag is left out.
 *     For an inherited style that is wrong when the parent's differs: a
 *     team name at 16 px inside a 14 px card came out at 14 px.
 *  3. A border 0 wide is left out: "it won't show". A button's default
 *     border (2 px) then shows.
 *  4. ::before / ::after get no styles at all (it lists them by number:
 *     "0: ;1: ;..."). The Slate's note box sizes itself with one.
 * So Boardkit's list titles and card texts (buttons) got a white edit-box
 * border, the wrong font, and wrapped; the Slate's rows came out taller.
 *
 * The fix, for each widget exported: the same decisions tldraw makes are
 * worked out here, and wherever the picture would then show a value other
 * than the screen's, that value goes into a style sheet in the picture
 * (the way tldraw adds its fonts), marked for that element only. Where
 * tldraw writes a style itself, it writes the same value, so nothing else
 * changes. Only public tldraw API (useSvgExportContext, addExportDef).
 */

/** Styles tldraw leaves out when equal to an ancestor's (cssRules.ts). */
const LEFT_OUT_IF_INHERITED = [
  "border-collapse", "border-spacing", "caption-side", "cursor", "direction", "empty-cells",
  "font-family", "font-size", "font-style", "font-variant", "font-weight", "font-size-adjust", "font-stretch",
  "letter-spacing", "line-height", "list-style-image", "list-style-position", "list-style-type",
  "orphans", "overflow-wrap", "quotes", "tab-size", "text-align", "text-align-last", "text-indent",
  "text-justify", "text-shadow", "text-transform", "visibility", "white-space", "white-space-collapse",
  "widows", "word-break", "word-spacing", "word-wrap",
];
/** Inherited styles tldraw leaves out only when equal to the tag's default. */
const INHERITED_OTHERS = ["color"];
/** A border tldraw leaves out when 0 wide or of style none (cssRules.ts). */
const BORDERS = ["top", "right", "bottom", "left"].flatMap((side) => [`border-${side}-width`, `border-${side}-style`, `border-${side}-color`]);

const MARK = "data-gx";

type Styles = Record<string, string>;
type Read = (el: Element, props: readonly string[]) => Styles;

/** Computed values as tldraw reads them (computedStyleMap where there is one). */
const read: Read = (el, props) => {
  const out: Styles = {};
  const map = (el as Element & { computedStyleMap?: () => StylePropertyMapReadOnly }).computedStyleMap?.();
  const cs = map ? null : getComputedStyle(el);
  for (const p of props) out[p] = map ? (map.get(p)?.toString() ?? "") : cs!.getPropertyValue(p);
  return out;
};

const ALL = [...LEFT_OUT_IF_INHERITED, ...INHERITED_OTHERS, ...BORDERS];

/** A value for each inherited style unlike any default: a tag whose own
    value differs from its parent's set to this has one from the browser. */
const PROBE: Styles = {
  "border-collapse": "collapse", "border-spacing": "3px 3px", "caption-side": "bottom", cursor: "crosshair",
  direction: "rtl", "empty-cells": "hide", "font-family": "gxprobe", "font-size": "37px", "font-style": "italic",
  "font-variant": "small-caps", "font-weight": "300", "font-stretch": "75%", "letter-spacing": "3px",
  "line-height": "2.5", "list-style-position": "inside", "list-style-type": "square", orphans: "5",
  "overflow-wrap": "anywhere", quotes: "none", "tab-size": "3", "text-align": "right", "text-align-last": "right",
  "text-indent": "7px", "text-shadow": "rgb(1, 2, 3) 1px 1px 1px", "text-transform": "uppercase",
  visibility: "hidden", "white-space": "pre", widows: "5", "word-break": "break-all", "word-spacing": "5px",
  color: "rgb(1, 2, 3)",
};

/** Each tag's defaults as tldraw reads them (in a blank document, inside an
    SVG foreignObject), and which inherited styles the browser sets for it. */
export type Defaults = { get(tag: string): Styles; own(tag: string): Set<string>; pseudo(): Styles };

export function defaultsReader(doc: Document): Defaults & { dispose(): void } {
  const cache = new Map<string, Styles>();
  const owns = new Map<string, Set<string>>();
  let frame: HTMLIFrameElement | null = null;
  let host: Element | null = null;
  let pseudoDefaults: Styles | null = null;
  const fd = () => {
    if (!frame) {
      frame = doc.createElement("iframe");
      frame.style.display = "none";
      doc.body.appendChild(frame);
      const d = frame.contentDocument!;
      const svg = d.createElementNS("http://www.w3.org/2000/svg", "svg");
      host = d.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      svg.appendChild(host);
      d.body.appendChild(svg);
    }
    return frame.contentDocument!;
  };
  const get = (tag: string): Styles => {
    let d = cache.get(tag);
    if (d) return d;
    const el = fd().createElement(tag);
    host!.appendChild(el);
    d = read(el, ALL);
    host!.removeChild(el);
    cache.set(tag, d);
    return d;
  };
  const own = (tag: string): Set<string> => {
    let o = owns.get(tag);
    if (o) return o;
    const parent = fd().createElement("div");
    for (const [p, v] of Object.entries(PROBE)) parent.style.setProperty(p, v);
    const el = fd().createElement(tag);
    parent.appendChild(el);
    host!.appendChild(parent);
    const pv = read(parent, Object.keys(PROBE));
    const cv = read(el, Object.keys(PROBE));
    host!.removeChild(parent);
    o = new Set(Object.keys(PROBE).filter((p) => pv[p] !== "" && cv[p] !== pv[p]));
    owns.set(tag, o);
    return o;
  };
  const pseudo = () => {
    if (!pseudoDefaults) {
      const el = fd().createElement("div");
      host!.appendChild(el);
      pseudoDefaults = pseudoStyles(el, "::after");
      host!.removeChild(el);
    }
    return pseudoDefaults;
  };
  return { get, own, pseudo, dispose: () => frame?.remove() };
}

/** Every style of `el`'s pseudo-element, by name. */
function pseudoStyles(el: Element, which: string): Styles {
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el, which);
  const out: Styles = {};
  for (let i = 0; i < cs.length; i++) {
    const p = cs.item(i);
    if (!p.startsWith("--")) out[p] = cs.getPropertyValue(p);
  }
  return out;
}

/**
 * The CSS that makes `root`'s copy in an export look as `root` does now.
 * `root` is what tldraw reads first (all its styles written); below it,
 * each element's styles are decided as tldraw decides them, and each
 * inherited one the picture would get wrong is set here. Elements given a
 * rule are marked (`data-gx`) for it.
 */
export function exportCss(root: Element, key: string, defaults: Defaults, readStyles: Read = read): string {
  let css = "";
  let n = 0;
  const marked = (el: Element) => {
    let mark = el.getAttribute(MARK);
    if (!mark) {
      mark = `${key}-${n++}`;
      el.setAttribute(MARK, mark);
    }
    return mark;
  };
  // What tldraw wrote on an element (`recorded`), and what the picture
  // shows on it, per style.
  const walk = (el: Element, recordedAbove: Styles, shownAbove: Styles) => {
    const tag = el.tagName.toLowerCase();
    const def = defaults.get(tag);
    const own = defaults.own(tag);
    const v = readStyles(el, ALL);
    const recorded: Styles = { ...recordedAbove };
    const shown: Styles = {};
    const fix: string[] = [];
    for (const p of [...LEFT_OUT_IF_INHERITED, ...INHERITED_OTHERS]) {
      const written = v[p] !== def[p] && !(LEFT_OUT_IF_INHERITED.includes(p) && recordedAbove[p] === v[p]);
      if (written) recorded[p] = v[p]!;
      // Left out: the tag's own default where the browser sets one for
      // it, else the parent's, as the picture shows it.
      shown[p] = written ? v[p]! : own.has(p) ? def[p]! : shownAbove[p]!;
      if (shown[p] !== v[p] && v[p]) {
        fix.push(`${p}:${v[p]}`);
        shown[p] = v[p]!;
      }
    }
    // A tag with a border of its own (a button's): the screen's border,
    // written whole (tldraw may leave out a 0 width or a none style).
    if (BORDERS.some((p) => p.endsWith("-style") && def[p] && def[p] !== "none")) for (const p of BORDERS) if (v[p]) fix.push(`${p}:${v[p]}`);
    if (fix.length) css += `[${MARK}="${marked(el)}"]{${fix.join(";")}}
`;
    // ::before / ::after: tldraw writes none of their styles (it lists
    // them by number), so all that differ from a blank one are set here.
    for (const which of ["::before", "::after"]) {
      const content = getComputedStyle(el, which).content;
      if (!content || content === "none" || content === "normal") continue;
      const ps = pseudoStyles(el, which);
      const base = defaults.pseudo();
      const mine = getComputedStyle(el);
      const decl = Object.entries(ps)
        .filter(([p, val]) => val !== base[p] || val !== mine.getPropertyValue(p))
        .map(([p, val]) => `${p}:${val}`);
      css += `[${MARK}="${marked(el)}"]${which}{${decl.join(";")}}
`;
    }
    for (const child of el.children) walk(child, recorded, shown);
  };
  // The root: every style written (StyleEmbedder.readRootElementStyles).
  const top = readStyles(root, ALL);
  for (const child of root.children) walk(child, top, top);
  return css;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Put inside a widget's HTMLContainer. On screen it draws nothing; in an
 * export it adds the style sheet above for the widget, worked out once the
 * widget has drawn (two frames on: content may arrive a frame after the
 * export starts). tldraw waits for it before taking the picture.
 */
export function ExportStyles({ shapeId }: { shapeId: string }) {
  const ctx = useSvgExportContext();
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!ctx) return;
    const key = `gx-${shapeId.replace(/[^\w-]/g, "_")}`;
    ctx.addExportDef({
      key,
      getElement: async () => {
        await nextFrame();
        await nextFrame();
        const root = ref.current?.closest(".tl-shape");
        if (!root) return null;
        const defaults = defaultsReader(root.ownerDocument);
        try {
          const css = exportCss(root, key, defaults);
          return css ? <style>{css}</style> : null;
        } finally {
          defaults.dispose();
        }
      },
    });
  }, [ctx, shapeId]);
  return ctx ? <span ref={ref} hidden /> : null;
}

/** True while drawn for an export, not on screen: widgets then leave their
    live box alone (no measuring and resizing the shape from an export). */
export const useInExport = () => useSvgExportContext() !== null;
