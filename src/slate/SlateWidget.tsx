import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useEditor, useValue, type Editor } from "tldraw";

import { useInExport } from "../whiteboard/exportStyles";

import { fitBoard } from "../boards/fit";
import { pageBox } from "../pages/keepFilled";
import { arriveDeltaNow, roomForWindow, windowSize } from "../pages/arrive";
import { SHEET } from "../pages/sheet";
import { CONTROLS } from "../pages/edges";
import {
  hoopsjunkieLink,
  liveOddsStore,
  loadCalendarData,
  localNotesStore,
  slateCopyCardWidth,
  slateCopyColumns,
  slateCopyCup,
  slateGames,
  slateImageSize,
  SlateCopy,
  SLATE_GRID_GAP,
  TeamLinkContext,
  type CalendarData,
  type DayOdds,
  type SlateOdds,
  type SlateNotes,
} from "./calendarkit";
import { SLATE_TYPE, type SlateShape } from "./SlateShape";
import { barPlace } from "./barPlace";
import { InLayer, useSlateHover } from "./hover";
import { SLATE_TIME_ZONE, slateDateLabel, stepSlateDate } from "./today";

// The Slate widget's content, calendarkit's code: loaded (lazily, by
// SlateShape.tsx) with the first Slate widget a page shows.

/** calendarkit's on-screen Slate card in the owner's 1920 px window (a
    1840 px grid in two columns: 914 px). Its copies (with notes) are made
    narrower from it (slateCopyCardWidth, calendarkit v1.64+): the widget's
    cards are that copy width, so they wrap their text as in the copies. */
export const SLATE_CARD_WIDTH = (1840 - SLATE_GRID_GAP) / 2;
const copyCardWidth = (data: CalendarData, games: Parameters<typeof slateCopyCup>[1]) => slateCopyCardWidth(SLATE_CARD_WIDTH, slateCopyCup(data, games));

// The schedule: fetched and parsed once per page (loadCalendarData keeps
// the one promise), shared by every Slate widget on every page. The font
// is waited for too, so the first sizing measures the cards' real text.
type Data = { status: "idle" | "loading" | "failed" } | { status: "ready"; data: CalendarData };
let data: Data = { status: "idle" };
const dataSubs = new Set<() => void>();
const setData = (d: Data) => {
  data = d;
  dataSubs.forEach((f) => f());
};
const FONT = '400 14px "Inter ck"';
function load() {
  if (data.status === "loading" || data.status === "ready") return;
  setData({ status: "loading" });
  const font = document.fonts?.load(FONT).catch(() => []);
  Promise.all([loadCalendarData(), font]).then(
    ([d]) => setData({ status: "ready", data: d }),
    () => setData({ status: "failed" }),
  );
}
const subscribeData = (fn: () => void) => {
  dataSubs.add(fn);
  return () => void dataSubs.delete(fn);
};

// The notes: calendarkit's own store (one per page, localStorage
// `ck:notes:v1`, one `storage` listener for the page however many widgets),
// read only. A change anywhere (another tab: calendarkit) bumps the
// version; the widgets then draw their cards again.
const notes = localNotesStore();
let notesVersion = 0;
notes.subscribe("*", () => notesVersion++);
const subscribeNotes = (fn: () => void) => notes.subscribe("*", fn);
/** What the cards read the notes through: `get` only, nothing is ever
    written (typing in the widget is step 4). */
const readOnly = (): SlateNotes => ({ get: (id) => notes.get(id), set() {}, flush() {}, subscribe: () => () => {} });

// The odds: calendarkit's own store (/calendar/api/odds, ESPN moneyline),
// one per page: one request per date shown however many widgets show it,
// refreshed every 10 min while a widget shows a night not yet over. No
// answer (a failure, or calendarkit's `vite preview`) = no odds, the
// cards keep their empty odds column.
const odds: SlateOdds = liveOddsStore();
const NO_ODDS = () => undefined;
// calendarkit's store loads a night again each time a Slate starts showing
// it while it isn't over (its own page shows one Slate): here every widget
// showing a night shares one `show`, so one request per night, not per
// widget; the last widget to stop showing it stops the refresh.
const showing = new Map<string, { n: number; stop: () => void }>();
function showOdds(date: string, allOver: boolean): () => void {
  const key = `${date} ${allOver}`;
  let s = showing.get(key);
  if (!s) showing.set(key, (s = { n: 0, stop: odds.show(date, allOver) }));
  s.n++;
  return () => {
    if (--s.n > 0) return;
    s.stop();
    showing.delete(key);
  };
}
function useDayOdds(date: string, allOver: boolean | null): DayOdds | undefined {
  const day = useSyncExternalStore(
    useMemo(() => (fn: () => void) => odds.subscribe(date, fn), [date]),
    allOver === null ? NO_ODDS : () => odds.get(date),
  );
  useEffect(() => (allOver === null ? undefined : showOdds(date, allOver)), [date, allOver]);
  return day;
}

