/**
 * Backups of the owner's data on this site (owner, 2026-10-19: nothing goes
 * live before the real Boardkit and Linkkit data has a backup the owner can
 * restore). Pure parts: what a backup holds, which to keep, what a restore
 * writes, the file format. The browser side is in `store.ts`.
 *
 * A backup holds every localStorage key of the apps on this site
 * (`boardkit:`, `linkkit:`, `gauntlet:`; not the backups' own), and every
 * entry of Boardkit's and Linkkit's IndexedDB stores (card images, the
 * backup-folder link).
 */

/** The apps' localStorage keys start with one of these. */
export const PREFIXES = ["boardkit:", "linkkit:", "gauntlet:"] as const;
/** The backups' own keys: never backed up or restored. */
export const OWN_PREFIX = "gauntlet:backup";
/** The apps' IndexedDB databases; each has one object store, `kv`. */
export const APP_DBS = ["boardkit", "linkkit"] as const;
export type AppDb = (typeof APP_DBS)[number];

export const isAppKey = (key: string) => PREFIXES.some((p) => key.startsWith(p)) && !key.startsWith(OWN_PREFIX);

export type Reason = "auto" | "manual" | "before-restore" | "file";

export interface Snapshot {
  readonly id: string;
  /** When it was taken (ms). */
  readonly at: number;
  readonly reason: Reason;
  /** Tells two backups with the same data apart from different ones. */
  readonly fingerprint: string;
  readonly local: Readonly<Record<string, string>>;
  /** Each database's entries, as [key, value] (values as stored: strings, Blobs, handles). */
  readonly idb: Readonly<Record<AppDb, readonly (readonly [IDBValidKey, unknown])[]>>;
}

/** FNV-1a, 32 bit, as hex: enough to tell "changed" from "the same". */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** A short description of a stored value, for the fingerprint. */
function describe(value: unknown): string {
  if (typeof Blob !== "undefined" && value instanceof Blob) return `blob:${value.type}:${value.size}`;
  if (value && typeof value === "object" && "kind" in value && "name" in value) return `handle:${String(value.name)}`;
  try {
    return `json:${JSON.stringify(value)}`;
  } catch {
    return "other";
  }
}

export function fingerprintOf(local: Snapshot["local"], idb: Snapshot["idb"]): string {
  const keys = Object.keys(local).sort();
  const parts = keys.map((k) => `${k}=${local[k]}`);
  for (const db of APP_DBS) for (const [k, v] of idb[db] ?? []) parts.push(`${db}/${String(k)}=${describe(v)}`);
  const text = parts.join("\n");
  return `${hash(text)}-${text.length}`;
}

/** What the owner sees in the list: board and map names, from the apps' registries. */
export function summaryOf(local: Snapshot["local"]): { boards: string[]; maps: string[] } {
  const names = (key: string, field: "boards" | "maps") => {
    try {
      const reg = JSON.parse(local[key] ?? "null") as Record<string, { name?: string }[]> | null;
      return (reg?.[field] ?? []).map((b) => b.name ?? "Untitled");
    } catch {
      return [];
    }
  };
  return { boards: names("boardkit:registry", "boards"), maps: names("linkkit:registry", "maps") };
}

const DAY = 24 * 60 * 60 * 1000;
/** How many of the newest backups are always kept. */
export const KEEP_RECENT = 30;
/** Beyond those, the newest backup of each day is kept this long. */
export const KEEP_DAILY_DAYS = 90;

/**
 * The backups to keep: the newest `KEEP_RECENT`, plus the newest of each
 * (local) day for `KEEP_DAILY_DAYS` days. Returns their ids.
 */
