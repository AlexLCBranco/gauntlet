// Which Linkkit map is linked to which Boardkit board, for board widgets'
// "List | Map | Both" switch. Linkkit owns the records; reading never
// writes.

import { useSyncExternalStore } from "react";

import { linkedMaps, onKeyChanged } from "./linkkit";

/** Board id -> its linked map's id, as last read; `null`: to read again. */
let cached: { raw: string; links: Readonly<Record<string, string>> } | null = null;
const readers = new Set<() => void>();

function read(): Readonly<Record<string, string>> {
  if (cached) return cached.links;
  const links = linkedMaps();
  cached = { raw: JSON.stringify(links), links };
  return links;
}

/** A change to a map or the map list may link, unlink or delete one. */
function changed(key: string) {
  if (key !== "*" && !key.startsWith("linkkit:")) return;
  const before = cached;
  cached = null;
  read();
  if (before && cached && before.raw === (cached as { raw: string }).raw) {
    cached = before;
    return;
  }
  for (const reader of readers) reader();
}

let following = false;
function follow() {
  if (following) return;
  following = true;
  onKeyChanged(changed);
}

/** The id of the Linkkit map linked to board `boardId` (not one in
    Linkkit's trash), kept current; `null`: none. */
export function useLinkedMap(boardId: string): string | null {
  const links = useSyncExternalStore((onChange) => {
    follow();
    readers.add(onChange);
    return () => readers.delete(onChange);
  }, read);
  return links[boardId] ?? null;
}

/** The same, read once (outside React). */
export const linkedMapNow = (boardId: string): string | null => read()[boardId] ?? null;

/** Every board with a linked map: board id -> map id, kept current. */
export function useLinkedMaps(): Readonly<Record<string, string>> {
  return useSyncExternalStore((onChange) => {
    follow();
    readers.add(onChange);
    return () => readers.delete(onChange);
  }, read);
}
