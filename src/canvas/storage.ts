/**
 * The canvas's own keys. It reads the apps' keys (see `domain/sources.ts`)
 * but never writes them.
 *
 *   gauntlet:canvas   the layout (pages and widgets)
 *   gauntlet:scroll   each widget's last scroll position inside its frame
 */
import { emptyLayout, readLayout, type Layout } from "../domain/layout";

export const LAYOUT_KEY = "gauntlet:canvas";
const SCROLL_KEY = "gauntlet:scroll";

export const newId = () => crypto.randomUUID();

export function loadLayout(): Layout {
  try {
    return readLayout(localStorage.getItem(LAYOUT_KEY)) ?? emptyLayout(newId());
  } catch {
    return emptyLayout(newId());
  }
}

export function saveLayout(layout: Layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch (err) {
    console.error("Gauntlet: couldn't save the canvas layout", err);
  }
}

export type Scrolls = Record<string, { x: number; y: number }>;

export function loadScrolls(): Scrolls {
  try {
    const data = JSON.parse(localStorage.getItem(SCROLL_KEY) ?? "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function saveScrolls(scrolls: Scrolls) {
  try {
    localStorage.setItem(SCROLL_KEY, JSON.stringify(scrolls));
  } catch {
    // Only a convenience: the layout itself is saved separately.
  }
}
