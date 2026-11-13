import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useEditor, type Editor } from "tldraw";

import { fitBoard } from "../boards/fit";
import { pageBox } from "../pages/keepFilled";
import { arriveDeltaNow, roomForWindow, windowSize } from "../pages/arrive";
import { SHEET } from "../pages/sheet";
import {
  liveOddsStore,
  loadCalendarData,
  localNotesStore,
  slateCopyColumns,
  slateGames,
  slateImageSize,
  SlateCopy,
  SLATE_GRID_GAP,
  type CalendarData,
  type DayOdds,
  type SlateOdds,
  type SlateNotes,
} from "./calendarkit";
import { SLATE_TYPE, type SlateShape } from "./SlateShape";
import { SLATE_TIME_ZONE, slateDateLabel } from "./today";

// The Slate widget's content, calendarkit's code: loaded (lazily, by
// SlateShape.tsx) with the first Slate widget a page shows.

/** A card's width: calendarkit's on-screen Slate card in the owner's
    1920 px window (a 1840 px grid in two columns: 914 px), the width its
    copies are made at, so the cards wrap their text as in the copies. */
export const SLATE_CARD_WIDTH = (1840 - SLATE_GRID_GAP) / 2;

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
  const games = d.status === "ready" ? slateGames(d.data, date) : null;
  // null until the schedule is here, or on a night without games: nothing asked
  const allOver = games?.length ? games.every((g) => g.status === "final") : null;
  const dayOdds = useDayOdds(date, allOver);

  // Keep the box the size of the cards (boards/fit.ts). The first time
  // (cols 0), calendarkit's copies' rule picks the columns and the whole
  // night is fitted to the page. Not an undo step. Until the schedule is
  // here (or when it can't load) the box keeps its place and size.
  useLayoutEffect(() => {
    const el = content.current;
    if (!games || !el) return;
    const measure = () => fit(editor, shape.id, el, games.length);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, shape.id, games, cols]);

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
    >
      {state === "ready" ? (
        <SlateCopy data={(d as { data: CalendarData }).data} games={games!} cols={cols || 1} cardWidth={SLATE_CARD_WIDTH} timeZone={SLATE_TIME_ZONE} notes={store} odds={dayOdds} />
      ) : state === "empty" ? (
        <Message date={date} text="No games" />
      ) : state === "failed" ? (
        <Message date={date} text="Schedule unavailable" size={keep} retry={editor} />
      ) : (
        <div style={keep} />
      )}
    </div>
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
      const card = { width: SLATE_CARD_WIDTH, height: Math.max(...cards.map((c) => c.offsetHeight)) };
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
