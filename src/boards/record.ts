// A Boardkit board, read and changed in Boardkit's own stored format
// (`boardkit:board:<id>`, version 2; Boardkit `src/domain/types.ts` and
// `persistence.ts`). Pure, no tldraw, no storage; tested in record.test.ts.
//
// The whiteboard edits the very record /boardkit uses (PROJECT.md,
// DECISIONS). So every change here keeps what it doesn't touch exactly as
// it was: unknown fields, other lists and cards, the trash. Boardkit and
// Linkkit merge a write in by its `rev`, which each write raises by one.

export type ListId = string;
export type CardId = string;

export interface Card {
  readonly id: CardId;
  readonly title: string;
  /** Absent: a normal card. */
  readonly kind?: "divider" | "note" | string;
  readonly color?: string;
  readonly [field: string]: unknown;
}

export interface List {
  readonly id: ListId;
  readonly title: string;
  readonly color?: string;
  readonly width?: number;
  readonly continuesNumbering?: boolean;
  readonly numbersHidden?: boolean;
  readonly [field: string]: unknown;
}

export interface TrashEntry {
  readonly cardId: CardId;
  readonly listId: ListId;
  readonly deletedAt: number;
  readonly prevCardId?: CardId | null;
  readonly nextCardId?: CardId | null;
}

export interface Board {
  readonly lists: Readonly<Record<ListId, List>>;
  readonly cards: Readonly<Record<CardId, Card>>;
  readonly listOrder: readonly ListId[];
  readonly cardOrder: Readonly<Record<ListId, readonly CardId[]>>;
  readonly trash: readonly TrashEntry[];
  readonly collapsedLists?: Readonly<Record<ListId, true>>;
  readonly [field: string]: unknown;
}

/** The version Boardkit writes today. A newer one is never written over. */
export const SCHEMA_VERSION = 2;
/** Boardkit's limits (`domain/limits.ts`, `domain/trash.ts`). */
export const MAX_CARDS_PER_LIST = 50;
export const TRASH_LIMIT = 200;

export const boardKey = (id: string) => `boardkit:board:${id}`;
export const REGISTRY_KEY = "boardkit:registry";

export type Read =
  | { status: "ok"; board: Board; rev: number; record: Record<string, unknown> }
  /** No record (never made, or deleted in Boardkit). */
  | { status: "missing" }
  /** Something Boardkit itself would have to repair: shown read-only. */
  | { status: "damaged" }
  /** Written by a newer Boardkit: shown read-only, never written. */
  | { status: "newer" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** A record's `rev` (0 when absent, as Boardkit reads version 1). */
export function revOf(record: unknown): number {
  const rev = isObj(record) ? record.rev : undefined;
  return typeof rev === "number" && Number.isSafeInteger(rev) && rev >= 0 ? rev : 0;
}

/** Reads a stored record. Anything Boardkit would need to repair (an order
    naming a list or card that isn't there, a missing container) reads as
    damaged: the whiteboard shows it but leaves fixing it to Boardkit. */
export function readBoard(raw: string | null): Read {
  if (raw === null) return { status: "missing" };
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return { status: "damaged" };
  }
  if (!isObj(record)) return { status: "damaged" };
  if (typeof record.version === "number" && record.version > SCHEMA_VERSION) return { status: "newer" };
  const b = record.board;
  if (!isObj(b) || !isObj(b.lists) || !isObj(b.cards) || !isStrArray(b.listOrder) || !isObj(b.cardOrder)) return { status: "damaged" };
  for (const id of b.listOrder) {
    const order = b.cardOrder[id];
    if (!isObj(b.lists[id]) || !isStrArray(order)) return { status: "damaged" };
    if (order.some((c) => !isObj(b.cards[c]))) return { status: "damaged" };
  }
  const board = { ...b, trash: Array.isArray(b.trash) ? b.trash : [] } as unknown as Board;
  return { status: "ok", board, rev: revOf(record), record };
}

/** The record to store after a change: `rev` one above the stored one,
    every field the change didn't touch kept. */
export function writeBoard(record: Record<string, unknown>, board: Board, storedRev: number): string {
  return JSON.stringify({ ...record, version: SCHEMA_VERSION, rev: storedRev + 1, board });
}

/** Where a card sits: its list and index, or null. */
export function findCard(board: Board, cardId: CardId): { listId: ListId; index: number } | null {
  for (const listId of board.listOrder) {
    const index = board.cardOrder[listId]?.indexOf(cardId) ?? -1;
    if (index >= 0) return { listId, index };
  }
  return null;
}

// ---- Card numbers (Boardkit `domain/numbering.ts`) ----

const numbered = (card: Card | undefined) => !!card && (card.kind === undefined || card.kind === "normal");

/** Each shown card's number, or null for an unnumbered card (a divider, a
    note, or a list with numbers hidden). A list that continues numbering
    starts after the list to its left, chained. */
export function cardNumbers(board: Board): Record<CardId, number | null> {
  const out: Record<CardId, number | null> = {};
  let running = 0;
  for (const listId of board.listOrder) {
    const list = board.lists[listId];
    let n = list?.continuesNumbering ? running : 0;
    for (const id of board.cardOrder[listId] ?? []) {
      if (numbered(board.cards[id])) {
        n += 1;
        out[id] = list?.numbersHidden ? null : n;
      } else out[id] = null;
    }
    running = n;
  }
  return out;
}

// ---- Changes ----
//
// Each change takes the newest stored board and returns the changed board
// and the change that undoes it (applied later to whatever is stored then),
// or null when it can't apply (the card is gone, the list is full).

