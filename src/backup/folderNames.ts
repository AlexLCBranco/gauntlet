// The backup folder's files: their names, and which old ones to delete.
// Pure: the browser side is in `folder.ts`.
//
// Only files this code names are ever deleted: `gauntlet-auto-` + a time,
// `.json`. Anything else in the folder (a backup saved by hand, the owner's
// own files) is never touched.

import { byAge } from "./policy";

export const FOLDER_PREFIX = "gauntlet-auto-";

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** `gauntlet-auto-2026-10-20-221530.json`: local time, to the second, so two
    backups in the same minute don't overwrite each other. */
export function folderFileName(now: Date): string {
  return (
    `${FOLDER_PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`
  );
}

const NAME = /^gauntlet-auto-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/;

/** When a backup file was made (ms), from its name; null for any other file. */
export function folderFileTime(name: string): number | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  // Rejects impossible dates (month 13, day 32), which Date would roll over.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.getTime();
}

/** The backup files to delete: the same rule as the browser's automatic
    backups (newest 30, plus the newest of each day for 90 days). Files that
    aren't backup files are never in the list. */
export function folderDrops(names: readonly string[], now: number): string[] {
  const files = names.flatMap((name) => {
    const at = folderFileTime(name);
    return at === null ? [] : [{ id: name, at }];
  });
  const keep = byAge(files, now);
  return files.filter((f) => !keep.has(f.id)).map((f) => f.id);
}
