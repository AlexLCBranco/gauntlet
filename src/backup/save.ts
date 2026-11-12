// One clear save (owner, Edges round item 2). Underneath, as before: every
// app saves in this browser as you go (tldraw, Boardkit, Linkkit,
// calendarkit's notes), and automatic backups are kept in the browser and
// in the picked folder every 10 minutes (`auto.ts`). On top, this: a few
// seconds after any change, the whole site is written to the folder as ONE
// current file (`LATEST_FILE`), and the whiteboard shows one status for
// all of it (`SaveStatus.tsx`). Ctrl+S writes it at once, with a dated
// copy.

import { takeSnapshot } from "./client";
import { folderState, lastFolderNote, writeLatest, writeToFolder } from "./folder";

/** How long after the last change the folder is written. */
export const SAVE_DELAY_MS = 2500;

export type SavePhase =
  /** Written to the folder, nothing newer. */
  | "saved"
  /** A change waits to be written (or is being written). */
  | "saving"
  /** The last write failed, or an app's own save failed: red. */
  | "failed"
  /** Chrome wants a click to let this page write to the folder again. */
  | "reconnect"
  /** No folder picked: saved in this browser only. */
  | "no-folder";

export interface SaveState {
  readonly phase: SavePhase;
  /** When the folder was last written (ms), if ever. */
  readonly savedAt?: number;
  readonly folder?: string;
  readonly detail?: string;
}

let state: SaveState = { phase: "saving" };
const subs = new Set<() => void>();
const set = (next: SaveState) => {
  state = next;
  subs.forEach((f) => f());
};
export const saveState = () => state;
export const subscribeSave = (fn: () => void) => {
  subs.add(fn);
  return () => void subs.delete(fn);
};

/** An app reports its own saves failing (Boardkit's save health). */
let appFailing = false;
/** Why the last save could not be made (reading the site's data failed):
    it shows as "Not saved" until a save works. A save that fails must
    never read "Saved". */
let buildError: string | undefined;
export function setAppSaveFailing(failing: boolean) {
  if (failing === appFailing) return;
  appFailing = failing;
  void refresh();
}

let timer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
let writing: Promise<void> | null = null;
let changedAt = 0;
/** tldraw stores a change in the browser a moment after it (batched every
    350 ms): a save waits this long after the last change. */
const SETTLE_MS = 800;

/** The status from the folder's state when nothing is pending. */
async function refresh(): Promise<void> {
  const folder = await folderState();
  const n = lastFolderNote();
  if (appFailing) return set({ phase: "failed", savedAt: n?.ok ? n.at : undefined, folder: n?.folder, detail: "A board change could not be saved in this browser." });
  if (buildError && !writing) return set({ phase: "failed", savedAt: lastOkAt(), folder: n?.folder, detail: buildError });
  if (dirty || writing) return set({ ...state, phase: folder === "ready" ? "saving" : folder === "none" ? "no-folder" : "reconnect" });
  if (folder === "none") return set({ phase: "no-folder" });
  if (folder === "needs-permission") return set({ phase: "reconnect", folder: n?.folder, savedAt: lastOkAt() });
  if (n && !n.ok && n.problem === "failed") return set({ phase: "failed", folder: n.folder, savedAt: lastOkAt(), detail: n.detail });
  // "Saved to folder" (Ctrl+S) stays its 3 s through a refresh.
  set({ phase: "saved", folder: n?.folder, savedAt: lastOkAt() });
}

let okAt: number | undefined;
const lastOkAt = () => okAt ?? (lastFolderNote()?.ok ? lastFolderNote()!.at : undefined);

/** Something changed: the folder is written SAVE_DELAY_MS after the last change. */
export function markChanged(): void {
  dirty = true;
  changedAt = performance.now();
  if (state.phase !== "saving" && state.phase !== "failed") void refresh();
  clearTimeout(timer);
  timer = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
}

/** Writes the whole site to the folder now. `dated`: also a dated copy
    (Ctrl+S). */
export async function saveNow({ dated = false } = {}): Promise<void> {
  clearTimeout(timer);
  if (writing) await writing;
  dirty = false;
  let wroteDated = false;
  const run = (async () => {
    if ((await folderState()) !== "ready") return;
    set({ ...state, phase: "saving" });
    // The save reads what the apps stored; tldraw stores a change a moment
    // after it (in batches), so a save right after an edit waits for it.
    const wait = SETTLE_MS - (performance.now() - changedAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const now = new Date();
    try {
      const snap = await takeSnapshot(now);
      const out = await writeLatest(snap, now);
      buildError = undefined;
      if (out === "written") okAt = now.getTime();
      // Ctrl+S: a dated copy too, even when nothing changed since the last.
      if (dated && out === "written") wroteDated = (await writeToFolder(snap, now, true)) === "written";
    } catch (error) {
      console.error("Gauntlet: the save failed", error);
      buildError = `The save could not be made: ${error instanceof Error ? error.message : String(error)}`;
    }
  })();
  writing = run;
  await run;
  writing = null;
  await refresh();
  // Ctrl+S written: "Saved to folder" for 3 s, even if the page changed
  // again meanwhile (tldraw stores its own preferences as it goes).
  if (wroteDated) {
    toFolderUntil = performance.now() + 3000;
    set({ ...state });
    setTimeout(() => set({ ...state }), 3050);
  }
}

let toFolderUntil = 0;
/** Whether "Saved to folder" shows now (Ctrl+S, 3 s). */
export const showsSavedToFolder = () => performance.now() < toFolderUntil;

/** Notes that aren't the site's data: written by the save itself. */
const OWN_KEYS = /^gauntlet:(auto-backup|folder-backup)$/;

/**
 * Starts watching for changes on this page: localStorage writes here
 * (Boardkit, Linkkit, the toolbar, the tray), other tabs' writes (the
 * `storage` event: /boardkit, /linkkit, /calendar's notes), and `onChange`
 * calls (the whiteboard's own edits). Ctrl+S saves at once. Returns a stop
 * function.
 */
export function watchChanges(): () => void {
  const own = { set: Storage.prototype.setItem, remove: Storage.prototype.removeItem };
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    own.set.call(this, key, value);
    if (this === localStorage && !OWN_KEYS.test(key)) markChanged();
  };
  Storage.prototype.removeItem = function (this: Storage, key: string) {
    own.remove.call(this, key);
    if (this === localStorage && !OWN_KEYS.test(key)) markChanged();
  };
  const storage = (e: StorageEvent) => {
    if (e.storageArea === localStorage && !(e.key && OWN_KEYS.test(e.key))) markChanged();
  };
  const keys = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      e.stopPropagation();
      void saveNow({ dated: true });
    }
  };
  // The folder's state can change without a write (picked, reconnected).
  const changed = () => void refresh();
  window.addEventListener("storage", storage);
  window.addEventListener("keydown", keys, true);
  window.addEventListener("gauntlet:backup-folder-changed", changed);
  void refresh();
  return () => {
    Storage.prototype.setItem = own.set;
    Storage.prototype.removeItem = own.remove;
    window.removeEventListener("storage", storage);
    window.removeEventListener("keydown", keys, true);
    window.removeEventListener("gauntlet:backup-folder-changed", changed);
    clearTimeout(timer);
  };
}
