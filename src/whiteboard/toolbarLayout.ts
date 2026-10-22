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
