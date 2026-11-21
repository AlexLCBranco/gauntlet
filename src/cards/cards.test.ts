import { describe, expect, it } from "vitest";
import type { TLShapeId } from "tldraw";

import { boardOrCards } from "./brush";
import { landingOrder, placeAmong } from "./drop";
import { cardChanges, type DrawnCard } from "./sync";

const id = (s: string) => `shape:${s}` as TLShapeId;
const idOf = (cardId: string) => id(`card-b-${cardId}`);
const drawn = (cardId: string, y: number): DrawnCard => ({ cardId, x: 10, y, w: 100, h: 30 });
const have = (cardId: string, y: number, shapeId = idOf(cardId), boardId = "B") => ({ id: shapeId, cardId, boardId, x: 10, y, w: 100, h: 30 });

describe("cardChanges", () => {
  it("leaves card objects that are where their cards are drawn", () => {
    expect(cardChanges([have("a", 0), have("b", 40)], [drawn("a", 0.2), drawn("b", 40)], "B", idOf)).toEqual({ remove: [], add: [], move: [] });
  });

  it("adds an object for a new card, removes one whose card is gone, moves one whose card moved", () => {
    const changes = cardChanges([have("a", 0), have("gone", 40)], [drawn("a", 80), drawn("new", 0)], "B", idOf);
    expect(changes.remove).toEqual([idOf("gone")]);
    expect(changes.add).toEqual([drawn("new", 0)]);
    expect(changes.move).toEqual([{ ...drawn("a", 80), id: idOf("a") }]);
  });

  it("removes a stray copy of a card object (a duplicate has another id)", () => {
    const changes = cardChanges([have("a", 0), have("a", 0, id("copy"))], [drawn("a", 0)], "B", idOf);
    expect(changes).toEqual({ remove: [id("copy")], add: [], move: [] });
  });

  it("updates an object whose board record changed (a widget shown another board)", () => {
    expect(cardChanges([have("a", 0, idOf("a"), "old")], [drawn("a", 0)], "B", idOf).move).toHaveLength(1);
  });
});

describe("placeAmong", () => {
  const middles = [20, 60, 100];
  it("lands before the first card whose middle is below the pointer", () => {
    expect(placeAmong(middles, 5)).toBe(0);
    expect(placeAmong(middles, 21)).toBe(1);
    expect(placeAmong(middles, 99)).toBe(2);
  });
  it("lands at the bottom below every card, and at the top of an empty list", () => {
    expect(placeAmong(middles, 500)).toBe(3);
    expect(placeAmong([], 50)).toBe(0);
  });
});

describe("boardOrCards", () => {
  const board = id("board");
  const [a, b, other] = [id("a"), id("b"), id("rect")];
  const parent = (shape: TLShapeId) => (shape === a || shape === b ? board : null);

  it("a box that holds the whole board picks the board, not its cards", () => {
    expect(boardOrCards([board, a, b, other], parent, () => true)).toEqual([board, other]);
  });
  it("a box that holds only some cards picks those cards, not the board", () => {
    expect(boardOrCards([board, a, other], parent, () => false)).toEqual([a, other]);
  });
  it("leaves cards picked without their board, and a board picked without cards", () => {
    expect(boardOrCards([a, b], parent, () => false)).toEqual([a, b]);
    expect(boardOrCards([board, other], parent, () => false)).toEqual([board, other]);
  });
});

describe("landingOrder", () => {
  it("orders cards dropped together top to bottom, then left to right", () => {
    const at = (name: string, x: number, y: number) => ({ name, x, y });
    expect(landingOrder([at("c", 5, 90), at("b", 40, 10), at("a", 0, 10)]).map((s) => s.name)).toEqual(["a", "b", "c"]);
  });
});
