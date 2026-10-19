import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  addPage,
  addStone,
  commit,
  currentPage,
  geometry,
  historyOf,
  isNear,
  jumpTarget,
  movePage,
  moveRect,
  pageTop,
  redo,
  removePage,
  removeStone,
  resizeRect,
  setRect,
  undo,
  type App,
  type Geometry,
  type History,
  type Layout,
  type Rect,
  type Stone as StoneData,
} from "../domain/layout";
import type { FromFrame, Status } from "../domain/protocol";
import { affectsSources, sources as readSources, type Source } from "../domain/sources";
import { AddStone } from "./AddStone";
import styles from "./Canvas.module.css";
import { flush, send } from "./frames";
import { Overview } from "./Overview";
import { Stone, type Grab } from "./Stone";
import { LAYOUT_KEY, loadLayout, loadScrolls, newId, saveLayout, saveScrolls } from "./storage";

const readAll = () => readSources((k) => localStorage.getItem(k));
/** How often a far frame that couldn't be unloaded (busy) is tried again. */
const RETRY_MS = 2000;

type Drag = { stone: StoneData; grab: Grab; x0: number; y0: number; start: Rect; rect: Rect };

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");

export function Canvas() {
  const [history, setHistory] = useState<History>(() => historyOf(loadLayout()));
  const layout = history.present;
  const act = useCallback((change: (l: Layout) => Layout) => setHistory((h) => commit(h, change(h.present))), []);

  // Saved on every change; another canvas tab's save is taken in.
  useEffect(() => saveLayout(layout), [layout]);

  const scroller = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const g: Geometry = useMemo(() => geometry(viewport.w, viewport.h), [viewport]);
  const [scrollTop, setScrollTop] = useState(0);
  const current = currentPage(g, scrollTop, viewport.h, layout.pages.length);

  useLayoutEffect(() => {
    const el = scroller.current!;
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A resize keeps the same page in view.
  const shownPage = useRef(0);
  shownPage.current = current;
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: pageTop(g, shownPage.current) });
  }, [g]);

  // ------------------------------------------------------------ app names
  const [sources, setSources] = useState<Source[]>(readAll);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (affectsSources(e.key)) setSources(readAll());
      if (e.key === LAYOUT_KEY && e.newValue) {
        const theirs = loadLayout();
        setHistory((h) => ({ ...h, present: theirs }));
      }
    };
    const refresh = () => setSources(readAll());
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const sourceOf = useCallback((app: App, itemId: string) => sources.find((s) => s.app === app && s.id === itemId), [sources]);
  const nameOf = useCallback((app: App, itemId: string, fallback: string) => sourceOf(app, itemId)?.name ?? (fallback || "Untitled"), [sourceOf]);

  // ------------------------------------------------------------- page jumps
  const jumping = useRef<number | null>(null);
  const goTo = useCallback(
    (index: number, smooth = true) => {
      jumping.current = index;
      scroller.current?.scrollTo({ top: pageTop(g, index), behavior: smooth ? "smooth" : "auto" });
    },
    [g],
  );
  const jump = useCallback(
    (step: 1 | -1) => {
      const el = scroller.current!;
      const n = layout.pages.length;
      // Pressed again before the last jump landed: go on from where it's going.
      const pending = jumping.current;
      const from = pending !== null && Math.abs(el.scrollTop - pageTop(g, pending)) > 2 ? pending : null;
      const target = from !== null ? Math.min(n - 1, Math.max(0, from + step)) : jumpTarget(g, el.scrollTop, step, n);
      goTo(target);
    },
    [g, goTo, layout.pages.length],
  );

  const onScroll = () => {
    const top = scroller.current!.scrollTop;
    setScrollTop(top);
    if (jumping.current !== null && Math.abs(top - pageTop(g, jumping.current)) <= 2) jumping.current = null;
  };

  // ------------------------------------------------------------------ focus
  const [focused, setFocused] = useState<string | null>(null);
  // The stone touched last is drawn on top of any it overlaps (not saved).
  const [raised, setRaised] = useState<string[]>([]);
  const raise = useCallback((stoneId: string) => setRaised((r) => (r.at(-1) === stoneId ? r : [...r.filter((id) => id !== stoneId), stoneId])), []);
  const onFrameFocus = useCallback(
    (stoneId: string, isFocused: boolean) => {
      if (isFocused) raise(stoneId);
      setFocused((f) => (isFocused ? stoneId : f === stoneId ? null : f));
    },
    [raise],
  );
  useEffect(() => {
    // Backup for the frames' own focus events: when this window loses focus
    // to a frame, the frame is the active element.
    const onBlur = () =>
      setTimeout(() => {
        const el = document.activeElement;
        if (el instanceof HTMLIFrameElement) setFocused(el.closest<HTMLElement>("[data-stone-id]")?.dataset.stoneId ?? null);
      });
    const onFocus = () => setFocused(null);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  /** A click on the canvas outside any frame gives the keys back to it. */
  const takeFocus = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-stone-id], button, input")) return;
    scroller.current?.focus({ preventScroll: true });
    setFocused(null);
  };
  useEffect(() => scroller.current?.focus({ preventScroll: true }), []);

  // ----------------------------------------------------------- dialogs, keys
  const [adding, setAdding] = useState(false);
  const [overview, setOverview] = useState(false);
  const modal = adding || overview;

  useEffect(() => {
    // Keys typed inside a frame stay in that frame's window: only keys meant
    // for the canvas reach this.
    const onKey = (e: KeyboardEvent) => {
      if (modal || isTyping(e.target) || e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        setHistory(e.shiftKey ? redo : undo);
      } else if (mod && key === "y") {
        e.preventDefault();
        setHistory(redo);
      } else if (!mod && !e.shiftKey && (e.key === "ArrowDown" || e.key === "PageDown")) {
        e.preventDefault();
        jump(1);
      } else if (!mod && !e.shiftKey && (e.key === "ArrowUp" || e.key === "PageUp")) {
        e.preventDefault();
        jump(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, modal]);

  // ------------------------------------------------- loading and unloading
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const iframes = useRef(new Map<string, HTMLIFrameElement>());
  const scrolls = useRef(loadScrolls());
  const unloading = useRef(new Set<string>());
  const live = useRef({ layout, current, loaded });
  live.current = { layout, current, loaded };

  const nearIds = (l: Layout, cur: number) => new Set(l.pages.flatMap((p, i) => (isNear(i, cur) ? p.stones.map((s) => s.id) : [])));

  /** Loads the frames on the current page and its neighbours. A frame
      further away is unloaded only once it has saved and nothing is being
      typed in it; otherwise it stays and is tried again later. */
  const reconcile = useCallback(() => {
    const { layout: l, current: cur, loaded: was } = live.current;
    const near = nearIds(l, cur);
    const all = new Set(l.pages.flatMap((p) => p.stones.map((s) => s.id)));
    const next = new Set([...was].filter((id) => all.has(id)));
    for (const id of near) next.add(id);
    if (next.size !== was.size || [...next].some((id) => !was.has(id))) setLoaded(next);
    for (const id of next) {
      if (near.has(id) || unloading.current.has(id)) continue;
      const el = iframes.current.get(id);
      unloading.current.add(id);
      (el ? flush(el) : Promise.resolve(false)).then((busy) => {
        unloading.current.delete(id);
        const { layout: l2, current: cur2 } = live.current;
        if (busy || nearIds(l2, cur2).has(id)) return;
        setLoaded((s) => {
          const out = new Set(s);
          out.delete(id);
          return out;
        });
      });
    }
  }, []);
  useEffect(reconcile, [layout, current, reconcile]);
  useEffect(() => {
    const t = setInterval(reconcile, RETRY_MS);
    return () => clearInterval(t);
  }, [reconcile]);

  const onFrame = useCallback((stoneId: string, el: HTMLIFrameElement | null) => {
    if (el) iframes.current.set(stoneId, el);
    else iframes.current.delete(stoneId);
  }, []);

  const onMessage = useCallback((stoneId: string, msg: FromFrame) => {
    if (msg.type === "stone:ready" || msg.type === "stone:status") {
      setStatuses((s) => ({ ...s, [stoneId]: msg.status }));
      const saved = scrolls.current[stoneId];
      const el = iframes.current.get(stoneId);
      if (msg.type === "stone:ready" && msg.status === "ok" && saved && el) send(el, { type: "stone:scroll-to", ...saved });
    } else if (msg.type === "stone:scroll") {
      scrolls.current[stoneId] = { x: msg.x, y: msg.y };
      saveScrolls(scrolls.current);
    }
  }, []);

  const reloadStone = useCallback((stone: StoneData) => {
    const el = iframes.current.get(stone.id);
    setStatuses((s) => {
      const { [stone.id]: _, ...rest } = s;
      return rest;
    });
    el?.contentWindow?.location.reload();
  }, []);

  /** Lets a frame save before it goes away (it was clicked out of, so
      nothing is mid-edit; wait a moment for the save anyway). */
  const settle = async (ids: string[]) => {
    await Promise.all(ids.map((id) => iframes.current.get(id)).map((el) => (el ? flush(el, 800) : false)));
  };

  // ----------------------------------------------------------- canvas edits
  const pick = (source: Source) => {
    setAdding(false);
    act((l) => addStone(l, current, { id: newId(), app: source.app, itemId: source.id, name: source.name }));
    scroller.current?.focus({ preventScroll: true });
  };
  const removeOne = async (stone: StoneData) => {
    await settle([stone.id]);
    act((l) => removeStone(l, stone.id));
  };
  const newPage = () => {
    const n = layout.pages.length;
    act((l) => addPage(l, newId()));
    requestAnimationFrame(() => goTo(n));
  };
  const dropPage = async (index: number) => {
    await settle(layout.pages[index]?.stones.map((s) => s.id) ?? []);
    act((l) => removePage(l, index));
  };

  // ------------------------------------------------------- move and resize
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const onGrab = (stone: StoneData, grab: Grab, e: ReactPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    scroller.current?.focus({ preventScroll: true });
    raise(stone.id);
    const start = { x: stone.x, y: stone.y, w: stone.w, h: stone.h };
    setDrag({ stone, grab, x0: e.clientX, y0: e.clientY, start, rect: start });
  };
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.x0) / g.pageW;
      const dy = (e.clientY - d.y0) / g.pageH;
      const rect = d.grab === "move" ? moveRect(d.start, dx, dy) : resizeRect(d.start, d.grab, dx, dy);
      setDrag({ ...d, rect });
    };
    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const { x, y, w, h } = d.rect;
      if (x !== d.start.x || y !== d.start.y || w !== d.start.w || h !== d.start.h) act((l) => setRect(l, d.stone.id, d.rect));
    };
    const onCancel = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    // Bound once per drag; the latest drag is read from the ref.
  }, [drag !== null, g, act]);

  // ----------------------------------------------------------------- render
  const lastPageSpace = Math.max(72, viewport.h - g.pitch);
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return (
    <div className={styles.app} data-dragging={drag ? drag.grab : undefined}>
      <header className={styles.toolbar}>
        <span className={styles.title}>Gauntlet</span>
        <span className={styles.pageCount} data-testid="page-indicator">
          Page {current + 1} of {layout.pages.length}
        </span>
        <button type="button" className={styles.toolButton} data-primary onClick={() => setAdding(true)}>
          + Add stone
        </button>
        <button type="button" className={styles.toolButton} onClick={() => setOverview(true)}>
          Pages
        </button>
        <button type="button" className={styles.toolButton} disabled={!canUndo} onClick={() => setHistory(undo)} title="Undo a canvas change (Ctrl+Z outside a frame)">
          Undo
        </button>
        <button type="button" className={styles.toolButton} disabled={!canRedo} onClick={() => setHistory(redo)} title="Redo (Ctrl+Shift+Z outside a frame)">
          Redo
        </button>
        <span className={styles.spacer} />
        <a className={styles.appLink} href="/backups/">
          Backups
        </a>
        <a className={styles.appLink} href="/whiteboard/">
          Whiteboard (new)
        </a>
        <a className={styles.appLink} href="/boardkit/" target="_blank" rel="noreferrer">
          Boardkit ↗
        </a>
        <a className={styles.appLink} href="/linkkit/" target="_blank" rel="noreferrer">
          Linkkit ↗
        </a>
      </header>

      <div ref={scroller} className={styles.scroller} tabIndex={-1} onScroll={onScroll} onPointerDown={takeFocus} data-testid="canvas" aria-label="Canvas">
        <div className={styles.column} style={{ paddingTop: g.margin }}>
          {layout.pages.map((page, index) => (
            <section
              key={page.id}
              className={styles.page}
              data-page-index={index}
              data-page-id={page.id}
              style={{ width: g.pageW, height: g.pageH, marginBottom: g.margin }}
              aria-label={`Page ${index + 1}`}
            >
              <span className={styles.pageNumber}>{index + 1}</span>
              {page.stones.map((stone) => {
                const source = sourceOf(stone.app, stone.itemId);
                return (
                  <Stone
                    key={stone.id}
                    stone={stone}
                    rect={drag?.stone.id === stone.id ? drag.rect : stone}
                    z={raised.indexOf(stone.id) + 1}
                    name={source?.name ?? (stone.name || "Untitled")}
                    linked={!!source?.linked}
                    loaded={loaded.has(stone.id)}
                    focused={focused === stone.id}
                    status={statuses[stone.id]}
                    shielded={drag !== null}
                    onGrab={onGrab}
                    onRemove={removeOne}
                    onReload={reloadStone}
                    onFrame={onFrame}
                    onMessage={onMessage}
                    onFrameFocus={onFrameFocus}
                  />
                );
              })}
            </section>
          ))}
          <div className={styles.addPageRow} style={{ height: lastPageSpace }}>
            <button type="button" className={styles.toolButton} onClick={newPage}>
              + page
            </button>
          </div>
        </div>
      </div>

      {adding && <AddStone sources={sources} page={current} onPick={pick} onClose={() => setAdding(false)} />}
      {overview && (
        <Overview
          layout={layout}
          current={current}
          nameOf={nameOf}
          onClose={() => setOverview(false)}
          onJump={(i) => {
            setOverview(false);
            goTo(i);
            scroller.current?.focus({ preventScroll: true });
          }}
          onMove={(from, to) => act((l) => movePage(l, from, to))}
          onRemove={dropPage}
        />
      )}
    </div>
  );
}

