// Automatic backups to a folder on the computer, outside the browser.
//
// The browser's own automatic backups (`auto.ts`) live in the same storage
// as the data: clearing the browser's data loses both. So every automatic
// backup is also written as a file to a folder the owner picks once on the
// backup page (best: a folder Google Drive syncs, so it also leaves the
// computer). Same file as "Save a backup", same keeping rule as the
// browser's backups (`folderNames.ts`).
//
// The browser keeps the picked folder (its handle, in IndexedDB
// `FOLDER_DB`), but may ask again for permission to write to it after a
// restart. Writing needs that permission; asking for it needs a click. So
// when it's missing, a banner with a "Reconnect" button shows on the page,
// and the backup page has the same button.

import { folderDrops, folderFileName } from "./folderNames";
import { FOLDER_DB, FOLDER_NOTE } from "./storage";

// The File System Access API's parts that TypeScript's DOM types lack.
type Permission = "granted" | "denied" | "prompt";
interface PermissionHandle {
  queryPermission(options: { mode: "readwrite" }): Promise<Permission>;
  requestPermission(options: { mode: "readwrite" }): Promise<Permission>;
}
type Folder = FileSystemDirectoryHandle & Partial<PermissionHandle> & { values(): AsyncIterable<FileSystemHandle> };
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: "readwrite"; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

const STORE = "handles";
const KEY = "folder";

export type FolderState =
  /** No folder picked (or this browser can't pick one). */
  | "none"
  /** Picked, and the browser lets this page write to it. */
  | "ready"
  /** Picked, but the browser wants a click to allow writing again. */
  | "needs-permission";

export interface FolderNote {
  readonly at: number;
  readonly ok: boolean;
  /** The folder's name, as the browser gives it (no full path). */
  readonly folder?: string;
  /** The last file written. */
  readonly file?: string;
  /** What went wrong (ok false). */
  readonly problem?: "needs-permission" | "failed";
  readonly detail?: string;
  /** The data last written, to skip writing the same again. */
  readonly print?: string;
}

/** This browser can pick a folder (Edge and Chrome on a computer can). */
export const canPickFolder = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function openDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(FOLDER_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  return done(request);
}

async function stored(): Promise<Folder | null> {
  const db = await openDb();
  try {
    return ((await done(db.transaction(STORE, "readonly").objectStore(STORE).get(KEY))) as Folder | undefined) ?? null;
  } finally {
    db.close();
  }
}

