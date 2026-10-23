import { react, type Editor, type TLPageId, type TLShapeId } from "tldraw";

/** This tab's current page, kept for a reload. */
const KEY = "gauntlet:whiteboard:page";
/** This tab's selection on that page, kept for a reload. */
const SELECTION_KEY = "gauntlet:whiteboard:selection";

/**
 * A reload opens on the page you were on, with what you had selected.
 * tldraw saves both 350 ms after a change, to IndexedDB; its flush when the
 * page unloads is an async write the reload cuts off. A page change just
 * before a reload was lost: it reopened on the page before. A selection
 * change too, and an older selection came back: a click on that shape,
 * still selected, then opened its text instead of selecting it, and a
 * Delete went into the text (owner's flaky Delete, 2026-10-22). Here both
 * are also kept in the tab's sessionStorage, written at once, and put back
 * on open (only shapes still on the page). Per tab, as tldraw's own:
 * another tab keeps its own. Never what's on the page, so opening changes
 * nothing stored.
 */
export function rememberPage(editor: Editor): () => void {
  try {
    const id = sessionStorage.getItem(KEY) as TLPageId | null;
    if (id && id !== editor.getCurrentPageId() && editor.getPage(id)) editor.setCurrentPage(id);
    const raw = sessionStorage.getItem(SELECTION_KEY);
    if (raw !== null) {
      const ids = (JSON.parse(raw) as TLShapeId[]).filter((s) => editor.getShape(s) && editor.getAncestorPageId(s) === editor.getCurrentPageId());
      editor.run(() => editor.setSelectedShapes(ids), { history: "ignore" });
    }
  } catch {
    // No sessionStorage, or nothing readable: tldraw's own save still applies.
  }
  const stopPage = react("remember page", () => {
    const id = editor.getCurrentPageId();
    try {
      sessionStorage.setItem(KEY, id);
    } catch {
      // As above.
    }
  });
  const stopSelection = react("remember selection", () => {
    const ids = editor.getSelectedShapeIds();
    try {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify(ids));
    } catch {
      // As above.
    }
  });
  return () => {
    stopPage();
    stopSelection();
  };
}
