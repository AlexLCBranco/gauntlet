import { describe, expect, it } from "vitest";

import { apply, cardNumbers, findCard, MAX_CARDS_PER_LIST, newCardId, readBoard, registryBoards, TRASH_LIMIT, writeBoard, type Board, type Change } from "./record";

/** A stored record as Boardkit writes it, with fields the whiteboard
    doesn't know (they must survive every write). */
function stored(over: Partial<Record<string, unknown>> = {}) {
  return {
    version: 2,
    rev: 7,
    futureTopLevel: { keep: true },
    board: {
      lists: { a: { id: "a", title: "A", color: "red", icon: "star" }, b: { id: "b", title: "B", continuesNumbering: true } },
      cards: {
        c1: { id: "c1", title: "one", description: "pregame" },
        c2: { id: "c2", title: "two", kind: "divider" },
        c3: { id: "c3", title: "three" },
        c4: { id: "c4", title: "four", postgameDescription: "post" },
        gone: { id: "gone", title: "in the trash" },
      },
      listOrder: ["a", "b"],
      cardOrder: { a: ["c1", "c2", "c3"], b: ["c4"] },
      trash: [{ cardId: "gone", listId: "a", deletedAt: 1 }],
      trashedLists: [],
      background: { kind: "color", color: "blue" },
      linkkitOnly: { view: 1 },
      ...over,
    },
  };
}

const ok = (raw: unknown) => {
  const r = readBoard(JSON.stringify(raw));
  if (r.status !== "ok") throw new Error(r.status);
  return r;
};
const board = () => ok(stored()).board;
const run = (b: Board, c: Change) => {
  const r = apply(b, c);
  if (!r) throw new Error("did not apply");
  return r;
};

describe("reading", () => {
  it("reads a Boardkit record, with its rev", () => {
    const r = ok(stored());
    expect(r.rev).toBe(7);
    expect(r.board.listOrder).toEqual(["a", "b"]);
  });
  it("tells missing, damaged and newer records apart", () => {
    expect(readBoard(null).status).toBe("missing");
    expect(readBoard("{oops").status).toBe("damaged");
    expect(readBoard(JSON.stringify({ version: 3, board: {} })).status).toBe("newer");
    expect(readBoard(JSON.stringify(stored({ cardOrder: { a: ["c1", "nope"], b: [] } }))).status).toBe("damaged");
    expect(readBoard(JSON.stringify(stored({ listOrder: ["a", "zz"] }))).status).toBe("damaged");
    expect(readBoard(JSON.stringify({ version: 2, rev: 1 })).status).toBe("damaged");
  });
  it("reads a version 1 record (no rev) as rev 0", () => {
    const { rev, ...v1 } = stored();
    expect(rev).toBe(7);
    expect(ok({ ...v1, version: 1 }).rev).toBe(0);
  });
});

describe("writing", () => {
  it("raises rev by one and keeps every field it didn't change", () => {
    const r = ok(stored());
    const changed = run(r.board, { kind: "renameCard", cardId: "c1", title: "uno" }).board;
    const out = JSON.parse(writeBoard(r.record, changed, r.rev));
    expect(out.rev).toBe(8);
    expect(out.version).toBe(2);
    expect(out.futureTopLevel).toEqual({ keep: true });
    expect(out.board.linkkitOnly).toEqual({ view: 1 });
    expect(out.board.background).toEqual({ kind: "color", color: "blue" });
    expect(out.board.lists.a.icon).toBe("star");
    expect(out.board.cards.c1).toEqual({ id: "c1", title: "uno", description: "pregame" });
    expect(out.board.trash).toEqual(stored().board.trash);
  });
});

describe("numbers", () => {
  it("skips dividers and continues into a list set to continue", () => {
    expect(cardNumbers(board())).toEqual({ c1: 1, c2: null, c3: 2, c4: 3 });
  });
  it("hides a list's numbers but keeps counting", () => {
    const b = ok(stored({ lists: { a: { id: "a", title: "A", numbersHidden: true }, b: { id: "b", title: "B", continuesNumbering: true } } })).board;
    expect(cardNumbers(b)).toEqual({ c1: null, c2: null, c3: null, c4: 3 });
  });
});

