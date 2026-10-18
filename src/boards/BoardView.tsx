import { Fragment, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";

import { useEditor } from "tldraw";

import { cardNumbers, MAX_CARDS_PER_LIST, newCardId, type Board, type Card, type List } from "./record";
import { edit, useBoard, useBoardName, type EditResult } from "./store";

// Boardkit's palette (`styles/tokens.css`); a picked colour is a hex.
const PALETTE: Record<string, string> = {
  slate: "#667085",
  red: "#e03131",
  orange: "#e8590c",
  yellow: "#f0b000",
  green: "#2f9e44",
  teal: "#0ca678",
  blue: "#4c6ef5",
  purple: "#9c36b5",
};
const colorOf = (c: unknown) => (typeof c === "string" ? (PALETTE[c] ?? (/^#[0-9a-f]{6}$/i.test(c) ? c : undefined)) : undefined);

type Renaming = { kind: "card" | "list"; id: string } | null;
type Drop = { listId: string; index: number };
type Drag = { cardId: string; x: number; y: number; dx: number; dy: number; active: boolean; drop: Drop | null };

const MESSAGES: Partial<Record<EditResult, string>> = { failed: "Couldn't save: storage is full." };

/**
 * The board itself, drawn at its natural size (BoardShape scales it). While
 * `editing`: click a title to rename it, drag a card to move it (within or
 * across lists), × deletes it into Boardkit's trash, "+ Add a card" adds.
 * `contentScale` turns screen pixels into the board's own, for dragging.
 */
export function BoardView({
  boardId,
  editing,
  startAt,
  contentScale,
}: {
  boardId: string;
  editing: boolean;
  startAt: { x: number; y: number } | null;
  contentScale: () => number;
}) {
  const read = useBoard(boardId);
  const name = useBoardName(boardId);
  const root = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState<Renaming>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setRenaming(null);
      dragRef.current = null;
      setDrag(null);
    }
  }, [editing]);

  // Editing began with a double-click on a title: rename that one.
  useEffect(() => {
    if (!editing || !startAt) return;
    const frame = requestAnimationFrame(() => {
      const hit = document.elementFromPoint(startAt.x, startAt.y);
      if (!hit || !root.current?.contains(hit)) return;
      const card = hit.closest<HTMLElement>("[data-card-id]");
      const list = hit.closest<HTMLElement>("[data-list-title]");
      if (card) setRenaming({ kind: "card", id: card.dataset.cardId! });
      else if (list) setRenaming({ kind: "list", id: list.dataset.listTitle! });
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, startAt]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Escape while dragging a card puts it back (and doesn't end editing).
  useEffect(() => {
    if (!drag?.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [drag?.active]);

  const run = (...args: Parameters<typeof edit>) => {
    const r = edit(...args);
    if (MESSAGES[r]) setNotice(MESSAGES[r]!);
    return r;
  };

  if (read.status !== "ok") {
    const why = {
      missing: "This board isn't in Boardkit any more.",
      damaged: "This board needs repairing: open it in Boardkit (/boardkit).",
      newer: "This board was saved by a newer Boardkit. Reload the page.",
    }[read.status];
    return (
      <div className="gb-board gb-problem" data-board-id={boardId} data-status={read.status}>
        <div className="gb-name">{name ?? "Board"}</div>
        <p>{why}</p>
      </div>
    );
  }
  const board = read.board;
  const numbers = cardNumbers(board);

  /** The list and index the pointer is over, for a drop. */
  const dropAt = (x: number, y: number, cardId: string): Drop | null => {
    const el = document.elementsFromPoint(x, y).find((e) => root.current?.contains(e) && e.closest("[data-list-id]"));
    const list = el?.closest<HTMLElement>("[data-list-id]");
    if (!list || list.dataset.collapsed) return null;
    const cards = [...list.querySelectorAll<HTMLElement>("[data-card-id]")].filter((c) => c.dataset.cardId !== cardId);
    let index = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    if (index < 0) index = cards.length;
    const listId = list.dataset.listId!;
    const full = (board.cardOrder[listId]?.length ?? 0) >= MAX_CARDS_PER_LIST && !board.cardOrder[listId]?.includes(cardId);
    return full ? null : { listId, index };
  };

  // A press on a card: a click renames it, a drag (past 4 px) moves it.
  // The pointer is followed on the window, ahead of the whiteboard.
  const onCardDown = (e: RPointerEvent, cardId: string) => {
    if (!editing || e.button !== 0 || (e.target as Element).closest("textarea, button")) return;
    e.stopPropagation();
    e.preventDefault();
    let d: Drag = { cardId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, active: false, drop: null };
    dragRef.current = d;
    setDrag(d);
    const move = (ev: PointerEvent) => {
      ev.stopPropagation();
      if (dragRef.current !== d) return stop();
      const sx = ev.clientX - d.x;
      const sy = ev.clientY - d.y;
      if (!d.active && Math.hypot(sx, sy) < 4) return;
      const k = contentScale() || 1;
      d = { ...d, active: true, dx: sx / k, dy: sy / k, drop: dropAt(ev.clientX, ev.clientY, cardId) };
      dragRef.current = d;
      setDrag(d);
    };
    const up = (ev: PointerEvent) => {
      ev.stopPropagation();
      stop();
      if (dragRef.current !== d) return; // cancelled (Escape)
      dragRef.current = null;
      setDrag(null);
      if (!d.active) setRenaming({ kind: "card", id: cardId });
      else if (d.drop) run(boardId, { kind: "moveCard", cardId, toList: d.drop.listId, index: d.drop.index });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  };

  const background = (board.background as { kind?: string; color?: unknown } | undefined)?.kind === "color" ? colorOf((board.background as { color?: unknown }).color) : undefined;

  return (
    <div
      ref={root}
      className="gb-board"
      data-board-id={boardId}
      data-editing={editing || undefined}
      style={background ? ({ "--board-bg": background } as CSSProperties) : undefined}
      onPointerDown={(e) => editing && e.stopPropagation()}
    >
      <div className="gb-name">{name ?? "Board"}</div>
      <div className="gb-lists">
        {board.listOrder.map((listId) => (
          <ListColumn
            key={listId}
            list={board.lists[listId]}
            board={board}
            numbers={numbers}
            editing={editing}
            renaming={renaming}
            setRenaming={setRenaming}
            drag={drag}
            onCardDown={onCardDown}
            run={run}
            boardId={boardId}
            onFull={() => setNotice(`A list holds at most ${MAX_CARDS_PER_LIST} cards.`)}
            onTrashFull={() => setNotice("Boardkit's trash is full: empty it in /boardkit first.")}
          />
        ))}
        {board.listOrder.length === 0 && <div className="gb-empty">No lists yet: add them in Boardkit.</div>}
      </div>
      {notice && (
        <div className="gb-notice" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}

function ListColumn(props: {
  list: List;
  board: Board;
  numbers: Record<string, number | null>;
  editing: boolean;
  renaming: Renaming;
  setRenaming: (r: Renaming) => void;
  drag: Drag | null;
  onCardDown: (e: RPointerEvent, cardId: string) => void;
  run: (...args: Parameters<typeof edit>) => EditResult;
  boardId: string;
  onFull: () => void;
  onTrashFull: () => void;
}) {
  const { list, board, editing, renaming, setRenaming, drag, run, boardId } = props;
  const [adding, setAdding] = useState(0); // > 0: the add field is open (its key)
  const collapsed = !!board.collapsedLists?.[list.id];
  const order = board.cardOrder[list.id] ?? [];
  const accent = colorOf(list.color);
  const dropHere = drag?.active && drag.drop?.listId === list.id ? drag.drop.index : -1;
  const lifted = drag?.active ? drag.cardId : null;
  let slot = 0; // index among the cards that aren't lifted, for the drop line

  const style = { "--list-accent": accent ?? "transparent", width: collapsed ? undefined : (list.width ?? 288) } as CSSProperties;

  return (
    <div className="gb-list" data-list-id={list.id} data-collapsed={collapsed || undefined} style={style}>
      <div
        className="gb-list-title"
        data-list-title={list.id}
        onPointerDown={(e) => {
          if (!editing || e.button !== 0 || (e.target as Element).closest("textarea")) return;
          e.stopPropagation();
          setRenaming({ kind: "list", id: list.id });
        }}
      >
        {renaming?.kind === "list" && renaming.id === list.id ? (
          <TitleEditor
            initial={list.title}
            onDone={(v) => {
              if (v !== null && v.trim()) run(boardId, { kind: "renameList", listId: list.id, title: v.trim() });
              setRenaming(null);
            }}
          />
        ) : (
          <span>{list.title || "Untitled"}</span>
        )}
        {collapsed && <span className="gb-count">{order.length}</span>}
      </div>
      {!collapsed && (
        <div className="gb-cards">
          {order.map((id) => {
            const before = id !== lifted && dropHere === slot;
            if (id !== lifted) slot += 1;
            return (
              <Fragment key={id}>
                {before && <div className="gb-drop" />}
                <CardRow
                  card={board.cards[id]}
                  list={list}
                  number={props.numbers[id]}
                  editing={editing}
                  lift={id === lifted ? drag : null}
                  renaming={renaming?.kind === "card" && renaming.id === id}
                  onRenamed={(v) => {
                    if (v !== null && v.trim()) run(boardId, { kind: "renameCard", cardId: id, title: v.trim() });
                    setRenaming(null);
                  }}
                  onDelete={() => {
                    if (run(boardId, { kind: "trashCard", cardId: id, at: Date.now() }) === "unchanged") props.onTrashFull();
                  }}
                  onPointerDown={(e) => props.onCardDown(e, id)}
                />
              </Fragment>
            );
          })}
          {dropHere >= 0 && dropHere === slot && <div className="gb-drop" />}
          {editing &&
            (adding ? (
              <div className="gb-card gb-adding">
                <TitleEditor
                  key={adding}
                  initial=""
                  placeholder="Card title"
                  onDone={(v, how) => {
                    if (v !== null && v.trim()) {
                      const r = run(boardId, { kind: "addCard", listId: list.id, index: order.length, card: { id: newCardId(), title: v.trim() } });
                      if (r === "unchanged") props.onFull();
                    }
                    setAdding(how === "enter" && v !== null && v.trim() ? adding + 1 : 0);
                  }}
                />
              </div>
            ) : (
              <button
                className="gb-add"
                onPointerDown={(e) => e.stopPropagation()}
                // Never takes the keys: they stay with the whiteboard.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (order.length >= MAX_CARDS_PER_LIST ? props.onFull() : setAdding(1))}
              >
                + Add a card
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function CardRow(props: {
  card: Card;
  list: List;
  number: number | null | undefined;
  editing: boolean;
  /** Set while this card is being dragged: it follows the pointer. */
  lift: Drag | null;
  renaming: boolean;
  onRenamed: (v: string | null) => void;
  onDelete: () => void;
  onPointerDown: (e: RPointerEvent) => void;
}) {
  const { card, list } = props;
  const kind = card.kind === "divider" || card.kind === "note" ? card.kind : "normal";
  const accent = colorOf(card.color) ?? (kind === "note" ? PALETTE.yellow : colorOf(list.color));
  return (
    <div
      className="gb-card"
      data-card-id={card.id}
      data-kind={kind}
      data-lifted={props.lift ? true : undefined}
      style={{ "--card-accent": accent ?? "transparent", transform: props.lift ? `translate(${props.lift.dx}px, ${props.lift.dy}px)` : undefined } as CSSProperties}
      onPointerDown={props.onPointerDown}
    >
      {props.number != null && <span className="gb-num">{props.number}</span>}
      {props.renaming ? (
        <TitleEditor initial={card.title} onDone={props.onRenamed} />
      ) : (
        <span className="gb-title">{card.title || " "}</span>
      )}
      {props.editing && !props.renaming && (
        <button
          className="gb-del"
          aria-label="Delete card"
          title="Delete (goes to Boardkit's trash)"
          onPointerDown={(e) => e.stopPropagation()}
          // Never takes the keys: they stay with the whiteboard.
          onMouseDown={(e) => e.preventDefault()}
          onClick={props.onDelete}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** A text field for a title. Enter or leaving it saves; Escape cancels
    (`null`). Keys stay inside it, away from the whiteboard's shortcuts. */
function TitleEditor({ initial, placeholder, onDone }: { initial: string; placeholder?: string; onDone: (value: string | null, how: "enter" | "blur" | "escape") => void }) {
  const editor = useEditor();
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const finish = (v: string | null, how: "enter" | "blur" | "escape") => {
    if (done.current) return;
    done.current = true;
    // Keys go back to the whiteboard (else to the page, where tldraw
    // wouldn't hear the next Escape).
    if (how !== "blur") editor.getContainer().focus({ preventScroll: true });
    onDone(v, how);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
    // tldraw listens for keys natively on its container, which hears them
    // before React does: stop them here, on the field itself, or Escape
    // would also end editing the board.
    // (That also keeps them from React, so Enter and Escape are read here.)
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        finishRef.current(el.value, "enter");
      } else if (e.key === "Escape") {
        e.preventDefault();
        finishRef.current(null, "escape");
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="gb-input"
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, " "))}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => finish(value, "blur")}
    />
  );
}
