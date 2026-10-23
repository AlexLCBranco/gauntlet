import type { Editor } from "tldraw";

/**
 * Opening a card's, list's or box's link from a board or map that is only
 * shown, not edited (owner, 2026-10-23). Such a widget ignores the pointer
 * (it is moved and selected as a whole), so its link icons and its links in
 * names (Boardkit's and Linkkit's, marked `data-link-open`) never get the
 * press. Here the press is found by where they are drawn: a press on one
 * opens its link in a new tab (`noopener`), and nothing else happens (no
 * select, no drag). Anywhere else on the widget, a press selects it as
 * before. Links that do get the press (the whiteboard's own icons, a board
 * being edited) open by themselves.
 *
 * Also notes where the last right-click was, for the right-click menu
 * (LinkMenuItems.tsx): which card, list or box it was over.
 */

let lastContextMenu: { readonly x: number; readonly y: number } | null = null;

/** Where the last right-click on the page was (viewport pixels). */
export const contextMenuPoint = () => lastContextMenu;

const shown = (el: HTMLElement) => {
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && Number(style.opacity) > 0.05;
};

/** The `data-link-open` element drawn under (`x`, `y`) inside a widget that
    doesn't take the pointer, if any. */
function inertLinkAt(container: HTMLElement, x: number, y: number): HTMLAnchorElement | null {
  const under = document.elementFromPoint(x, y);
  // It takes the press itself: the browser opens it.
  if (under?.closest("[data-link-open]")) return null;
  for (const el of container.querySelectorAll<HTMLAnchorElement>(".tl-shape a[data-link-open]")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && shown(el)) return el;
  }
  return null;
}

export function linkOpener(editor: Editor): () => void {
  let pending: string | null = null;
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    editor.markEventAsHandled(e);
  };
  const onDown = (e: PointerEvent) => {
    pending = null;
    if (e.button !== 0 || editor.getCurrentToolId() !== "select") return;
    const container = editor.getContainer();
    if (!container.contains(e.target as Node)) return;
    const link = inertLinkAt(container, e.clientX, e.clientY);
    if (!link) return;
    pending = link.href;
    swallow(e);
  };
  const onUp = (e: PointerEvent) => {
    if (pending) swallow(e);
  };
  const onClick = (e: MouseEvent) => {
    if (!pending) return;
    const href = pending;
    pending = null;
    swallow(e);
    window.open(href, "_blank", "noopener,noreferrer");
  };
  const onContextMenu = (e: MouseEvent) => {
    lastContextMenu = { x: e.clientX, y: e.clientY };
  };
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("contextmenu", onContextMenu, true);
  return () => {
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("contextmenu", onContextMenu, true);
  };
}
