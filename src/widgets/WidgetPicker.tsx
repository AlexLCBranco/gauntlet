import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { atom, useEditor, useValue, type Editor, type TLUiToolItem } from "tldraw";

import { newBoard, place as placeBoard } from "../boards/AddBoard";
import { registryBoards, useRegistry } from "../boards/registry";
import { newMap, placeMap } from "../maps/AddMap";
import { useMapList } from "../maps/mapList";
import { insertSlate } from "../slate/AddSlate";
import { slateDateLabel, slateToday } from "../slate/today";
import { boardLists } from "./boardLists";
import { recentRank, useWidget, type WidgetKey } from "./recent";
import "./widgets.css";

// Adding any widget in 3 actions or fewer (owner, Edges round item 3a):
// one toolbar button ("Add widget", key E) opens this picker at once for
// every kind: boards (each opens to its lists), single lists, Linkkit maps
// and Slate nights. The search box has the focus; the most recently used
// come first; "+ New …" for each kind at the top. One click places it:
// its top-left corner at the cursor when the picker was opened by its key
// over the page, else in the middle of the view.

/** Open, and where it opened: the page point the cursor was at (by the
    key, over the page) or null (by the button: the middle of the view). */
const openAt = atom<{ corner: { x: number; y: number } | null; screen: { x: number; y: number } | null } | null>("widget picker", null);

/** Whether the pointer's last move was over the page itself (not over a
    toolbar, menu or panel). */
let overPage = false;
/** The pointer's last place on screen (client px), from its own events:
    tldraw takes in pointer moves once a frame, a step behind a quick move. */
let lastClient: { x: number; y: number } | null = null;
export function trackPointerOverPage(editor: Editor): () => void {
  const move = (e: PointerEvent) => {
    // Inside the whiteboard, not on tldraw's UI (toolbar, menus, panels:
    // all under .tlui-layout) nor on a picker or dialog of ours.
    const t = e.target instanceof Element ? e.target : null;
    lastClient = { x: e.clientX, y: e.clientY };
    overPage = !!t && editor.getContainer().contains(t) && !t.closest(".tlui-layout, .gw-picker, .gb-picker, [role='menu'], [role='dialog']");
  };
  window.addEventListener("pointermove", move, true);
  return () => window.removeEventListener("pointermove", move, true);
}

/** The page point under the cursor, if it is over the visible page. */
export function cursorOnPage(editor: Editor): { x: number; y: number } | null {
  if (!overPage) return null;
  if (!lastClient) return null;
  const p = editor.screenToPage(lastClient);
  return editor.getViewportPageBounds().containsPoint(p) ? { x: p.x, y: p.y } : null;
}

export function openWidgetPicker(editor: Editor, byKey: boolean) {
  const corner = byKey ? cursorOnPage(editor) : null;
  openAt.set({ corner, screen: corner && lastClient ? { ...lastClient } : null });
}

const icon = (
  <div>
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="10" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="2.5" y="10" width="5.5" height="5.5" rx="1" />
      <path d="M12.75 10.25v5M10.25 12.75h5" />
    </svg>
  </div>
);

/** The toolbar's "Add widget" button (key E), wired in Whiteboard.tsx. A
    press of the key opens the picker at the cursor; a click on the button,
    under the toolbar. */
export function widgetsToolItem(editor: Editor): TLUiToolItem {
  return {
    id: "widgets",
    label: "tool.widgets" as never,
    icon,
    // By its key the pointer is still on the page: the cursor. By the
    // button it is on the toolbar: the middle of the view.
    onSelect: () => (openAt.get() ? openAt.set(null) : openWidgetPicker(editor, true)),
  };
}

type Entry =
  | { kind: "new"; what: "board" | "map" | "slate"; label: string }
  | { kind: "board"; id: string; label: string; lists: { id: string; title: string }[] }
  | { kind: "list"; board: string; id: string; label: string; boardName: string }
  | { kind: "map"; id: string; label: string }
  | { kind: "slate"; date: string; label: string };

const keyOf = (e: Entry): WidgetKey | null =>
  e.kind === "board" ? `board:${e.id}` : e.kind === "list" ? `list:${e.board}:${e.id}` : e.kind === "map" ? `map:${e.id}` : e.kind === "slate" ? `slate:${e.date}` : null;

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Puts the chosen entry on the current page. */
export function placeEntry(editor: Editor, e: Entry, corner: { x: number; y: number } | null) {
  const at = corner ?? undefined;
  const key = keyOf(e);
  if (key) useWidget(key);
  switch (e.kind) {
    case "new":
      if (e.what === "board") newBoard(editor, at);
      else if (e.what === "map") newMap(editor, at);
      else insertSlate(editor, slateToday(), at);
      return;
    case "board":
      placeBoard(editor, e.id, "add board", {}, at);
      return;
    case "list":
      placeBoard(editor, e.board, "add list", { listId: e.id }, at);
      return;
    case "map":
      placeMap(editor, e.id, "add map", {}, at);
      return;
    case "slate":
      insertSlate(editor, e.date, at);
      return;
  }
}

