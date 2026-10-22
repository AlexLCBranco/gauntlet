// Pure, no tldraw; tested in toolbarLayout.test.ts.

/** The toolbar along the top (owner, 2026-10-22): drawing tools, a
    separator, then the Board and Map widgets; the ⋮ "More tools" menu at
    the right holds the rest. Always exactly these on the bar, at every
    window size: there is no overflow. */
export const SEPARATOR = "|";
export const BAR: readonly string[] = ["select", "rectangle", "arrow", "line", SEPARATOR, "board", "map"];
export const MORE: readonly string[] = ["asset", "embed", "lasso", "markup", "text", "draw"];

/** Each tool's name on the toolbar and in the ⋮ menu, as the owner named
    them (not tldraw's translations, which follow the browser's language). */
export const LABELS: Readonly<Record<string, string>> = {
  select: "Select",
  rectangle: "Rectangle",
  arrow: "Arrow",
  line: "Line",
  board: "Board",
  map: "Map",
  asset: "Insert image",
  embed: "Web embed",
  lasso: "Lasso selection",
  markup: "Markup",
  text: "Text",
  draw: "Draw",
};

/**
 * Each tool's keys, as tldraw's `kbd` (the whiteboard's tools use exactly
 * these, so a hint never shows a key that doesn't work), and the hint the
 * toolbar shows: as Excalidraw (components/Tools.tsx), the letter, else the
 * number, in the button's corner and on the right of the ⋮ menu's entry.
 * Excalidraw's keys where it has them; ours, picked so nothing clashes:
 * B board (it was a second key for Draw), M map, I web embed, W lasso.
 * Markup (K) has no key until its tool exists (step 4): no hint either.
 */
export const KEYS: Readonly<Record<string, { kbd: string; hint: string }>> = {
  select: { kbd: "v,1", hint: "V" },
  rectangle: { kbd: "r,2", hint: "R" },
  arrow: { kbd: "a,5", hint: "A" },
  line: { kbd: "l,6", hint: "L" },
  board: { kbd: "b", hint: "B" },
  map: { kbd: "m", hint: "M" },
  asset: { kbd: "cmd+u,ctrl+u,9", hint: "9" },
  embed: { kbd: "i", hint: "I" },
  lasso: { kbd: "w", hint: "W" },
  text: { kbd: "t,8", hint: "T" },
  draw: { kbd: "p,7,x", hint: "P" },
};

/** The tooltip, as Excalidraw's: "Rectangle — R or 2". */
export function tooltip(id: string): string {
  const label = LABELS[id] ?? id;
  const k = KEYS[id];
  if (!k) return label;
  const keys = k.kbd.split(",").filter((x) => !x.includes("+") && x.toUpperCase() !== k.hint).map((x) => x.toUpperCase());
  return `${label} — ${[k.hint, ...keys].join(" or ")}`;
}

/** Tools tldraw (or this app, earlier) offered that are not on this
    whiteboard: no button, no menu item, no key. Shapes of these kinds
    already on a page stay as they are. */
export const REMOVED: readonly string[] = [
  "hand",
  "diamond",
  "ellipse",
  "eraser",
  "highlight",
  "laser",
  "note",
  "frame",
  // tldraw's other geo tools (never shown here, but they had tool entries).
  "triangle",
  "trapezoid",
  "rhombus",
  "pentagon",
  "hexagon",
  "octagon",
  "star",
  "oval",
  "cloud",
  "heart",
  "x-box",
  "check-box",
  "arrow-left",
  "arrow-up",
  "arrow-down",
  "arrow-right",
];

/**
 * The toolbar as the owner arranged it (step 3): the bar's order, with the
 * separator, and the ⋮ menu's. Tools move between the two, and within
 * each, by dragging (Toolbar.tsx); it's kept in this browser
 * (toolbarStore.ts) and "Reset toolbar to default" brings back BAR and
 * MORE.
 */
export interface Layout {
  readonly bar: readonly string[];
  readonly more: readonly string[];
}
export type Place = "bar" | "more";
export const DEFAULT_LAYOUT: Layout = { bar: BAR, more: MORE };

/** Never leave the bar: Select (owner) and the separator (not dragged). */
export const FIXED_ON_BAR: ReadonlySet<string> = new Set(["select", SEPARATOR]);

/** `id` moved to `to`, at `index` among that list's other items. The same
    layout when the move isn't allowed (Select or the separator into the
    menu, an unknown id) or changes nothing. */
export function moveTool(layout: Layout, id: string, to: Place, index: number): Layout {
  const from: Place | null = layout.bar.includes(id) ? "bar" : layout.more.includes(id) ? "more" : null;
  if (!from || id === SEPARATOR || (to === "more" && FIXED_ON_BAR.has(id))) return layout;
  const without = { bar: layout.bar.filter((x) => x !== id), more: layout.more.filter((x) => x !== id) };
  const list = [...without[to]];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, id);
  const next = { ...without, [to]: list };
  return sameLayout(next, layout) ? layout : next;
}

export function sameLayout(a: Layout, b: Layout): boolean {
  return a.bar.join() === b.bar.join() && a.more.join() === b.more.join();
}

/** A stored layout made whole: unknown and repeated ids dropped, Select and
    the separator back on the bar, any tool missing put back where the
    default has it (end of that list). Anything unreadable: the default. */
export function normalizeLayout(raw: unknown): Layout {
  const r = raw as { bar?: unknown; more?: unknown } | null;
  if (!r || !Array.isArray(r.bar) || !Array.isArray(r.more)) return DEFAULT_LAYOUT;
  const known = new Set([...BAR, ...MORE]);
  const seen = new Set<string>();
  const keep = (list: unknown[]) =>
    list.filter((x): x is string => typeof x === "string" && known.has(x) && !seen.has(x) && (seen.add(x), true));
  const bar = keep(r.bar);
  const more = keep(r.more).filter((x) => !FIXED_ON_BAR.has(x) || (bar.push(x), false));
  for (const id of BAR) if (!seen.has(id) && !bar.includes(id)) bar.push(id);
  for (const id of MORE) if (!seen.has(id)) more.push(id);
  return { bar, more };
}
