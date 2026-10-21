/** The deleted iframe canvas's saved data: its layout and its frames'
    scroll positions. Nothing reads them any more; the owner said to delete
    them (2026-10-21). Backups made before still hold them. */
export const OLD_CANVAS_KEYS = ["gauntlet:canvas", "gauntlet:scroll"] as const;

/** Removes the old canvas's keys from this browser, if they are there. */
export function dropOldCanvasKeys(): void {
  for (const key of OLD_CANVAS_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage blocked: nothing to remove, and nothing depends on it.
    }
  }
}