export function WidgetPicker() {
  const editor = useEditor();
  const open = useValue(openAt);
  const raw = useRegistry();
  const maps = useMapList();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    setQuery("");
    setExpanded(new Set());
    const width = 320;
    const clamp = (x: number) => Math.min(Math.max(x, 8), window.innerWidth - width - 8);
    if (open.screen) {
      setPos({ left: clamp(open.screen.x), top: Math.min(open.screen.y, window.innerHeight - 380) });
    } else {
      const b = document.querySelector('[data-testid="tools.widgets"]')?.getBoundingClientRect() ?? document.querySelector(".gk-toolbar")?.getBoundingClientRect();
      setPos({ left: clamp(b ? b.left + b.width / 2 - width / 2 : window.innerWidth / 2 - width / 2), top: b ? b.bottom + 6 : 60 });
    }
  }, [open]);
  useEffect(() => {
    if (open && pos) input.current?.focus();
  }, [open, pos]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!box.current?.contains(t) && !t.closest?.('[data-testid="tools.widgets"], [data-testid="tools.more.widgets"]')) openAt.set(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        openAt.set(null);
      }
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  const entries = useMemo(() => {
    if (!open) return [] as Entry[];
    const boards = registryBoards(raw).map((b): Entry => ({ kind: "board", id: b.id, label: b.name, lists: boardLists(b.id) }));
    const today = slateToday();
    const slates: Entry[] = [-1, 0, 1].map((n) => {
      const date = addDays(today, n);
      return { kind: "slate", date, label: `Slate · ${n === 0 ? "tonight" : n < 0 ? "last night" : "tomorrow"} (${slateDateLabel(date)})` };
    });
    const list: Entry[] = [...boards, ...maps.map((m): Entry => ({ kind: "map", id: m.id, label: m.name })), ...slates];
    // Lists of every board, found by search (and when their board is open).
    const lists: Entry[] = boards.flatMap((b) => (b.kind === "board" ? b.lists.map((l): Entry => ({ kind: "list", board: b.id, id: l.id, label: l.title, boardName: b.label })) : []));
    return [...list, ...lists];
  }, [open, raw, maps]);

  if (!open || !pos) return null;
  const q = query.trim().toLowerCase();
  const rank = recentRank();
  const byRecent = (a: Entry, b: Entry) => (rank.get(keyOf(a) ?? "") ?? Infinity) - (rank.get(keyOf(b) ?? "") ?? Infinity);
  const shown = (q
    ? entries.filter((e) => (e.label + (e.kind === "list" ? ` ${e.boardName}` : "")).toLowerCase().includes(q))
    : entries.filter((e) => e.kind !== "list" || rank.has(keyOf(e)!))
  ).sort(byRecent);
  const news: Entry[] = [
    { kind: "new", what: "board", label: "+ New board" },
    { kind: "new", what: "map", label: "+ New map" },
    { kind: "new", what: "slate", label: "+ New Slate (tonight)" },
  ];
  const pick = (e: Entry) => {
    const corner = open.corner;
    openAt.set(null);
    placeEntry(editor, e, corner);
    // The keys are the whiteboard's again (tldraw's shortcuts need its focus).
    editor.focus();
  };
  const item = (e: Entry, i: number) => {
    const testId = e.kind === "new" ? `widget-new-${e.what}` : `widget-${e.kind}`;
    const data = e.kind === "board" || e.kind === "map" ? e.id : e.kind === "list" ? `${e.board}:${e.id}` : e.kind === "slate" ? e.date : e.what;
    return (
      <div key={`${e.kind}:${data}:${i}`} className="gw-row">
        <button type="button" role="menuitem" className="gw-item" data-testid={testId} data-id={data} onClick={() => pick(e)}>
          <span className="gw-kind">{e.kind === "new" ? "" : e.kind === "slate" ? "◷" : e.kind === "map" ? "⌘" : e.kind === "list" ? "▤" : "▦"}</span>
          {e.kind === "list" ? (
            <span>
              <span className="gw-muted">{e.boardName} › </span>
              {e.label}
            </span>
          ) : (
            <span>{e.label}</span>
          )}
        </button>
        {e.kind === "board" && e.lists.length > 0 && (
          <button
            type="button"
            className="gw-expand"
            data-testid="widget-expand"
            data-id={e.id}
            aria-label={expanded.has(e.id) ? `Hide the lists of ${e.label}` : `Show the lists of ${e.label}`}
            aria-expanded={expanded.has(e.id)}
            onClick={() => setExpanded((s) => (s.has(e.id) ? new Set([...s].filter((x) => x !== e.id)) : new Set([...s, e.id])))}
          >
            {expanded.has(e.id) ? "▾" : "▸"} {e.lists.length}
          </button>
        )}
      </div>
    );
  };
  return (
    <div className="gw-picker" role="menu" aria-label="Add widget" data-testid="widget-picker" data-corner={open.corner ? `${Math.round(open.corner.x)},${Math.round(open.corner.y)}` : "middle"} ref={box} style={pos}>
      <input
        ref={input}
        className="gw-search"
        data-testid="widget-search"
        placeholder="Search boards, lists, maps, nights…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && shown[0]) pick(shown[0]);
          e.stopPropagation();
        }}
      />
      <div className="gw-list">
        {!q && news.map(item)}
        {shown.map((e, i) => (
          <div key={`g${i}`}>
            {item(e, i)}
            {e.kind === "board" &&
              expanded.has(e.id) &&
              e.lists.map((l) => item({ kind: "list", board: e.id, id: l.id, label: l.title, boardName: e.label }, i))}
          </div>
        ))}
        {shown.length === 0 && <div className="gw-empty">Nothing matches “{query}”.</div>}
      </div>
    </div>
  );
}