export default function SlateWidget({ shape }: { shape: SlateShape }) {
  const editor = useEditor();
  const d = useSyncExternalStore(subscribeData, () => data);
  useEffect(() => load(), []);
  const version = useSyncExternalStore(subscribeNotes, () => notesVersion);
  const store = useMemo(readOnly, [version]);
  const content = useRef<HTMLDivElement>(null);
  const { date, w, h, scale, cols } = shape.props;
  // Drawn for an export: the shape is left as it is (exportStyles.tsx).
  const inExport = useInExport();
  const games = d.status === "ready" ? slateGames(d.data, date) : null;
  // null until the schedule is here, or on a night without games: nothing asked
  const allOver = games?.length ? games.every((g) => g.status === "final") : null;
  const dayOdds = useDayOdds(date, allOver);
  const hover = useSlateHover(editor, d.status === "ready" ? d.data : undefined, date);
  // The date bar (‹ date ›) and ← / →: while this widget alone is selected.
  const lone = useValue("slate alone selected", () => editor.getOnlySelectedShapeId() === shape.id && editor.isIn("select.idle") && !editor.getEditingShapeId(), [editor, shape.id]);

  // Keep the box the size of the cards (boards/fit.ts). The first time
  // (cols 0), calendarkit's copies' rule picks the columns and the whole
  // night is fitted to the page. Not an undo step. Until the schedule is
  // here (or when it can't load) the box keeps its place and size.
  useLayoutEffect(() => {
    const el = content.current;
    if (!games || !el || inExport) return;
    const measure = () => fit(editor, shape.id, el, games.length);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, shape.id, games, cols, inExport]);

  // The cards, made again only when what they show changes: a popup
  // opening or closing (hover state, kept in this component) never redraws
  // them (perf.e2e.ts: hovering a page of Slates).
  const ready = d.status === "ready" ? d.data : undefined;
  const cards = useMemo(
    () =>
      ready && games ? (
        <TeamLinkContext.Provider value={hover.teamLinks}>
          <SlateCopy data={ready} games={games} cols={cols || 1} cardWidth={copyCardWidth(ready, games)} timeZone={SLATE_TIME_ZONE} notes={store} odds={dayOdds} gameLink={hoopsjunkieLink} />
        </TeamLinkContext.Provider>
      ) : null,
    [ready, games, cols, store, dayOdds, hover.teamLinks],
  );
  const z = scale || 1;
  const keep = { width: w / z, height: h / z };
  const state = d.status === "ready" ? (games!.length ? "ready" : "empty") : d.status;
  return (
    <div
      ref={content}
      className="gs-slate ck-root ck-slate-widget"
      data-testid="slate-widget"
      data-date={date}
      data-state={state}
      style={{ transform: `scale(${z})`, visibility: scale && cols ? "visible" : "hidden" }}
      {...hover.handlers}
    >
      {state === "ready" ? (
        cards
      ) : state === "empty" ? (
        <Message date={date} text="No games" />
      ) : state === "failed" ? (
        <Message date={date} text="Schedule unavailable" size={keep} retry={editor} />
      ) : (
        <div style={keep} />
      )}
      {hover.node}
      {lone && scale > 0 && <DateBar editor={editor} id={shape.id} />}
    </div>
  );
}

/** The night before or after, one undo step (Slate step 3); within the
    season once the schedule is here. */
