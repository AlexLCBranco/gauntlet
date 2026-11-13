import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { react, type Editor } from "tldraw";

import {
  hoopsjunkieLink,
  teamCalendarUrl,
  teamLinkTarget,
  useSeriesPopup,
  useStreakPopup,
  useTooltip,
  type CalendarData,
  type TeamLinks,
} from "./calendarkit";

// Slate step 3 (speed session Part 4): hovering a Slate widget feels like
// hovering calendarkit's Slate in /calendar, without selecting the widget
// first. The popups are calendarkit's own (its tooltip, streak popup and
// season-series popup hooks, the ones /calendar's CalendarView uses), drawn
// outside the whiteboard's canvas, in one layer on the page itself
// (`popLayer`): fixed to the window, so a widget's box never clips them,
// no item covers them and they keep their reading size however small the
// widget is scaled. The links on the cards (↗, a final score, a team) open
// in a new tab on a click; a press that moves still moves the widget.

let layer: HTMLElement | null = null;
/** The one layer every Slate widget's popups and date bar are drawn in:
    a `.ck-root` (calendarkit's colours and font), above the whiteboard. */
export function popLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  layer = document.createElement("div");
  layer.className = "ck-root ck-slate-widget gs-slate-pops";
  layer.dataset.testid = "slate-popups";
  document.body.appendChild(layer);
  return layer;
}

/** Presses on what is drawn in the layer are its own: React would carry
    them (through the portal) to the whiteboard's canvas, which would start
    a selection under them. */
const own = (e: SyntheticEvent) => e.stopPropagation();
export function InLayer({ children }: { children: ReactNode }) {
  return createPortal(
    <div className="gs-slate-pop-host" onPointerDown={own} onPointerUp={own} onClick={own} onDoubleClick={own} onContextMenu={own}>
      {children}
    </div>,
    popLayer(),
  );
}

/** How far a press may move and still be a click on a link. */
const CLICK_SLOP = 4;

/**
 * The widget's hover and links: spread `handlers` on the widget, give its
 * cards `teamLinks` (TeamLinkContext), render `node`. `date` is the night shown: a team link
 * opens that team's Calendar there.
 */
export function useSlateHover(editor: Editor, data: CalendarData | undefined, date: string) {
  const tooltip = useTooltip();
  const streak = useStreakPopup(data, { gameLink: hoopsjunkieLink });
  const series = useSeriesPopup(data, { gameLink: hoopsjunkieLink });
  const all = [tooltip, streak, series];
  const hideRef = useRef(() => {});
  hideRef.current = () => {
    tooltip.handlers.onMouseLeave();
    streak.handlers.onMouseLeave();
    series.handlers.onMouseLeave();
  };

  // The popups stay with what they point at: a pan or zoom, or a press
  // anywhere but on a popup (moving or scaling the widget), closes them.
  useEffect(() => {
    let first = true;
    const stop = react("slate popups follow the camera", () => {
      editor.getCamera();
      if (!first) hideRef.current();
      first = false;
    });
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Node && layer?.contains(e.target))) hideRef.current();
    };
    window.addEventListener("pointerdown", down, true);
    return () => {
      stop();
      window.removeEventListener("pointerdown", down, true);
    };
  }, [editor]);

  // A link (↗, a final score, a team; on a card or in a popup) opens in a
  // new tab when clicked; the whiteboard keeps the press, so a drag that
  // starts on one still moves the widget.
  const press = useRef<{ x: number; y: number; href: string }>(undefined);
  useEffect(() => {
    const up = (e: PointerEvent) => {
      const p = press.current;
      press.current = undefined;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= CLICK_SLOP) window.open(p.href, "_blank", "noopener");
    };
    window.addEventListener("pointerup", up, true);
    return () => window.removeEventListener("pointerup", up, true);
  }, []);
  const teamLinks = useMemo<TeamLinks>(() => ({ href: (teamId) => teamCalendarUrl(teamId, date) }), [date]);

  const handlers = {
    onMouseOver: (e: SyntheticEvent) => all.forEach((h) => h.handlers.onMouseOver(e)),
    onFocus: (e: SyntheticEvent) => all.forEach((h) => h.handlers.onFocus(e)),
    onMouseLeave: () => hideRef.current(),
    onBlur: tooltip.handlers.onBlur,
    onPointerDownCapture: (e: ReactPointerEvent) => {
      const a = e.button === 0 ? (e.target as Element).closest?.<HTMLAnchorElement>("a[href]") : null;
      if (!a) return;
      const team = teamLinkTarget(a);
      if (team) a.href = teamLinks.href(team.teamId);
      press.current = { x: e.clientX, y: e.clientY, href: a.href };
    },
    // The link was opened on the pointer's release (or the press was a drag)
    onClickCapture: (e: ReactMouseEvent) => {
      if ((e.target as Element).closest?.("a[href]")) e.preventDefault();
    },
  };

  return {
    handlers,
    teamLinks,
    node: (tooltip.node || streak.node || series.node) && (
      <InLayer>
        {tooltip.node}
        {streak.node}
        {series.node}
      </InLayer>
    ),
  };
}