async function store(folder: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    if (folder) tx.objectStore(STORE).put(folder, KEY);
    else tx.objectStore(STORE).delete(KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** The picked folder, or null. Never throws. */
export async function backupFolder(): Promise<Folder | null> {
  try {
    return typeof indexedDB === "undefined" ? null : await stored();
  } catch {
    return null;
  }
}

async function permission(folder: Folder): Promise<Permission> {
  try {
    return folder.queryPermission ? await folder.queryPermission({ mode: "readwrite" }) : "granted";
  } catch {
    return "prompt";
  }
}

export async function folderState(): Promise<FolderState> {
  const folder = await backupFolder();
  if (!folder) return "none";
  return (await permission(folder)) === "granted" ? "ready" : "needs-permission";
}

export function lastFolderNote(): FolderNote | null {
  try {
    return JSON.parse(localStorage.getItem(FOLDER_NOTE) ?? "null") as FolderNote | null;
  } catch {
    return null;
  }
}

function note(value: FolderNote): void {
  try {
    localStorage.setItem(FOLDER_NOTE, JSON.stringify(value));
  } catch {
    // Storage full: the page still shows the folder's state on its own.
  }
  window.dispatchEvent(new Event(FOLDER_CHANGED));
}

/** Sent on this page when the folder or its last write changed. */
export const FOLDER_CHANGED = "gauntlet:backup-folder-changed";

/** Asks the owner to pick the folder (needs a click). Returns false if they
    cancelled. Throws only what the browser throws for other reasons. */
export async function pickFolder(): Promise<boolean> {
  if (!window.showDirectoryPicker) return false;
  let picked: FileSystemDirectoryHandle;
  try {
    picked = await window.showDirectoryPicker({ id: "gauntlet-backups", mode: "readwrite", startIn: "documents" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return false;
    throw error;
  }
  await store(picked);
  // A new folder: the next backup is written to it even if nothing changed.
  note({ at: Date.now(), ok: true, folder: picked.name });
  return true;
}

/** Asks the browser again for permission to write (needs a click). */
export async function reconnectFolder(): Promise<boolean> {
  const folder = await backupFolder();
  if (!folder) return false;
  try {
    const answer = folder.requestPermission ? await folder.requestPermission({ mode: "readwrite" }) : "granted";
    window.dispatchEvent(new Event(FOLDER_CHANGED));
    return answer === "granted";
  } catch {
    return false;
  }
}

/** Stops writing to the folder (its files stay). */
export async function forgetFolder(): Promise<void> {
  await store(null);
  try {
    localStorage.removeItem(FOLDER_NOTE);
  } catch {
    // Nothing to forget.
  }
  window.dispatchEvent(new Event(FOLDER_CHANGED));
}

export type FolderOutcome = "written" | "unchanged" | "none" | "needs-permission" | "failed";

/**
 * Writes this backup (`json`, the backup file) to the picked folder, then
 * deletes the folder's old automatic backups (never other files). Skipped
 * when no folder is picked, or when the same data was the last written
 * (unless `force`). Never throws: a backup that can't be written is noted,
 * and the page shows it.
 */
export async function writeToFolder(json: string, print: string, now: Date, force = false): Promise<FolderOutcome> {
  const folder = await backupFolder();
  if (!folder) return "none";
  const before = lastFolderNote();
  if ((await permission(folder)) !== "granted") {
    note({ at: now.getTime(), ok: false, folder: folder.name, problem: "needs-permission", print: before?.print });
    return "needs-permission";
  }
  if (!force && before?.ok && before.folder === folder.name && before.print === print) return "unchanged";
  try {
    const file = folderFileName(now);
    const handle = await folder.getFileHandle(file, { create: true });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    note({ at: now.getTime(), ok: true, folder: folder.name, file, print });
  } catch (error) {
    console.error("Gauntlet: the backup could not be written to the folder", error);
    note({ at: now.getTime(), ok: false, folder: folder.name, problem: "failed", detail: String(error), print: before?.print });
    return "failed";
  }
  // Old ones out. A file that can't be deleted (gone already, locked by the
  // sync app) is left for next time; the new backup is written either way.
  try {
    const names: string[] = [];
    for await (const entry of folder.values()) if (entry.kind === "file") names.push(entry.name);
    for (const name of folderDrops(names, now.getTime())) {
      await folder.removeEntry(name).catch(() => {});
    }
  } catch (error) {
    console.warn("Gauntlet: old backups in the folder could not be tidied", error);
  }
  return "written";
}

export const FOLDER_TEXT = {
  none: "Your automatic backups never leave this browser: clearing its data loses them too. Choose a backup folder to keep a copy on your computer.",
  "needs-permission": "Backups to your folder are paused: the browser wants your OK again to write to it.",
  failed: "The last backup could not be written to your backup folder.",
} as const;

/** A banner on the page (bottom left) about the folder, with the button
    that fixes it right there (a click is what the browser needs). */
export function showFolderBanner(kind: keyof typeof FOLDER_TEXT): void {
  if (document.querySelector("[data-folder-warning]")) return;
  try {
    // Dismissed this visit: not shown again until the tab is reopened.
    if (sessionStorage.getItem(`gauntlet:folder-banner-dismissed:${kind}`)) return;
  } catch {
    // Shown, then.
  }
  const bar = document.createElement("div");
  bar.dataset.folderWarning = kind;
  bar.setAttribute("role", "alert");
  bar.style.cssText =
    "position:fixed;left:12px;bottom:64px;z-index:2147483647;max-width:440px;padding:10px 36px 10px 12px;" +
    "background:#3a2a10;color:#f6e3b4;border:1px solid #f2c94c;border-radius:8px;font:14px/1.4 system-ui,sans-serif;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.4)";
  const message = document.createElement("div");
  message.textContent = FOLDER_TEXT[kind];
  const actions = document.createElement("div");
  actions.style.cssText = "margin-top:8px;display:flex;gap:12px;align-items:center";
  const buttonStyle =
    "background:#f2c94c;color:#2a1d05;border:0;border-radius:6px;padding:4px 10px;font:600 13px system-ui,sans-serif;cursor:pointer";
  if (kind === "needs-permission") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Reconnect folder";
    button.style.cssText = buttonStyle;
    button.onclick = async () => {
      if (await reconnectFolder()) bar.remove();
    };
    actions.append(button);
  } else {
    const link = document.createElement("a");
    link.href = "/backup/";
    link.target = "_blank";
    link.textContent = kind === "none" ? "Choose a folder" : "Open the backup page";
    link.style.cssText = `${buttonStyle};text-decoration:none`;
    actions.append(link);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss");
  close.style.cssText = "position:absolute;top:4px;right:6px;background:none;border:0;color:inherit;font-size:18px;cursor:pointer";
  close.onclick = () => {
    try {
      sessionStorage.setItem(`gauntlet:folder-banner-dismissed:${kind}`, "1");
    } catch {
      // Dismissed for now only.
    }
    bar.remove();
  };
  bar.append(message, actions, close);
  document.body.append(bar);
}
