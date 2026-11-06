import { Vec, type Editor } from "tldraw";

import { readWidgetRef } from "../boards/boardkit";
import { REGISTRY_KEY, registryBoards } from "../boards/registry";
import { cursorOnPage, placeEntry } from "./WidgetPicker";

// Copy in the app, paste on the whiteboard (owner, Edges round item 3b):
// Ctrl+C in /boardkit with no card picked puts `/boardkit/?board=&list=` on
// the clipboard (Boardkit v0.0.106), Ctrl+C in /linkkit with no box picked
// `/linkkit/?map=` (Linkkit). Pasted here (same site), that LIVE board,
// list or map lands with its top-left corner at the cursor (off the page:
// the middle of the view). Any other paste is tldraw's (or the web embed's).

/** The map a copied Linkkit address names, if it is one. */
export function readMapRef(text: string): string | null {
  try {
    const url = new URL(text.trim());
    return /^\/linkkit\/?$/.test(url.pathname) ? url.searchParams.get("map") : null;
  } catch {
    return null;
  }
}

const mapExists = (id: string) => {
  try {
    return localStorage.getItem(`linkkit:map:${id}`) !== null;
  } catch {
    return false;
  }
};

/** Turns the paste of a copied board, list or map into its widget. Seen
    first (capture), before tldraw and the web embed. Returns a stop
    function. */
export function pasteWidgets(editor: Editor): () => void {
  const paste = (e: ClipboardEvent) => {
    const t = e.target as Element | null;
    if (t?.closest?.("input, textarea, [contenteditable='true']") || editor.getEditingShapeId()) return;
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!text || text.length > 2000) return;
    const corner = cursorOnPage(editor);
    const ref = readWidgetRef(text);
    if (ref) {
      const board = registryBoards(localStorage.getItem(REGISTRY_KEY)).find((b) => b.id === ref.board);
      if (!board) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      placeEntry(editor, ref.list ? { kind: "list", board: ref.board, id: ref.list, label: "", boardName: board.name } : { kind: "board", id: ref.board, label: board.name, lists: [] }, corner);
      return;
    }
    const map = readMapRef(text);
    if (map && mapExists(map)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      placeEntry(editor, { kind: "map", id: map, label: "" }, corner);
    }
  };
  window.addEventListener("paste", paste, true);
  return () => window.removeEventListener("paste", paste, true);
}

/**
 * Paste at the cursor (Edges round item 4) is tldraw's own preference;
 * with the cursor off the page (on a toolbar, outside the window) the paste
 * goes to the middle of the view instead: the preference is off for that
 * one paste. keepInside.ts keeps it inside the page as for any paste.
 * Returns a stop function.
 */
export function pasteMiddleOffPage(editor: Editor): () => void {
  // tldraw pastes at its remembered pointer (inputs' current page point, a
  // tldraw internal: tldraw is pinned). Off the page, that point is set to
  // the middle of the view for this paste; the next pointer move puts it
  // back. (With the preference off tldraw pastes over the originals.)
  const before = (e: KeyboardEvent | ClipboardEvent) => {
    if (e instanceof KeyboardEvent && !((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v")) return;
    if (!editor.user.getIsPasteAtCursorMode() || cursorOnPage(editor)) return;
    const c = editor.getViewportPageBounds().center;
    const point = (editor.inputs as unknown as { _currentPagePoint?: { set(v: Vec): void } })._currentPagePoint;
    point?.set(new Vec(c.x, c.y));
  };
  window.addEventListener("keydown", before, true);
  window.addEventListener("paste", before, true);
  return () => {
    window.removeEventListener("keydown", before, true);
    window.removeEventListener("paste", before, true);
  };
}
