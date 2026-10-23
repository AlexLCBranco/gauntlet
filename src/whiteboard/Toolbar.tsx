import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { TldrawUiIcon, useEditor, useIsToolSelected, useTools, useTranslation, useValue, type TLUiToolItem } from "tldraw";

import { dotsIcon, resetIcon, TOOL_ICONS } from "./toolbarIcons";
import { BAR_SIZES, barWidth, DEFAULT_LAYOUT, fitBar, FIXED_ON_BAR, KEYS, LABELS, moveTool, SEPARATOR, tooltip, type BarSizes, type Place } from "./toolbarLayout";
import { setToolbarLayout, toolbarLayout } from "./toolbarStore";
import { MARKUP_TOOL, markupKind } from "../markup/markup";

/** Lit: the tool is on, or (Markup drawing arrows or lines) it's the kind
    Markup draws now. */
function useLit(item: TLUiToolItem) {
  const editor = useEditor();
  const selected = useIsToolSelected(item);
  const markupDraws = useValue("markup draws", () => (editor.getCurrentToolId() === MARKUP_TOOL ? markupKind.get() : null), [editor]);
  return selected || markupDraws === item.id;
}
import "./toolbar.css";

/** A tool's name (toolbarLayout.ts), else tldraw's own label. */
function useLabel() {
  const msg = useTranslation();
  return (item: TLUiToolItem) => {
    const l = item.label as unknown;
    return LABELS[item.id] ?? msg((typeof l === "string" ? l : (l as Record<string, string>).default) as never);
  };
}

/** Excalidraw's icon for the tool (toolbarIcons.tsx), else tldraw's. */
function Icon({ item, label }: { item: TLUiToolItem; label: string }) {
  return TOOL_ICONS[item.id] ?? <TldrawUiIcon icon={item.icon} label={label} small />;
}

/** What a button needs from the toolbar's drag (useToolDrag). */
interface Dragging {
  /** Starts watching a press: a move past a few pixels makes it a drag. */
  onPointerDown: (e: ReactPointerEvent, id: string) => void;
  /** True once, right after a drag: its click must not pick the tool. */
  swallowClick: () => boolean;
  /** The tool being dragged, if any. */
  id: string | null;
}

/** A button on the bar, as Excalidraw's ToolIcon: the icon, and the key
    that picks it in the bottom-right corner. */
function ToolButton({ item, drag }: { item: TLUiToolItem; drag: Dragging }) {
  const selected = useLit(item);
  const label = useLabel()(item);
  const hint = KEYS[item.id]?.hint;
  return (
    <button
      type="button"
      className="gk-tool"
      data-testid={`tools.${item.id}`}
      data-value={item.id}
      data-dragging={drag.id === item.id || undefined}
      aria-label={label}
      aria-pressed={selected}
      aria-keyshortcuts={hint}
      title={tooltip(item.id)}
      onPointerDown={(e) => drag.onPointerDown(e, item.id)}
      onClick={() => drag.swallowClick() || item.onSelect("toolbar")}
    >
      <span className="gk-tool__icon">
        <Icon item={item} label={label} />
      </span>
      {hint && <span className="gk-tool__kbd">{hint}</span>}
    </button>
  );
}

/** The ⋮ "More tools" menu's entry for a tool, as Excalidraw's dropdown
    item: icon, name, its key on the right. */
function MoreItem({ item, drag, onDone }: { item: TLUiToolItem; drag: Dragging; onDone: () => void }) {
  const selected = useLit(item);
  const label = useLabel()(item);
  const hint = KEYS[item.id]?.hint;
  return (
    <button
      type="button"
      role="menuitem"
      className="gk-more-item"
      data-testid={`tools.more.${item.id}`}
      data-value={item.id}
      data-dragging={drag.id === item.id || undefined}
      aria-pressed={selected}
      aria-keyshortcuts={hint}
      title={tooltip(item.id)}
      onPointerDown={(e) => drag.onPointerDown(e, item.id)}
      onClick={() => {
        if (drag.swallowClick()) return;
        onDone();
        item.onSelect("toolbar");
      }}
    >
      <span className="gk-more-item__icon">
        <Icon item={item} label={label} />
      </span>
      <span className="gk-more-item__text">{label}</span>
      {hint && <span className="gk-more-item__shortcut">{hint}</span>}
    </button>
  );
}

/** Where a drop would go, and the line that shows it (window coordinates). */
interface Target {
  to: Place;
  index: number;
  mark: { left: number; top: number; width: number; height: number };
}

/** Pixels a press must move before it's a drag (below: a click). */
const DRAG_START = 4;

