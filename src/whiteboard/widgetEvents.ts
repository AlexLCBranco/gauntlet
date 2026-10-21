import type { DOMAttributes, SyntheticEvent } from "react";
import type { Editor } from "tldraw";

/**
 * Boardkit and Linkkit draw their menus, dialogs and panels at the page's
 * top level (React portals). React still sends their events up through the
 * widget, and from there into tldraw's canvas: a press in a menu then made
 * tldraw take the pointer (the item never got its click) and end editing,
 * as for a press outside the widget. Those events are marked handled here,
 * so tldraw's canvas skips them. Not stopped: React's stopPropagation also
 * stops the page's own listeners (Escape no longer closed Boardkit's
 * customise panel, a dragged card's lifted copy, a portal too, no longer
 * dropped).
 */
const PORTAL_EVENTS = ["onPointerDown", "onPointerUp", "onPointerCancel", "onClick", "onTouchStart", "onTouchEnd"] as const;

export function portalEventsHandled(editor: Editor): DOMAttributes<HTMLDivElement> {
  const mark = (e: SyntheticEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.target as Node)) editor.markEventAsHandled(e);
  };
  return Object.fromEntries(PORTAL_EVENTS.map((name) => [name, mark]));
}
