import { beforeEach, expect, it } from "vitest";

import { boardKey } from "./record";
import { edit, redo, resetHistory, undo } from "./store";

const data = new Map<string, string>();
let refuse = false;
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (refuse) throw new Error("QuotaExceededError");
    data.set(k, v);
  },
};

const KEY = boardKey("b1");
const stored = () => JSON.parse(data.get(KEY)!);
const put = (board: object, rev: number) => data.set(KEY, JSON.stringify({ version: 2, rev, board }));

beforeEach(() => {
  refuse = false;
  resetHistory();
  put(
    {
      lists: { a: { id: "a", title: "A" } },
      cards: { c1: { id: "c1", title: "one" }, c2: { id: "c2", title: "two" } },
      listOrder: ["a"],
      cardOrder: { a: ["c1", "c2"] },
      trash: [],
    },
    3,
  );
});

it("an edit writes the newest record with rev + 1", () => {
  expect(edit("b1", { kind: "renameCard", cardId: "c1", title: "uno" })).toBe("ok");
  expect(stored().rev).toBe(4);
  expect(stored().board.cards.c1.title).toBe("uno");
});

it("undo keeps what Boardkit changed in between", () => {
  edit("b1", { kind: "renameCard", cardId: "c1", title: "uno" });
  // Boardkit renames the other card meanwhile.
  const s = stored();
  s.board.cards.c2.title = "dos";
  put(s.board, s.rev + 1);
  expect(undo("b1")).toBe("ok");
  expect(stored().board.cards.c1.title).toBe("one");
  expect(stored().board.cards.c2.title).toBe("dos");
  expect(stored().rev).toBe(6);
  expect(redo("b1")).toBe("ok");
  expect(stored().board.cards.c1.title).toBe("uno");
});

it("an undo that no longer applies (card deleted in Boardkit) changes nothing", () => {
  edit("b1", { kind: "moveCard", cardId: "c1", toList: "a", index: 1 });
  const s = stored();
  s.board.cardOrder.a = s.board.cardOrder.a.filter((id: string) => id !== "c1");
  put(s.board, s.rev + 1);
  const before = data.get(KEY);
  expect(undo("b1")).toBe("unchanged");
  expect(data.get(KEY)).toBe(before);
  expect(undo("b1")).toBe("unchanged");
});

it("never writes a board it can't read", () => {
  data.set(KEY, JSON.stringify({ version: 3, rev: 1, board: {} }));
  expect(edit("b1", { kind: "renameCard", cardId: "c1", title: "x" })).toBe("unchanged");
  expect(stored().version).toBe(3);
});

it("says so when storage refuses the write, and keeps no undo for it", () => {
  refuse = true;
  expect(edit("b1", { kind: "renameCard", cardId: "c1", title: "x" })).toBe("failed");
  refuse = false;
  expect(undo("b1")).toBe("unchanged");
  expect(stored().board.cards.c1.title).toBe("one");
});
