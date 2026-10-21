// Automatic backups: on opening the home page, the whiteboard or the backup
// page, and every 10 minutes while one stays open, the same backup the
// "Save a backup" button downloads is kept in this browser, if anything
// changed since the newest. Kept in an IndexedDB database of their own
// (`AUTO_DB`), within a storage budget (`policy.ts`). When one can't be
// kept, the page says so (a banner) and the backup page shows it too.
//
// They live in the same browser storage as the data: clearing the
// browser's data for the site deletes them too. So each one is also
// written to the backup folder the owner picked, if any (`folder.ts`).

import { folderState, lastFolderNote, showFolderBanner, writeToFolder } from "./folder";
import { describe, readBackup, summarize, type BackupFile } from "./format";
import { fingerprint, plan, WARNING_TEXT, type Kept, type Warning } from "./policy";
import { AUTO_DB, AUTO_NOTE, makeBackup } from "./storage";

const STORE = "backups";
export const EVERY_MS = 10 * 60 * 1000;
/** Lets the page's apps load (and save their first-visit data) first. */
const FIRST_AFTER_MS = 3000;

export type Reason = "auto" | "before-restore";

export interface AutoBackup extends Kept {
  readonly reason: Reason;
  readonly fingerprint: string;
  /** What it holds, in the owner's words (`describe`). */
  readonly what: string;
  /** The backup file, as JSON (what "Save a backup" downloads). */
  readonly json: string;
}

export type Outcome =
  | { readonly kind: "saved"; readonly backup: AutoBackup }
  | { readonly kind: "unchanged" }
  | { readonly kind: "skipped"; readonly warning: Warning | "failed" };

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException("Not stored", "AbortError"));
    tx.onerror = () => reject(tx.error);
  });

