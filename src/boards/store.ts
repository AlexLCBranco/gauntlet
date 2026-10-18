// The boards' live state: Boardkit's own records in localStorage (same
// origin as /boardkit), kept current from other tabs and frames by the
// `storage` event, and from this tab by `notify`. Edits read the newest
// record, change it and write it back with `rev` + 1 (record.ts), so
// Boardkit and Linkkit merge them in as they do each other's.
//
// Undo: each board keeps its own stack of the edits made on the
// whiteboard (Ctrl+Z while the board is being edited). An undo applies the
// opposite change to whatever is stored then, so it never puts back
// something Boardkit changed meanwhile; one that no longer applies (the
// card was deleted in Boardkit) is dropped.

import { useSyncExternalStore } from "react";

import { apply, boardKey, readBoard, registryBoards, REGISTRY_KEY, writeBoard, type Change, type Read } from "./record";

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

function notify(key: string) {
  for (const l of listeners.get(key) ?? []) l();
}

function subscribeKey(key: string, l: Listener) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(l);
  return () => void set.delete(l);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === null) for (const key of listeners.keys()) notify(key);
    else notify(e.key);
  });
}

const getRaw = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// Snapshots are cached by the stored text, so React sees the same object
// until the record really changes.
const cache = new Map<string, { raw: string | null; read: Read }>();
function snapshot(id: string): Read {
  const key = boardKey(id);
  const raw = getRaw(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.read;
  const read = readBoard(raw);
  cache.set(key, { raw, read });
  return read;
}

/** The board as stored now, kept current. */
export function useBoard(id: string): Read {
  return useSyncExternalStore(
    (l) => subscribeKey(boardKey(id), l),
    () => snapshot(id),
  );
}

let registryCache: { raw: string | null; names: Map<string, string> } | null = null;
function registryNames() {
  const raw = getRaw(REGISTRY_KEY);
  if (!registryCache || registryCache.raw !== raw) registryCache = { raw, names: new Map(registryBoards(raw).map((b) => [b.id, b.name])) };
  return registryCache.names;
}

/** A board's name in Boardkit's list, kept current. */
export function useBoardName(id: string): string | undefined {
  return useSyncExternalStore(
    (l) => subscribeKey(REGISTRY_KEY, l),
    () => registryNames().get(id),
  );
}

/** Every board Boardkit lists, kept current. */
export function useRegistry() {
  return useSyncExternalStore(
    (l) => subscribeKey(REGISTRY_KEY, l),
    () => getRaw(REGISTRY_KEY),
  );
}

const undoStacks = new Map<string, Change[]>();
const redoStacks = new Map<string, Change[]>();
const stack = (m: Map<string, Change[]>, id: string) => {
  let s = m.get(id);
  if (!s) m.set(id, (s = []));
  return s;
};

export type EditResult = "ok" | "unchanged" | "failed";

/** Applies `change` to the stored board and writes it. "unchanged" when it
    doesn't apply (the card is gone, the list is full, nothing differs);
    "failed" when storage refused the write. */
function write(id: string, change: Change): { result: EditResult; undo?: Change } {
  const key = boardKey(id);
  const read = readBoard(getRaw(key));
  if (read.status !== "ok") return { result: "unchanged" };
  const done = apply(read.board, change);
  if (!done) return { result: "unchanged" };
  try {
    localStorage.setItem(key, writeBoard(read.record, done.board, read.rev));
  } catch (err) {
    console.error("Gauntlet: couldn't save the board", err);
    return { result: "failed" };
  }
  notify(key);
  return { result: "ok", undo: done.undo };
}

export function edit(id: string, change: Change): EditResult {
  const { result, undo } = write(id, change);
  if (undo) {
    stack(undoStacks, id).push(undo);
    redoStacks.delete(id);
  }
  return result;
}

function step(id: string, from: Map<string, Change[]>, to: Map<string, Change[]>): EditResult {
  const change = stack(from, id).pop();
  if (!change) return "unchanged";
  const { result, undo } = write(id, change);
  if (undo) stack(to, id).push(undo);
  return result;
}

export const undo = (id: string) => step(id, undoStacks, redoStacks);
export const redo = (id: string) => step(id, redoStacks, undoStacks);

/** For the unit tests. */
export function resetHistory() {
  undoStacks.clear();
  redoStacks.clear();
}