export type Change =
  | { kind: "renameCard"; cardId: CardId; title: string }
  | { kind: "renameList"; listId: ListId; title: string }
  | { kind: "addCard"; listId: ListId; index: number; card: Card }
  | { kind: "moveCard"; cardId: CardId; toList: ListId; index: number }
  | { kind: "trashCard"; cardId: CardId; at: number }
  /** Undo of `trashCard`: takes the card back out of the trash, to `index`. */
  | { kind: "restoreCard"; cardId: CardId; listId: ListId; index: number }
  /** Undo of `addCard`: removes a card the whiteboard just made, for good. */
  | { kind: "removeCard"; cardId: CardId };

export type Applied = { board: Board; undo: Change };

const clampIndex = (i: number, len: number) => Math.max(0, Math.min(len, Math.round(i)));

function withOrder(board: Board, listId: ListId, order: readonly CardId[]): Board {
  return { ...board, cardOrder: { ...board.cardOrder, [listId]: order } };
}

export function apply(board: Board, change: Change): Applied | null {
  switch (change.kind) {
    case "renameCard": {
      const card = board.cards[change.cardId];
      if (!card || !findCard(board, change.cardId) || card.title === change.title) return null;
      return {
        board: { ...board, cards: { ...board.cards, [card.id]: { ...card, title: change.title } } },
        undo: { kind: "renameCard", cardId: card.id, title: card.title },
      };
    }
    case "renameList": {
      const list = board.lists[change.listId];
      if (!list || !board.listOrder.includes(list.id) || list.title === change.title) return null;
      return {
        board: { ...board, lists: { ...board.lists, [list.id]: { ...list, title: change.title } } },
        undo: { kind: "renameList", listId: list.id, title: list.title },
      };
    }
    case "addCard": {
      const order = board.cardOrder[change.listId];
      if (!order || !board.listOrder.includes(change.listId) || order.length >= MAX_CARDS_PER_LIST) return null;
      if (board.cards[change.card.id]) return null;
      const next = [...order];
      next.splice(clampIndex(change.index, order.length), 0, change.card.id);
      return {
        board: withOrder({ ...board, cards: { ...board.cards, [change.card.id]: change.card } }, change.listId, next),
        undo: { kind: "removeCard", cardId: change.card.id },
      };
    }
    case "removeCard": {
      const at = findCard(board, change.cardId);
      const card = board.cards[change.cardId];
      if (!at || !card) return null;
      const cards = { ...board.cards };
      delete cards[change.cardId];
      return {
        board: withOrder({ ...board, cards }, at.listId, board.cardOrder[at.listId].filter((id) => id !== change.cardId)),
        undo: { kind: "addCard", listId: at.listId, index: at.index, card },
      };
    }
    case "moveCard": {
      const from = findCard(board, change.cardId);
      const target = board.cardOrder[change.toList];
      if (!from || !target || !board.listOrder.includes(change.toList)) return null;
      const same = from.listId === change.toList;
      if (!same && target.length >= MAX_CARDS_PER_LIST) return null;
      const without = board.cardOrder[from.listId].filter((id) => id !== change.cardId);
      const dest = same ? without : [...target];
      const index = clampIndex(change.index, dest.length);
      if (same && index === from.index) return null;
      dest.splice(index, 0, change.cardId);
      let next = withOrder(board, from.listId, without);
      next = withOrder(next, change.toList, dest);
      return { board: next, undo: { kind: "moveCard", cardId: change.cardId, toList: from.listId, index: from.index } };
    }
    case "trashCard": {
      // As Boardkit's `moveCardToTrash`, except that a full trash refuses
      // the delete instead of forgetting its oldest card (Boardkit warns
      // first; the whiteboard has no such dialog).
      const at = findCard(board, change.cardId);
      if (!at || board.trash.length >= TRASH_LIMIT) return null;
      const order = board.cardOrder[at.listId];
      const entry: TrashEntry = {
        cardId: change.cardId,
        listId: at.listId,
        deletedAt: change.at,
        prevCardId: at.index > 0 ? order[at.index - 1] : null,
        nextCardId: at.index < order.length - 1 ? order[at.index + 1] : null,
      };
      return {
        board: withOrder({ ...board, trash: [...board.trash, entry] }, at.listId, order.filter((id) => id !== change.cardId)),
        undo: { kind: "restoreCard", cardId: change.cardId, listId: at.listId, index: at.index },
      };
    }
    case "restoreCard": {
      const t = board.trash.findIndex((e) => e.cardId === change.cardId);
      const order = board.cardOrder[change.listId];
      if (t < 0 || !board.cards[change.cardId] || !order || !board.listOrder.includes(change.listId)) return null;
      if (order.length >= MAX_CARDS_PER_LIST || findCard(board, change.cardId)) return null;
      const next = [...order];
      next.splice(clampIndex(change.index, order.length), 0, change.cardId);
      const trash = board.trash.filter((_, i) => i !== t);
      return {
        board: withOrder({ ...board, trash }, change.listId, next),
        undo: { kind: "trashCard", cardId: change.cardId, at: board.trash[t].deletedAt },
      };
    }
  }
}

/** A new card id, as Boardkit makes them (10 characters of nanoid's alphabet). */
export function newCardId(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): CardId {
  const abc = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  return Array.from(random(10), (b) => abc[b & 63]).join("");
}

/** The boards Boardkit lists (`boardkit:registry`), in its order. */
export function registryBoards(raw: string | null): { id: string; name: string }[] {
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    return [];
  }
  const boards = isObj(data) ? data.boards : null;
  return Array.isArray(boards)
    ? boards
        .filter((b): b is { id: string; name?: unknown } => isObj(b) && typeof b.id === "string")
        .map((b) => ({ id: b.id, name: typeof b.name === "string" && b.name.trim() ? b.name : "Untitled" }))
    : [];
}
