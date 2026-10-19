// Pure, no tldraw; tested in toolbarFit.test.ts.

/** How many tools fit on the toolbar's row in a window this wide (the rest
    go in its overflow menu): it stays centred and clear of the main menu
    at the left. */
export function toolbarItems(windowWidth: number): number {
  const TOOL = 44; // a tool's width
  const room = windowWidth - 2 * 140 - TOOL - 16; // the menu's width on each side, the overflow button, padding
  return Math.max(5, Math.min(17, Math.floor(room / TOOL)));
}
