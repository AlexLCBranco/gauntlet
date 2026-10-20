// Boardkit's list of boards (`boardkit:registry`), for the toolbar's Board
// picker. Pure reading; Boardkit itself owns the record.

import { useSyncExternalStore } from "react";

export const REGISTRY_KEY = "boardkit:registry";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The boards Boardkit lists, in its order. */
export function registryBoards(raw: string | null): { id: string; name: string }[] {
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    return [];
  }
  const boards = isObj(data) ? data.boards : null;
  return Array.isArray(boards)
    ? boards
        .filter((b): b is { id: string; name?: unknown } => isObj(b) && typeof b.id === "string")
        .map((b) => ({ id: b.id, name: typeof b.name === "string" && b.name.trim() ? b.name : "Untitled" }))
    : [];
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(REGISTRY_KEY);
  } catch {
    return null;
  }
}

/** This page changed Boardkit's board list itself (a new board, a rename):
    the browser sends no `storage` event for that, so readers are told here. */
const CHANGED = "gauntlet:registry-changed";
export const registryChanged = () => window.dispatchEvent(new Event(CHANGED));

/** Boardkit's board list as saved, kept current (another tab's saves, this
    page's own, and on focus). */
export function useRegistry(): string | null {
  return useSyncExternalStore((changed) => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === REGISTRY_KEY || e.key === null) changed();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", changed);
    window.addEventListener(CHANGED, changed);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", changed);
      window.removeEventListener(CHANGED, changed);
    };
  }, readRaw);
}