function openAuto(): Promise<IDBDatabase> {
  const request = indexedDB.open(AUTO_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
  return done(request);
}

/** Every automatic backup kept, newest first. */
export async function listAutoBackups(): Promise<AutoBackup[]> {
  const db = await openAuto();
  try {
    const all = (await done(db.transaction(STORE, "readonly").objectStore(STORE).getAll())) as AutoBackup[];
    return all.sort((a, b) => b.at - a.at);
  } finally {
    db.close();
  }
}

/** The backup file an automatic backup holds. */
export function fileOf(backup: AutoBackup): BackupFile | null {
  try {
    return readBackup(JSON.parse(backup.json));
  } catch {
    return null;
  }
}

/** The data, for telling "changed" from "the same": without the time it
    was taken, and with localStorage's keys in order (the browser lists
    them in a different order after a reload). */
const sameData = (file: BackupFile) => {
  const local = Object.fromEntries(Object.entries(file.localStorage).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return JSON.stringify({ ...file, createdAt: "", localStorage: local });
};

async function estimate(): Promise<{ usage?: number; quota?: number }> {
  try {
    return (await navigator.storage?.estimate?.()) ?? {};
  } catch {
    return {};
  }
}

/**
 * Keeps a backup of everything here now, unless nothing changed since the
 * newest ("auto" only) or it doesn't fit (`plan`). Never throws: a backup
 * that can't be kept is an outcome, and the apps' own saves are never
 * touched (they don't share a transaction or a database with this).
 */
export async function keepBackup(reason: Reason = "auto"): Promise<Outcome> {
  let outcome: Outcome;
  try {
    const now = new Date();
    const file = await makeBackup(now);
    const json = JSON.stringify(file);
    const print = fingerprint(sameData(file));
    // Outside the browser first, and whatever happens in it: a browser too
    // full to keep a copy is exactly when the folder's copy matters.
    await writeToFolder(json, print, now, reason === "before-restore");
    const existing = await listAutoBackups();
    if (reason === "auto" && existing[0]?.fingerprint === print) {
      outcome = { kind: "unchanged" };
    } else {
      const { usage, quota } = await estimate();
      const size = json.length;
      const decided = plan(size, existing, now.getTime(), usage, quota);
      const backup: AutoBackup = {
        id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        at: now.getTime(),
        size,
        reason,
        fingerprint: print,
        what: describe(summarize(file)),
        json,
      };
      const db = await openAuto();
      try {
        // Room first, in its own transaction: freed even if the new one then fails.
        if (decided.drop.length > 0) {
          const tx = db.transaction(STORE, "readwrite");
          for (const id of decided.drop) tx.objectStore(STORE).delete(id);
          await finished(tx);
        }
        if (decided.save) {
          // Checked again in the transaction that saves it: another tab (or
          // the page just reloaded) may have kept the same data meanwhile.
          const tx = db.transaction(STORE, "readwrite");
          const store = tx.objectStore(STORE);
          const all = (await done(store.getAll())) as AutoBackup[];
          const newest = all.sort((a, b) => b.at - a.at)[0];
          const same = reason === "auto" && newest?.fingerprint === print;
          if (!same) store.put(backup);
          await finished(tx);
          outcome = same ? { kind: "unchanged" } : { kind: "saved", backup };
        } else {
          outcome = { kind: "skipped", warning: decided.warning ?? "failed" };
        }
      } finally {
        db.close();
      }
    }
  } catch (error) {
    console.error("Gauntlet: the automatic backup could not be kept", error);
    outcome = { kind: "skipped", warning: "failed" };
  }
  noteOutcome(outcome);
  return outcome;
}

export interface Status {
  readonly at: number;
  readonly warning?: Warning | "failed";
}

function noteOutcome(outcome: Outcome) {
  if (outcome.kind === "unchanged") return;
  const status: Status = { at: Date.now(), ...(outcome.kind === "skipped" ? { warning: outcome.warning } : {}) };
  try {
    localStorage.setItem(AUTO_NOTE, JSON.stringify(status));
  } catch {
    // Storage full: the banner still says so on this page.
  }
}

/** The last automatic backup's outcome, as noted (null if none yet). */
export function lastStatus(): Status | null {
  try {
    return JSON.parse(localStorage.getItem(AUTO_NOTE) ?? "null") as Status | null;
  } catch {
    return null;
  }
}

/** A banner on the page (bottom left), with a way to the backup page. */
export function showWarning(text: string): void {
  if (document.querySelector("[data-backup-warning]")) return;
  const bar = document.createElement("div");
  bar.dataset.backupWarning = "";
  bar.setAttribute("role", "alert");
  bar.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:2147483647;max-width:420px;padding:10px 36px 10px 12px;" +
    "background:#3a2a10;color:#f6e3b4;border:1px solid #f2c94c;border-radius:8px;font:14px/1.4 system-ui,sans-serif;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.4)";
  const message = document.createElement("span");
  message.textContent = `${text} `;
  const link = document.createElement("a");
  link.href = "/backup/";
  link.textContent = "Open the backup page";
  link.style.color = "#ffd76a";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss");
  close.style.cssText = "position:absolute;top:4px;right:6px;background:none;border:0;color:inherit;font-size:18px;cursor:pointer";
  close.onclick = () => bar.remove();
  bar.append(message, link, close);
  document.body.append(bar);
}

let started = false;

/** Starts automatic backups on this page. `banners` false: the page shows
    the folder's state itself (the backup page). */
export function startAutoBackup({ banners = true } = {}): void {
  if (started || typeof indexedDB === "undefined") return;
  started = true;
  const run = async () => {
    const outcome = await keepBackup("auto");
    if (outcome.kind === "skipped") showWarning(WARNING_TEXT[outcome.warning]);
    if (!banners) return;
    const state = await folderState();
    if (state !== "ready") showFolderBanner(state);
    else if (lastFolderNote()?.problem === "failed") showFolderBanner("failed");
  };
  setTimeout(() => void run(), FIRST_AFTER_MS);
  setInterval(() => void run(), EVERY_MS);
}
