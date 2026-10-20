import { react, type Editor, type TLPageId } from "tldraw";

/** This tab's current page, kept for a reload. */
const KEY = "gauntlet:whiteboard:page";

/**
 * A reload opens on the page you were on. tldraw saves the current page
 * 350 ms after a change, to IndexedDB; its flush when the page unloads is
 * an async write the reload cuts off. A page change just before a reload
 * was lost: it reopened on the page before. Here the page is also kept in
 * the tab's sessionStorage, written at once, and put back on open. Per tab,
 * as tldraw's own: another tab keeps its page. Only the current page, never
 * what's on it, so opening changes nothing stored.
 */
export function rememberPage(editor: Editor): () => void {
  try {
    const id = sessionStorage.getItem(KEY) as TLPageId | null;
    if (id && id !== editor.getCurrentPageId() && editor.getPage(id)) editor.setCurrentPage(id);
  } catch {
    // No sessionStorage: tldraw's own save still applies.
  }
  return react("remember page", () => {
    const id = editor.getCurrentPageId();
    try {
      sessionStorage.setItem(KEY, id);
    } catch {
      // As above.
    }
  });
}
