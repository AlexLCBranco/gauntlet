// Pure, no tldraw; tested in toolbarFit.test.ts.

/** A tool button's width, and the toolbar's padding at each end: 13 tools
    and the overflow button make a row 524 px wide, 44 tall, within
    Excalidraw's own toolbar (542 x 44, measured on excalidraw.com at 1400,
    1915 and 1920 px windows, 2026-10-21). */
export const TOOL_WIDTH = 37;
export const TOOLBAR_PAD = 3;
/** The tools Excalidraw shows on its row (select, hand, rectangle, diamond,
    ellipse, arrow, line, draw, text, image, eraser), then Board and Map.
    The rest (lasso, highlighter) are in the overflow menu. */
export const ROW_TOOLS = 13;

/** tldraw's `maxItems` for a window this wide: the row shows that many
    tools plus one more (tldraw keeps a slot for the last tool picked from
    the overflow menu). Wide, that slot holds lasso or highlighter, which
    whiteboard.css hides from the row, so the row is exactly ROW_TOOLS;
    narrow, the row stays centred and clear of the main menu at the left. */
export function toolbarItems(windowWidth: number): number {
  const room = windowWidth - 2 * 140 - TOOL_WIDTH - 2 * TOOLBAR_PAD; // the menu's width on each side, the overflow button, padding
  return Math.max(4, Math.min(ROW_TOOLS, Math.floor(room / TOOL_WIDTH) - 1));
}
