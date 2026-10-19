import { expect, test } from "vitest";

import { registryBoards } from "./registry";

test("registryBoards reads Boardkit's board list, skipping broken entries", () => {
  expect(registryBoards(JSON.stringify({ boards: [{ id: "x", name: "X" }, { id: "y", name: " " }, { nope: 1 }] }))).toEqual([
    { id: "x", name: "X" },
    { id: "y", name: "Untitled" },
  ]);
  expect(registryBoards("{")).toEqual([]);
  expect(registryBoards(null)).toEqual([]);
});
