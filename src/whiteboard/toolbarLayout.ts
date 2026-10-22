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