export function stepSlate(editor: Editor, id: SlateShape["id"], dir: -1 | 1) {
  const cur = editor.getShape<SlateShape>(id);
  if (!cur) return;
  const days = data.status === "ready" ? data.data.dates : undefined;
  const next = stepSlateDate(cur.props.date, dir, days?.[0], days?.at(-1));
  if (next === cur.props.date) return;
  editor.markHistoryStoppingPoint("slate date");
  editor.updateShape<SlateShape>({ id, type: SLATE_TYPE, props: { date: next } });
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const inMenu = (t: EventTarget | null) => t instanceof Element && !!t.closest('.tlui-popover__content, [role="menu"], [role="dialog"], [role="listbox"]');

/** The whiteboard's floating controls (toolbar, style panel, page arrows…)
    and where they are; read at most every 300 ms (reading a box makes the
    browser lay out: the bar follows the camera). */
let controls: { at: number; rects: DOMRect[] } = { at: -Infinity, rects: [] };
function controlRects() {
  const now = performance.now();
  if (now - controls.at > 300) controls = { at: now, rects: CONTROLS.flatMap((sel) => [...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect())) };
  return controls.rects;
}


/**
 * The selected widget's night, "‹ Thu, Nov 13, 2026 ›", just above its
 * top-left corner at reading size (in the popups' layer). ‹ › and the
 * ← / → keys step the night as calendarkit's Slate does; Shift+← / →
 * and ↑ / ↓ still nudge the widget, and with anything else selected the
 * arrows nudge as always (owner's step 3 "arrow keys vs nudging").
 */
function DateBar({ editor, id }: { editor: Editor; id: SlateShape["id"] }) {
  const date = useValue("slate date", () => editor.getShape<SlateShape>(id)?.props.date ?? "", [editor, id]);
  const at = useValue(
    "slate bar place",
    () => {
      const b = editor.getShapePageBounds(id);
      if (!b) return null;
      const p = editor.pageToScreen({ x: b.minX, y: b.minY });
      const q = editor.pageToScreen({ x: b.maxX, y: b.maxY });
      return { x: Math.round(p.x), y: Math.round(p.y), r: Math.round(q.x), b: Math.round(q.y) };
    },
    [editor, id],
  );
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || !at) return;
    const win = { w: document.documentElement.clientWidth, h: window.innerHeight };
    const p = barPlace(at, el.offsetWidth, el.offsetHeight, win, controlRects());
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      if (typing(e.target) || inMenu(e.target) || editor.getOnlySelectedShapeId() !== id) return;
      e.preventDefault();
      e.stopPropagation();
      stepSlate(editor, id, e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editor, id]);
  if (!at) return null;
  // A press on the bar keeps the keys on the whiteboard (the bar is outside
  // tldraw's box: a click there would leave the whiteboard unfocused, and
  // tldraw then stops nudging with the arrows).
  const keepFocus = (e: { preventDefault(): void }) => e.preventDefault();
  const step = (dir: -1 | 1) => {
    stepSlate(editor, id, dir);
    editor.getContainer().focus({ preventScroll: true });
    editor.focus();
  };
  return (
    <InLayer>
      <div ref={bar} className="gs-slate-bar" data-testid="slate-date-bar" onPointerDown={keepFocus}>
        <button type="button" aria-label="Previous night" title="Previous night (←)" data-testid="slate-prev" onClick={() => step(-1)}>
          ‹
        </button>
        <span data-testid="slate-date">{slateDateLabel(date)}</span>
        <button type="button" aria-label="Next night" title="Next night (→)" data-testid="slate-next" onClick={() => step(1)}>
          ›
        </button>
      </div>
    </InLayer>
  );
}

/** The date and why there are no cards; with `retry`, a "Try again". */
function Message({ date, text, size, retry }: { date: string; text: string; size?: { width: number; height: number }; retry?: Editor }) {
  return (
    <div className="gs-slate-msg" data-testid="slate-message" style={size}>
      <b>{slateDateLabel(date)}</b>
      <span>{text}</span>
      {retry && (
        <button type="button" className="gs-slate-retry" data-testid="slate-retry" onPointerDown={(e) => retry.markEventAsHandled(e)} onClick={load}>
          Try again
        </button>
      )}
    </div>
  );
}

/** A new Slate's room: a third of the window's width (owner, speed
    session Part 3: fitted to the whole page was far too big), and the
    height a new thing may take (pages/arrive.ts). */
export const SLATE_WIDTH_SHARE = 1 / 3;
export function slateRoom(win: { w: number; h: number }) {
  return { w: win.w * SLATE_WIDTH_SHARE, h: roomForWindow(win).h };
}

function fit(editor: Editor, id: SlateShape["id"], el: HTMLElement, n: number) {
  const cur = editor.getShape<SlateShape>(id);
  if (!cur || el.offsetWidth === 0) return;
  const p = cur.props;
  const page = pageBox.get() ?? SHEET;
  const natural = { w: el.offsetWidth, h: el.offsetHeight };
  if (p.cols === 0) {
    // First sizing (speed session Part 3): the night fitted to a third of
    // the window's width (and its height), in the columns whose cards come
    // out largest there (calendarkit's rule); placed new, it grows from
    // where it was put, inside the window.
    const room = slateRoom(windowSize(editor));
    let next: { cols: number; scale: number; w: number; h: number };
    if (n > 0) {
      const cards = [...el.querySelectorAll<HTMLElement>(".ck-slate-card")];
      const card = { width: cards[0]!.offsetWidth, height: Math.max(...cards.map((c) => c.offsetHeight)) };
      const c = slateCopyColumns(n, card, { width: room.w, height: room.h });
      const size = slateImageSize(n, c, card);
      const s = Math.min(room.w / size.width, room.h / size.height);
      next = { cols: c, scale: s, w: size.width * s, h: size.height * s };
    } else {
      next = { cols: 1, ...fitBoard(natural, 0, page, room) };
    }
    const at = cur.meta?.corner ? { x: cur.x, y: cur.y } : { x: cur.x + (p.w - next.w) / 2, y: cur.y + (p.h - next.h) / 2 };
    const d = arriveDeltaNow(editor, { ...at, w: next.w, h: next.h });
    editor.run(() => editor.updateShape<SlateShape>({ id, type: SLATE_TYPE, x: at.x + d.x, y: at.y + d.y, props: next }), { history: "ignore" });
    return;
  }
  const f = fitBoard(natural, p.scale || 1, page);
  if (Math.abs(f.w - p.w) < 0.5 && Math.abs(f.h - p.h) < 0.5 && f.scale === p.scale) return;
  editor.run(() => editor.updateShape<SlateShape>({ id, type: SLATE_TYPE, props: f }), { history: "ignore" });
}
