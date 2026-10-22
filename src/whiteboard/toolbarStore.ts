import { atom } from "tldraw";

import { DEFAULT_LAYOUT, normalizeLayout, sameLayout, type Layout } from "./toolbarLayout";

/** The toolbar's layout (toolbarLayout.ts), kept in this browser so it
    survives reloads; every localStorage key is in the backups too. */
export const TOOLBAR_KEY = "gauntlet:toolbar";

function read(): Layout {
  try {
    const raw = localStorage.getItem(TOOLBAR_KEY);
    return raw ? normalizeLayout(JSON.parse(raw)) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export const toolbarLayout = atom<Layout>("toolbar layout", read());

/** Shows `next` and stores it; the default is stored as no key at all. */
export function setToolbarLayout(next: Layout) {
  if (sameLayout(next, toolbarLayout.get())) return;
  toolbarLayout.set(next);
  try {
    if (sameLayout(next, DEFAULT_LAYOUT)) localStorage.removeItem(TOOLBAR_KEY);
    else localStorage.setItem(TOOLBAR_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked or full: the layout still holds until a reload.
  }
}

// Another tab rearranged it: this one follows.
window.addEventListener("storage", (e) => {
  if (e.key === TOOLBAR_KEY || e.key === null) toolbarLayout.set(read());
});
