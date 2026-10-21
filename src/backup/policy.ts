// Automatic backups: which to keep, and whether a new one may be saved.
// Pure: the browser side is in `auto.ts`.
//
// Automatic backups live in this browser, next to the data they copy (an
// IndexedDB database of their own). The browser gives the site one storage
// quota, shared with Boardkit's pictures and the whiteboard's pages, so
// backups must never take the room those need: they get a budget (a share
// of the quota), and none is saved when that would leave the site with
// less than a safe margin. Then the owner is warned instead.

import type { BackupFile } from "./format";

export interface Kept {
  readonly id: string;
  /** When it was made (ms). */
  readonly at: number;
  /** Its size in bytes (about: the backup file's characters). */
  readonly size: number;
}

const DAY = 24 * 60 * 60 * 1000;
/** The newest this many are kept (as the budget allows). */
export const KEEP_RECENT = 30;
/** Beyond those, the newest of each day is kept this many days. */
export const KEEP_DAILY_DAYS = 90;
/** Backups together may use at most this share of the site's quota. */
export const BUDGET_SHARE = 0.2;
/** No backup is saved if the site would then use more than this share. */
export const MAX_USE_SHARE = 0.6;
/** The budget when the browser doesn't say what its quota is. */
export const FALLBACK_BUDGET = 50 * 1024 * 1024;

/** The newest `KEEP_RECENT`, plus the newest of each local day for
    `KEEP_DAILY_DAYS` days. */
export function byAge(backups: readonly Pick<Kept, "id" | "at">[], now: number): Set<string> {
  const newestFirst = [...backups].sort((a, b) => b.at - a.at);
  const keep = new Set(newestFirst.slice(0, KEEP_RECENT).map((b) => b.id));
  const days = new Set<string>();
  for (const b of newestFirst) {
    if (now - b.at > KEEP_DAILY_DAYS * DAY) break;
    const d = new Date(b.at);
    const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (days.has(day)) continue;
    days.add(day);
    keep.add(b.id);
  }
  return keep;
}

export type Warning = "too-big" | "storage-full";

export interface Plan {
  /** Save the new backup. */
  readonly save: boolean;
  /** Older backups to delete (to keep by age, and within the budget). */
  readonly drop: readonly string[];
  readonly warning?: Warning;
}

/**
 * What to do with a new backup of `size` bytes, given the ones kept, what
 * the site uses now and its quota (both from `navigator.storage.estimate`,
 * absent when the browser doesn't say). Older backups make room first,
 * oldest first; the new one is never saved at the cost of the margin the
 * apps need.
 */
export function plan(size: number, existing: readonly Kept[], now: number, usage?: number, quota?: number): Plan {
  const known = quota !== undefined && quota > 0;
  const budget = known ? quota * BUDGET_SHARE : FALLBACK_BUDGET;
  const keep = byAge([...existing, { id: "", at: now }], now);
  const drop = existing.filter((b) => !keep.has(b.id)).map((b) => b.id);
  const left = existing.filter((b) => keep.has(b.id)).sort((a, b) => a.at - b.at);
  if (size > budget) return { save: false, drop, warning: "too-big" };
  let total = left.reduce((sum, b) => sum + b.size, 0);
  while (left.length > 0 && total + size > budget) {
    const oldest = left.shift()!;
    drop.push(oldest.id);
    total -= oldest.size;
  }
  if (known && usage !== undefined) {
    const freed = existing.filter((b) => drop.includes(b.id)).reduce((sum, b) => sum + b.size, 0);
    if (usage - freed + size > quota * MAX_USE_SHARE) return { save: false, drop, warning: "storage-full" };
  }
  return { save: true, drop };
}

/** FNV-1a (32 bit, hex) and length: tells "changed" from "the same". */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}-${text.length}`;
}

export const WARNING_TEXT: Record<Warning | "failed", string> = {
  "too-big":
    "Automatic backup skipped: your data is too big to keep a copy inside this browser. Save a backup file instead.",
  "storage-full":
    "Automatic backup skipped: this browser's storage for the site is nearly full, and your boards and maps need that room. Save a backup file instead.",
  failed: "Automatic backup failed: the browser refused to store it (its storage may be full). Save a backup file instead.",
};

/** The data, for telling "changed" from "the same": without the time it
    was taken, with localStorage's keys in order (the browser lists them in
    a different order after a reload), and without tldraw's per-tab session
    records (its `session_state` store: which page each tab was on, its
    camera, stamped with the time on every open). Those change on every
    visit to the whiteboard while nothing of the owner's does, so every
    visit kept a new backup and pushed older ones out. The backup itself
    still holds them. */
export function sameDataText(file: BackupFile): string {
  const local = Object.fromEntries(Object.entries(file.localStorage).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const indexedDB = file.indexedDB.map((db) =>
    db.name.startsWith("TLDRAW_DOCUMENT_") ? { ...db, stores: db.stores.filter((s) => s.name !== "session_state") } : db,
  );
  return JSON.stringify({ ...file, createdAt: "", localStorage: local, indexedDB });
}
