import { useSyncExternalStore } from "react";

// Where the style panel sits (owner, Edges round item 5): left or right,
// open or collapsed to a small tab at that screen edge. Only the owner
// changes it (no jumping sides by itself); kept in this browser
// (localStorage, so backups carry it) and followed by other open tabs.

export type Side = "left" | "right";
export interface PanelPlace {
  readonly side: Side;
  readonly collapsed: boolean;
}
export const PANEL_KEY = "gauntlet:style-panel";
const DEFAULT: PanelPlace = { side: "left", collapsed: false };

export function readPlace(raw: string | null): PanelPlace {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<PanelPlace> | null;
    return { side: v?.side === "right" ? "right" : "left", collapsed: v?.collapsed === true };
  } catch {
    return DEFAULT;
  }
}

let current: PanelPlace | null = null;
const subs = new Set<() => void>();
const get = () => {
  if (current) return current;
  try {
    current = readPlace(localStorage.getItem(PANEL_KEY));
  } catch {
    current = DEFAULT;
  }
  return current;
};

export function setPlace(next: Partial<PanelPlace>): void {
  current = { ...get(), ...next };
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(current));
  } catch {
    // Not remembered, still applied.
  }
  subs.forEach((f) => f());
}

let following = false;
function follow() {
  if (following || typeof window === "undefined") return;
  following = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== PANEL_KEY) return;
    current = readPlace(e.newValue);
    subs.forEach((f) => f());
  });
}

export function usePanelPlace(): PanelPlace {
  return useSyncExternalStore((fn) => {
    follow();
    subs.add(fn);
    return () => subs.delete(fn);
  }, get);
}