export function toKeep(snapshots: readonly Pick<Snapshot, "id" | "at">[], now: number): Set<string> {
  const newestFirst = [...snapshots].sort((a, b) => b.at - a.at);
  const keep = new Set(newestFirst.slice(0, KEEP_RECENT).map((s) => s.id));
  const days = new Set<string>();
  for (const s of newestFirst) {
    if (now - s.at > KEEP_DAILY_DAYS * DAY) break;
    const d = new Date(s.at);
    const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (days.has(day)) continue;
    days.add(day);
    keep.add(s.id);
  }
  return keep;
}

const revOf = (text: string | undefined): number | null => {
  if (text === undefined) return null;
  try {
    const v = JSON.parse(text) as { rev?: unknown };
    return v && typeof v === "object" && typeof v.rev === "number" ? v.rev : null;
  } catch {
    return null;
  }
};

/**
 * What a restore writes to localStorage: every app key as in the backup,
 * and the app keys the backup didn't have removed. A record with a `rev`
 * (Boardkit's boards, Linkkit's maps) gets a `rev` above the current one,
 * so a Boardkit or Linkkit tab still open takes the restored record as the
 * newest instead of saving its own over it.
 */
export function restorePlan(current: Readonly<Record<string, string>>, backup: Snapshot["local"]): { set: Record<string, string>; remove: string[] } {
  const set: Record<string, string> = {};
  for (const [key, text] of Object.entries(backup)) {
    if (!isAppKey(key)) continue;
    const now = revOf(current[key]);
    const then = revOf(text);
    if (now !== null && then !== null) {
      const value = JSON.parse(text) as { rev: number };
      set[key] = JSON.stringify({ ...value, rev: Math.max(now, then) + 1 });
    } else {
      set[key] = text;
    }
  }
  const remove = Object.keys(current).filter((k) => isAppKey(k) && !(k in backup));
  return { set, remove };
}

/** A backup as a file the owner can keep anywhere (JSON; images inline). */
export interface BackupFile {
  readonly format: "gauntlet-backup";
  readonly version: 1;
  readonly at: number;
  readonly local: Record<string, string>;
  readonly idb: Record<AppDb, [IDBValidKey, unknown][]>;
}

type Encoded = { $blob: string; type: string };

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** The file for a backup. Folder links (browser handles) can't go in a file and are left out. */
export async function toFile(s: Snapshot): Promise<BackupFile> {
  const idb = {} as Record<AppDb, [IDBValidKey, unknown][]>;
  for (const db of APP_DBS) {
    idb[db] = [];
    for (const [k, v] of s.idb[db] ?? []) {
      if (typeof Blob !== "undefined" && v instanceof Blob) idb[db].push([k, { $blob: await blobToBase64(v), type: v.type } satisfies Encoded]);
      else if (describe(v).startsWith("json:")) idb[db].push([k, v]);
    }
  }
  return { format: "gauntlet-backup", version: 1, at: s.at, local: { ...s.local }, idb };
}

/** A backup read back from a file; throws a plain-words error if it isn't one. */
export function fromFile(text: string, at: number, id: string): Snapshot {
  let file: BackupFile;
  try {
    file = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error("That file isn't a gauntlet backup (it isn't readable).");
  }
  if (file?.format !== "gauntlet-backup" || typeof file.local !== "object") throw new Error("That file isn't a gauntlet backup.");
  if (file.version !== 1) throw new Error("That backup was made by a newer version of this page. Reload the page and try again.");
  const local: Record<string, string> = {};
  for (const [k, v] of Object.entries(file.local)) if (isAppKey(k) && typeof v === "string") local[k] = v;
  const idb = {} as Record<AppDb, [IDBValidKey, unknown][]>;
  for (const db of APP_DBS) {
    idb[db] = (file.idb?.[db] ?? []).map(([k, v]) => {
      const e = v as Encoded | null;
      return [k, e && typeof e === "object" && typeof e.$blob === "string" ? base64ToBlob(e.$blob, e.type) : v];
    });
  }
  return { id, at, reason: "file", fingerprint: fingerprintOf(local, idb), local, idb };
}
