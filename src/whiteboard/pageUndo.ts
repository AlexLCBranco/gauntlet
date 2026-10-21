import { atom, type Editor, type RecordsDiff, type TLRecord } from "tldraw";

import { onBoardHistory, redoBoard, undoBoard } from "../boards/boardkit";

/** One undoable step on the page: the drawing's (tldraw's history) or a
    board's (Boardkit's history of that board). */
type Step = { readonly kind: "drawing" } | { readonly kind: "board"; readonly boardId: string };

interface PageHistory {
  readonly done: readonly Step[];
  readonly undone: readonly Step[];
}

/**
 * One undo for the whole page (owner, 2026-10-20): Ctrl+Z, Ctrl+Y,
 * Ctrl+Shift+Z, the bottom-left buttons and the menu always undo or redo
 * the latest thing done on this page, a drawing change or a card edit, in
 * order. tldraw and Boardkit keep their own histories; this keeps the order
 * of which one acted. Edits made in /boardkit in another tab are not this
 * page's (Boardkit's history of the board still merges around them).
 */
export const pageHistory = atom<PageHistory>("page history", { done: [], undone: [] });

/** Set while this file undoes or redoes, so that is never a new step. */
let acting = false;

function push(step: Step) {
  const { done } = pageHistory.get();
  pageHistory.set({ done: [...done, step].slice(-500), undone: [] });
}

const boardExists = (boardId: string) => {
  try {
    return localStorage.getItem(`boardkit:board:${boardId}`) !== null;
  } catch {
    return false;
  }
};

/** Does `step` (undo or redo); false when there was nothing to do. */
function act(editor: Editor, step: Step, kind: "undo" | "redo"): boolean {
  acting = true;
  try {
    if (step.kind === "drawing") {
      if (!(kind === "undo" ? editor.getCanUndo() : editor.getCanRedo())) return false;
      if (kind === "undo") editor.undo();
      else editor.redo();
      return true;
    }
    if (!boardExists(step.boardId)) return false;
    // Another board being edited stops being edited first: Boardkit opens
    // one board at a time.
    const editing = editor.getEditingShape();
    if (editing?.type === "boardkit-board" && (editing.props as { boardId?: string }).boardId !== step.boardId) editor.setEditingShape(null);
    return kind === "undo" ? undoBoard(step.boardId) : redoBoard(step.boardId);
  } finally {
    acting = false;
  }
}

export function pageUndo(editor: Editor) {
  let { done, undone } = pageHistory.get();
  while (done.length > 0) {
    const step = done[done.length - 1];
    done = done.slice(0, -1);
    if (act(editor, step, "undo")) {
      undone = [...undone, step];
      break;
    }
  }
  pageHistory.set({ done, undone });
}

export function pageRedo(editor: Editor) {
  let { done, undone } = pageHistory.get();
  while (undone.length > 0) {
    const step = undone[undone.length - 1];
    undone = undone.slice(0, -1);
    if (act(editor, step, "redo")) {
      done = [...done, step];
      break;
    }
  }
  pageHistory.set({ done, undone });
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** What this file reads of tldraw's history (internal: tldraw 5.5.2 is
    pinned for this; package.json). */
interface TldrawHistory {
  readonly state: string;
  isReplaying(): boolean;
  readonly stacks: { get(): { readonly undos: unknown } };
}
type Intercepting = { addHistoryInterceptor(fn: (entry: { changes: RecordsDiff<TLRecord> }, source: string) => void): () => void };

/** Keeps the page's order of steps and takes the undo/redo keys. Returns a
    stop function. */
export function keepPageHistory(editor: Editor): () => void {
  const doc = editor.store.scopedTypes.document;
  const history = (editor as unknown as { history: TldrawHistory }).history;
  let lastUndos = history.stacks.get().undos;

  // A drawing change tldraw records for undo: a new step, unless it is part
  // of the step just recorded (tldraw undoes from one stopping point to the
  // one before, and a new stopping point changes its undo stack).
  const stopIntercepting = (editor.store as unknown as Intercepting).addHistoryInterceptor((entry, source) => {
    if (source !== "user" || acting || history.state === "paused" || history.isReplaying()) return;
    const { added, updated, removed } = entry.changes;
    const onPage =
      Object.values(added).some((r) => doc.has(r.typeName)) ||
      Object.values(removed).some((r) => doc.has(r.typeName)) ||
      Object.values(updated).some(([, r]) => doc.has(r.typeName));
    if (!onPage) return;
    const undos = history.stacks.get().undos;
    const newStop = undos !== lastUndos;
    lastUndos = undos;
    if (newStop || pageHistory.get().done.at(-1)?.kind !== "drawing") push({ kind: "drawing" });
  });

  // Board steps, as Boardkit makes them. A stopping point after each keeps
  // the drawing changes before and after it apart in tldraw's undo too.
  const stopBoards = onBoardHistory(({ boardId, kind }) => {
    if (acting) return;
    const { done, undone } = pageHistory.get();
    if (kind === "step") {
      push({ kind: "board", boardId });
      editor.markHistoryStoppingPoint("board step");
      lastUndos = history.stacks.get().undos;
      return;
    }
    // Boardkit undid or redid by itself (an "Undo" in one of its toasts):
    // that board's latest step moves across, so the order stays true.
    const from = kind === "undo" ? done : undone;
    const i = from.findLastIndex((s) => s.kind === "board" && s.boardId === boardId);
    if (i < 0) return;
    const moved = from[i];
    const rest = [...from.slice(0, i), ...from.slice(i + 1)];
    pageHistory.set(kind === "undo" ? { done: rest, undone: [...undone, moved] } : { done: [...done, moved], undone: rest });
  });

  // The keys, before tldraw and Boardkit see them. A text field keeps its
  // own undo (a card title being typed, a text shape).
  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    const undo = key === "z" && !e.shiftKey;
    const redo = (key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey);
    if ((!undo && !redo) || typing(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (undo) pageUndo(editor);
    else pageRedo(editor);
  };
  window.addEventListener("keydown", onKey, true);

  return () => {
    stopIntercepting();
    stopBoards();
    window.removeEventListener("keydown", onKey, true);
  };
}