/**
 * Dragging tools between the bar and the ⋮ menu (pin, unpin), and within
 * each (reorder): the press is watched on the window, so the menu, which
 * only closes on a press outside the toolbar, stays open the whole drag.
 * Over ⋮ the menu opens. Select and the separator stay on the bar.
 * Escape, or a drop anywhere else, changes nothing.
 */
function useToolDrag(
  bar: React.RefObject<HTMLDivElement | null>,
  menu: React.RefObject<HTMLDivElement | null>,
  openMenu: () => void,
  /** Whether `id`, not on the bar now, would fit on it. */
  fits: (id: string) => boolean,
  /** A drop on the bar was refused: no room. */
  onFull: () => void,
) {
  const [state, setState] = useState<{ id: string; x: number; y: number; target: Target | null } | null>(null);
  const swallow = useRef(false);
  /** A drag is on (the menu's Escape leaves it to the drag). */
  const active = useRef(false);

  const targetAt = (id: string, x: number, y: number): Target | null => {
    const inside = (el: Element | null, slack: number) => {
      const r = el?.getBoundingClientRect();
      return r && x >= r.left - slack && x <= r.right + slack && y >= r.top - slack && y <= r.bottom + slack ? r : null;
    };
    // The list's own entries (the bar's buttons and separator, the menu's
    // slots), not the dragged one.
    const items = (root: HTMLElement | null) =>
      [...((root?.children ?? []) as HTMLCollectionOf<HTMLElement>)].filter((el) => el.dataset.value && el.dataset.value !== id);
    // ⋮ first (it sits inside the bar's box): over it, the menu opens and
    // the tool would go last in it; Select and the separator can't.
    const moreButton = inside(document.querySelector('[data-testid="tools.more-button"]'), 0);
    if (moreButton) {
      if (FIXED_ON_BAR.has(id)) return null;
      openMenu();
      return { to: "more", index: Infinity, mark: { left: moreButton.right + 1, top: moreButton.top + 6, width: 2, height: moreButton.height - 12 } };
    }
    const barBox = inside(bar.current, 12);
    if (barBox) {
      // A full bar takes no more (owner, 2026-10-22: it never overflows).
      if (!fits(id)) {
        onFull();
        return null;
      }
      const others = items(bar.current);
      const index = others.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2 < x;
      }).length;
      const before = others[index - 1]?.getBoundingClientRect();
      const after = others[index]?.getBoundingClientRect();
      const left = before && after ? (before.right + after.left) / 2 : before ? before.right + 2 : after ? after.left - 2 : barBox.left + 4;
      return { to: "bar", index, mark: { left: left - 1, top: barBox.top + 6, width: 2, height: barBox.height - 12 } };
    }
    if (FIXED_ON_BAR.has(id)) return null;
    const menuBox = inside(menu.current, 8);
    if (menuBox) {
      const others = items(menu.current);
      const index = others.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 < y;
      }).length;
      const before = others[index - 1]?.getBoundingClientRect();
      const after = others[index]?.getBoundingClientRect();
      const top = before && after ? (before.bottom + after.top) / 2 : before ? before.bottom + 1 : after ? after.top - 1 : menuBox.top + 8;
      return { to: "more", index, mark: { left: menuBox.left + 8, top: top - 1, width: menuBox.width - 16, height: 2 } };
    }
    return null;
  };

  const onPointerDown = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0 || id === SEPARATOR) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let started = false;
    let target: Target | null = null;
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_START) return;
      started = true;
      active.current = true;
      ev.preventDefault();
      target = targetAt(id, ev.clientX, ev.clientY);
      setState({ id, x: ev.clientX, y: ev.clientY, target });
    };
    const end = (drop: boolean) => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("keydown", key, true);
      if (!started) return;
      active.current = false;
      // The click that follows this release isn't a tool pick.
      swallow.current = true;
      setTimeout(() => (swallow.current = false), 0);
      if (drop && target) setToolbarLayout(moveTool(toolbarLayout.get(), id, target.to, target.index));
      setState(null);
    };
    const up = () => end(true);
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !started) return;
      ev.stopPropagation();
      end(false);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("keydown", key, true);
  };

  const swallowClick = () => {
    const was = swallow.current;
    swallow.current = false;
    return was;
  };
  return { state, active, drag: { onPointerDown, swallowClick, id: state?.id ?? null } as Dragging };
}

/** The room the bar has at this window width: the window, less the main
    menu's corner on each side (the bar is centred), and the bar's
    measures as drawn (a button is 38 px on screens past 1920 px). */
