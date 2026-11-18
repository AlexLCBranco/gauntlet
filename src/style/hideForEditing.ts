import { atom, react, type Editor, type TLShapeId } from "tldraw";

// GT-12 (owner, 2026-11-18): the style panel (Opacity / Layers / Actions,
// StylePanel.tsx) hides while a widget under it is being edited, and comes
// back when the editing ends. "Edited": a board, map or web embed open in
// tldraw's edit mode (a double-click), or a Slate note being typed in (its
// field has the focus; tldraw doesn't know about it). "Under it": the
// widget's box on screen overlaps the panel's (moving the camera or the
// panel counts). The panel is only hidden (`data-hidden-for-editing`): its
// state (collapsed, side) stays.

const WIDGETS = new Set(["boardkit-board", "linkkit-map", "calendarkit-slate", "web-embed"]);
const PANEL = ".gk-style-panel";

/** The widget whose Slate note is being typed in, or null. */
const typingIn = atom<TLShapeId | null>("slate note typed in", null);
const shapeOf = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement && t.closest(".gs-slate") ? ((t.closest(".tl-shape") as HTMLElement | null)?.dataset.shapeId as TLShapeId | undefined) ?? null : null;

/** Starts the watch; returns its stop. */
export function hideStylePanelForEditing(editor: Editor): () => void {
  const focusIn = (e: FocusEvent) => typingIn.set(shapeOf(e.target));
  const focusOut = (e: FocusEvent) => {
    if (shapeOf(e.target)) typingIn.set(shapeOf(e.relatedTarget));
  };
  document.addEventListener("focusin", focusIn);
  document.addEventListener("focusout", focusOut);

  let frame = 0;
  let hidden = false;
  const stop = react("style panel hides for an edited widget under it", () => {
    const editing = editor.getEditingShape();
    const id = editing && WIDGETS.has(editing.type) ? editing.id : typingIn.get();
    // Nothing edited: no work at all (this runs on every camera step while editing only).
    if (!id) {
      cancelAnimationFrame(frame);
      if (hidden) apply(undefined);
      return;
    }
    editor.getSelectedShapeIds(); // the panel comes and goes with the selection
    const b = editor.getShapePageBounds(id);
    editor.getCamera();
    // now, and once more after React has drawn (the panel may mount after the edit starts)
    apply(b);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => apply(b));
  });
  function apply(b: ReturnType<Editor["getShapePageBounds"]>) {
    const panel = document.querySelector<HTMLElement>(PANEL);
    let hide = false;
    if (b && panel) {
      {
        const v = editor.getViewportScreenBounds();
        const tl = editor.pageToScreen({ x: b.minX, y: b.minY });
        const br = editor.pageToScreen({ x: b.maxX, y: b.maxY });
        // the panel's box only while something is edited (no layout work otherwise)
        const r = panel.getBoundingClientRect();
        hide = tl.x + v.x < r.right && br.x + v.x > r.left && tl.y + v.y < r.bottom && br.y + v.y > r.top;
      }
    }
    hidden = hide;
    for (const el of document.querySelectorAll<HTMLElement>(PANEL)) {
      if (hide === "hiddenForEditing" in el.dataset) continue;
      if (hide) el.dataset.hiddenForEditing = "";
      else delete el.dataset.hiddenForEditing;
    }
  }
  return () => {
    stop();
    cancelAnimationFrame(frame);
    document.removeEventListener("focusin", focusIn);
    document.removeEventListener("focusout", focusOut);
    typingIn.set(null);
    for (const el of document.querySelectorAll<HTMLElement>(PANEL)) delete el.dataset.hiddenForEditing;
  };
}