describe("changes and their undo", () => {
  it("renames a card and a list", () => {
    const r = run(board(), { kind: "renameCard", cardId: "c3", title: "3!" });
    expect(r.board.cards.c3.title).toBe("3!");
    expect(run(r.board, r.undo).board.cards.c3.title).toBe("three");
    const l = run(board(), { kind: "renameList", listId: "b", title: "Bee" });
    expect(l.board.lists.b.title).toBe("Bee");
    expect(run(l.board, l.undo).board.lists.b.title).toBe("B");
  });
  it("adds a card where asked; its undo removes it for good", () => {
    const r = run(board(), { kind: "addCard", listId: "a", index: 1, card: { id: "new", title: "new" } });
    expect(r.board.cardOrder.a).toEqual(["c1", "new", "c2", "c3"]);
    const back = run(r.board, r.undo).board;
    expect(back.cardOrder.a).toEqual(["c1", "c2", "c3"]);
    expect(back.cards.new).toBeUndefined();
  });
  it("moves a card inside its list and across lists", () => {
    const down = run(board(), { kind: "moveCard", cardId: "c1", toList: "a", index: 2 });
    expect(down.board.cardOrder.a).toEqual(["c2", "c3", "c1"]);
    expect(run(down.board, down.undo).board.cardOrder.a).toEqual(["c1", "c2", "c3"]);
    const across = run(board(), { kind: "moveCard", cardId: "c3", toList: "b", index: 0 });
    expect(across.board.cardOrder).toEqual({ a: ["c1", "c2"], b: ["c3", "c4"] });
    expect(run(across.board, across.undo).board.cardOrder).toEqual({ a: ["c1", "c2", "c3"], b: ["c4"] });
  });
  it("a move to the same place is no change", () => {
    expect(apply(board(), { kind: "moveCard", cardId: "c2", toList: "a", index: 1 })).toBeNull();
  });
  it("deletes into Boardkit's trash with the neighbours, and undo restores it in place", () => {
    const r = run(board(), { kind: "trashCard", cardId: "c2", at: 99 });
    expect(r.board.cardOrder.a).toEqual(["c1", "c3"]);
    expect(r.board.cards.c2).toBeDefined();
    expect(r.board.trash.at(-1)).toEqual({ cardId: "c2", listId: "a", deletedAt: 99, prevCardId: "c1", nextCardId: "c3" });
    const back = run(r.board, r.undo).board;
    expect(back.cardOrder.a).toEqual(["c1", "c2", "c3"]);
    expect(back.trash).toEqual(board().trash);
  });
  it("undo of a delete does nothing once Boardkit has restored the card itself", () => {
    const r = run(board(), { kind: "trashCard", cardId: "c2", at: 99 });
    const restoredInBoardkit = run(r.board, r.undo).board;
    expect(apply(restoredInBoardkit, r.undo)).toBeNull();
  });
  it("refuses a delete when the trash is full, rather than forget a card", () => {
    const trash = Array.from({ length: TRASH_LIMIT }, (_, i) => ({ cardId: "gone", listId: "a", deletedAt: i }));
    expect(apply(ok(stored({ trash })).board, { kind: "trashCard", cardId: "c1", at: 1 })).toBeNull();
  });
  it("never fills a list past Boardkit's limit", () => {
    const ids = Array.from({ length: MAX_CARDS_PER_LIST }, (_, i) => `f${i}`);
    const full = ok(stored({ cards: { ...stored().board.cards, ...Object.fromEntries(ids.map((id) => [id, { id, title: id }])) }, cardOrder: { a: ["c1", "c2", "c3"], b: ids } })).board;
    expect(apply(full, { kind: "addCard", listId: "b", index: 0, card: { id: "x", title: "x" } })).toBeNull();
    expect(apply(full, { kind: "moveCard", cardId: "c1", toList: "b", index: 0 })).toBeNull();
  });
  it("a change to a card Boardkit has since deleted does nothing", () => {
    expect(apply(board(), { kind: "renameCard", cardId: "gone", title: "x" })).toBeNull();
    expect(apply(board(), { kind: "moveCard", cardId: "nope", toList: "a", index: 0 })).toBeNull();
  });
  it("finds a card", () => {
    expect(findCard(board(), "c4")).toEqual({ listId: "b", index: 0 });
    expect(findCard(board(), "gone")).toBeNull();
  });
});

it("makes Boardkit-shaped card ids", () => {
  expect(newCardId()).toMatch(/^[A-Za-z0-9_-]{10}$/);
  expect(newCardId()).not.toBe(newCardId());
});

it("lists the registry's boards", () => {
  expect(registryBoards(JSON.stringify({ boards: [{ id: "x", name: "X" }, { id: "y", name: " " }, { nope: 1 }] }))).toEqual([
    { id: "x", name: "X" },
    { id: "y", name: "Untitled" },
  ]);
  expect(registryBoards("{")).toEqual([]);
});