function useBarRoom(moreButton: React.RefObject<HTMLButtonElement | null>): { room: number; sizes: BarSizes } {
  const measure = () => {
    const menuRight = document.querySelector('[data-testid="main-menu.button"]')?.getBoundingClientRect().right ?? 40;
    const button = moreButton.current?.getBoundingClientRect().width || BAR_SIZES.button;
    return { room: window.innerWidth - 2 * (menuRight + 8), sizes: { ...BAR_SIZES, button } };
  };
  const [state, setState] = useState(measure);
  useEffect(() => {
    const on = () => setState(measure());
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return state;
}

/**
 * The toolbar along the top, centred, as in Excalidraw: the owner's
 * arrangement of the tools (toolbarLayout.ts, toolbarStore.ts), at every
 * window size (our own row, not tldraw's overflowing one), then the ⋮
 * "More tools" button and its menu. Tools are dragged between the two
 * (useToolDrag). Looks: toolbar.css (Excalidraw's own values).
 */
export function Toolbar() {
  const editor = useEditor();
  const tools = useTools();
  const layout = useValue(toolbarLayout);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const current = useValue("current tool", () => editor.getCurrentToolId(), [editor]);
  // Never wider than the window allows: pinned tools that don't fit now
  // wait in the menu (fitBar), and a pin that wouldn't fit is refused.
  const { room, sizes } = useBarRoom(moreButton);
  const { shown, spilled } = fitBar(layout.bar, room, sizes);
  const inMenu = [...spilled, ...layout.more];
  const [full, setFull] = useState(false);
  const fullTimer = useRef(0);
  const onFull = () => {
    setFull(true);
    clearTimeout(fullTimer.current);
    fullTimer.current = window.setTimeout(() => setFull(false), 2500);
  };
  const fits = (id: string) => shown.includes(id) || barWidth([...shown, id], sizes) <= room;
  const { state, active, drag } = useToolDrag(bar, menu, () => setOpen(true), fits, onFull);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape mid-drag only ends the drag.
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !active.current && setOpen(false);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open, active]);

  return (
    <div className="gauntlet-top-toolbar" ref={root} onPointerDown={(e) => e.stopPropagation()} data-dragging={state ? "" : undefined}>
      <div className="gk-toolbar" role="toolbar" data-testid="toolbar" ref={bar}>
        {shown.map((id) =>
          id === SEPARATOR ? (
            <div key={SEPARATOR} className="gk-toolbar-sep" role="separator" data-value={SEPARATOR} />
          ) : (
            tools[id] && <ToolButton key={id} item={tools[id]} drag={drag} />
          ),
        )}
        <button
          type="button"
          className="gk-more-button"
          ref={moreButton}
          data-testid="tools.more-button"
          aria-label="More tools"
          title="More tools"
          aria-expanded={open}
          // Lit while a tool from the menu is on.
          aria-pressed={inMenu.includes(current)}
          onClick={() => setOpen((o) => !o)}
        >
          {dotsIcon}
        </button>
      </div>
      {open && (
        <div className="gk-more" role="menu" data-testid="tools.more" ref={menu}>
          {inMenu.map((id) =>
            tools[id] ? (
              // A wrapper takes the press, so even a greyed-out entry drags.
              <div key={id} className="gk-more-slot" data-value={id} onPointerDown={(e) => drag.onPointerDown(e, id)}>
                <MoreItem item={tools[id]} drag={{ ...drag, onPointerDown: () => {} }} onDone={() => setOpen(false)} />
              </div>
            ) : null,
          )}
          {inMenu.length === 0 && <div className="gk-more-empty">Drag tools here to unpin them</div>}
          <div className="gk-more-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="gk-more-item"
            data-testid="tools.more.reset"
            onClick={() => {
              setToolbarLayout(DEFAULT_LAYOUT);
              setOpen(false);
            }}
          >
            <span className="gk-more-item__icon">{resetIcon}</span>
            <span className="gk-more-item__text">Reset toolbar to default</span>
          </button>
        </div>
      )}
      {full && (
        <div className="gk-toolbar-note" role="status" data-testid="toolbar-full">
          No room on the bar at this window width
        </div>
      )}
      {state &&
        // On the page's body: the toolbar (centred with a transform) and
        // tldraw's layout (contain: strict) would make position: fixed
        // relative to themselves, and the icon would show far from the
        // pointer (owner's bug, 2026-10-22).
        createPortal(
          <div className="gk-drag-layer">
            <div className="gk-drag-ghost" style={{ left: state.x, top: state.y }} data-testid="toolbar-drag-ghost">
              {TOOL_ICONS[state.id]}
            </div>
            {state.target && <div className="gk-drop-mark" style={state.target.mark} data-testid="toolbar-drop-mark" />}
          </div>,
          document.body,
        )}
    </div>
  );
}
