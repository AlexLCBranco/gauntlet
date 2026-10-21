// Linkkit's list of maps, for the toolbar's Map picker and the widgets'
// name labels. Linkkit itself owns the records; reading never writes.

import { useSyncExternalStore } from "react";

import { onKeyChanged, whiteboardMaps } from "./linkkit";

type Listed = readonly { readonly id: string; readonly name: string }[];

/** The list as last read; `null`: to read again. */
let cached: { raw: string; list: Listed } | null = null;
const readers = new Set<() => void>();

/** A change that may rename or list a map: Linkkit's list or a map, its
    trash, or Boardkit's list (a linked map shows its board's name). */
const touchesList = (key: string) => key === "*" || key.startsWith("linkkit:") || key === "boardkit:registry";

function changed() {
  const before = cached;
  cached = null;
  read();
  // Nothing in it changed: the same object, nobody told.
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
  onKeyChanged((key) => touchesList(key) && changed());
  window.addEventListener("focus", changed);
}

/** The list, the same object while nothing in it changed (for React). */
function read(): Listed {
  if (cached) return cached.list;
  const list = whiteboardMaps();
  const raw = JSON.stringify(list);
  cached = { raw, list };
  return list;
}

/** Linkkit's maps, in its order, as its map menu lists them, kept current
    (another tab's saves, this page's own, and on focus). */
export function useMapList(): Listed {
  return useSyncExternalStore((onChange) => {
    follow();
    readers.add(onChange);
    return () => readers.delete(onChange);
  }, read);
}

/** This page changed the list itself, outside Linkkit's writes. */
export const mapListChanged = changed;
