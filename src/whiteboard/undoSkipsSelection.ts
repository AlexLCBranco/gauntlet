import type { Editor } from "tldraw";

/** As in Excalidraw, undo and redo never step through the selection alone.
    tldraw records "clearing selection" (Escape, a click on empty space) as
    its own undo step, so after drawing a shape and pressing Escape one
    Ctrl+Z only re-selected it. Undo and redo now carry on past steps that
    change nothing on the page. Returns a stop function. */
export function undoSkipsSelection(editor: Editor): () => void {
  const undo = editor.undo;
  const redo = editor.redo;
  const doc = editor.store.scopedTypes.document;
  const changesPage = (fn: () => void) => {
    const diff = editor.store.extractingChanges(fn);
    return [diff.added, diff.removed].some((m) => Object.values(m).some((r) => doc.has(r.typeName))) ||
      Object.values(diff.updated).some(([, r]) => doc.has(r.typeName));
  };
  const skipping = (step: () => Editor, can: () => boolean) => () => {
    // Bounded, in case a step never changes the page.
    for (let i = 0; i < 1000 && can(); i++) if (changesPage(step)) break;
    return editor;
  };
  editor.undo = skipping(() => undo.call(editor), () => editor.getCanUndo());
  editor.redo = skipping(() => redo.call(editor), () => editor.getCanRedo());
  return () => {
    editor.undo = undo;
    editor.redo = redo;
  };
}
