import { describe, expect, it } from "vitest";

import {
  addPage,
  addStone,
  clampRect,
  commit,
  currentPage,
  emptyLayout,
  geometry,
  historyOf,
  isNear,
  jumpTarget,
  MIN_H,
  MIN_W,
  movePage,
  moveRect,
  pageTop,
  placeNew,
  readLayout,
  redo,
  removePage,
  removeStone,
  resizeRect,
  setRect,
  undo,
  type Layout,
} from "./layout";

const stone = (id: string) => ({ id, app: "boardkit" as const, itemId: `b-${id}`, name: id });
const threePages = (): Layout => addPage(addPage(addStone(emptyLayout("p0"), 0, stone("s1")), "p1"), "p2");

describe("frames stay inside their page", () => {
  it("moving stops at every edge", () => {
    const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    expect(moveRect(r, 1, 1)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(moveRect(r, -1, -1)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
    expect(moveRect(r, 0.1, 0)).toEqual({ x: 0.30000000000000004, y: 0.2, w: 0.5, h: 0.5 });
  });

  it("resizing stops at the page edge and at the minimum size, the top-left corner stays", () => {
    const r = { x: 0.6, y: 0.5, w: 0.2, h: 0.2 };
    expect(resizeRect(r, "se", 1, 1)).toEqual({ x: 0.6, y: 0.5, w: 0.4, h: 0.5 });
    expect(resizeRect(r, "se", -1, -1)).toEqual({ x: 0.6, y: 0.5, w: MIN_W, h: MIN_H });
    expect(resizeRect(r, "e", 0.1, 0.3)).toEqual({ x: 0.6, y: 0.5, w: 0.30000000000000004, h: 0.2 });
    expect(resizeRect(r, "s", 0.3, 0.1)).toEqual({ x: 0.6, y: 0.5, w: 0.2, h: 0.30000000000000004 });
  });

  it("a stored frame out of bounds comes back in, size first", () => {
    expect(clampRect({ x: 0.9, y: -0.2, w: 2, h: 0.01 })).toEqual({ x: 0, y: 0, w: 1, h: MIN_H });
    expect(clampRect({ x: 0.9, y: 0.95, w: 0.3, h: 0.3 })).toEqual({ x: 0.7, y: 0.7, w: 0.3, h: 0.3 });
  });

  it("setRect clamps too", () => {
    const l = setRect(addStone(emptyLayout("p"), 0, stone("a")), "a", { x: 0.8, y: 0, w: 0.5, h: 0.5 });
    expect(l.pages[0].stones[0]).toMatchObject({ x: 0.5, w: 0.5 });
  });
});

describe("new stones", () => {
  it("fill the left half, then the right half, then cascade", () => {
    const first = placeNew([]);
    expect(first.x).toBeLessThan(0.5);
    const second = placeNew([first]);
    expect(second.x).toBeGreaterThan(0.5);
    const third = placeNew([first, second]);
    expect(third).toEqual(clampRect(third));
    expect(third).not.toEqual(first);
  });

  it("go on the page asked for", () => {
    const l = addStone(threePages(), 2, stone("s2"));
    expect(l.pages[2].stones.map((s) => s.id)).toEqual(["s2"]);
    expect(l.pages[0].stones.map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("page geometry and jumps", () => {
  // 1400 × 900 window: the page is limited by the width.
  const g = geometry(1400, 900);

  it("pages are 16:9 and fit the viewport with a margin", () => {
    expect(g.pageW).toBe(1352);
    expect(g.pageH).toBe(Math.round(1352 * 9 / 16));
    expect(g.pitch).toBe(g.pageH + 24);
    const tall = geometry(1920, 700);
    expect(tall.pageH).toBeLessThanOrEqual(700 - 48);
    expect(tall.pageW / tall.pageH).toBeCloseTo(16 / 9, 2);
  });

  it("from an aligned page, a jump lands exactly on the next or previous", () => {
    expect(jumpTarget(g, pageTop(g, 0), 1, 3)).toBe(1);
    expect(jumpTarget(g, pageTop(g, 1), 1, 3)).toBe(2);
    expect(jumpTarget(g, pageTop(g, 1), -1, 3)).toBe(0);
    // A pixel or so off still counts as aligned.
    expect(jumpTarget(g, pageTop(g, 1) + 1, 1, 3)).toBe(2);
  });

  it("from part way into a page, up goes back to its top and down to the next", () => {
    const mid = pageTop(g, 1) + g.pitch * 0.4;
    expect(jumpTarget(g, mid, -1, 3)).toBe(1);
    expect(jumpTarget(g, mid, 1, 3)).toBe(2);
  });

  it("stops at the first and last page", () => {
    expect(jumpTarget(g, 0, -1, 3)).toBe(0);
    expect(jumpTarget(g, pageTop(g, 2), 1, 3)).toBe(2);
  });

  it("the current page is the one under the middle of the viewport", () => {
    expect(currentPage(g, 0, 900, 3)).toBe(0);
    expect(currentPage(g, pageTop(g, 2), 900, 3)).toBe(2);
    expect(currentPage(g, 99_999, 900, 3)).toBe(2);
  });

  it("the current page and its neighbours count as near", () => {
    expect([0, 1, 2, 3, 4].map((i) => isNear(i, 2))).toEqual([false, true, true, true, false]);
  });
});

describe("pages", () => {
  it("reorder carries their stones", () => {
    const l = movePage(threePages(), 0, 2);
    expect(l.pages.map((p) => p.id)).toEqual(["p1", "p2", "p0"]);
    expect(l.pages[2].stones.map((s) => s.id)).toEqual(["s1"]);
    expect(movePage(l, 2, 0).pages.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
    expect(movePage(l, 0, 9)).toBe(l);
  });

  it("removing the last page leaves one empty page", () => {
    const one = addStone(emptyLayout("p"), 0, stone("a"));
    expect(removePage(one, 0).pages).toEqual([{ id: "p", stones: [] }]);
    expect(removePage(threePages(), 1).pages.map((p) => p.id)).toEqual(["p0", "p2"]);
  });

  it("removing a stone", () => {
    expect(removeStone(threePages(), "s1").pages[0].stones).toEqual([]);
  });
});

describe("undo and redo", () => {
  it("steps back and forward through canvas actions", () => {
    const a = emptyLayout("p");
    const b = addPage(a, "q");
    const c = addStone(b, 1, stone("s"));
    let h = commit(commit(historyOf(a), b), c);
    h = undo(h);
    expect(h.present).toBe(b);
    h = undo(h);
    expect(h.present).toBe(a);
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present).toBe(b);
    // A new action drops what could be redone.
    const d = addPage(b, "r");
    h = commit(h, d);
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
  });

  it("no change, no entry", () => {
    const h = historyOf(emptyLayout("p"));
    expect(commit(h, h.present)).toBe(h);
  });

  it("keeps the last 100 steps", () => {
    let h = historyOf(emptyLayout("p0"));
    for (let i = 1; i <= 150; i++) h = commit(h, addPage(h.present, `p${i}`));
    expect(h.past).toHaveLength(100);
  });
});

describe("reading the saved layout", () => {
  it("round-trips", () => {
    const l = threePages();
    expect(readLayout(JSON.stringify(l))).toEqual(l);
  });

  it("refuses nothing, junk and unknown versions", () => {
    expect(readLayout(null)).toBeNull();
    expect(readLayout("{nope")).toBeNull();
    expect(readLayout(JSON.stringify({ version: 2, pages: [] }))).toBeNull();
    expect(readLayout(JSON.stringify({ version: 1, pages: [] }))).toBeNull();
  });

  it("drops bad stones, keeps the rest, clamped", () => {
    const raw = JSON.stringify({
      version: 1,
      pages: [
        {
          id: "p",
          stones: [
            { id: "ok", app: "linkkit", itemId: "m", name: "M", x: 0.9, y: 0, w: 0.5, h: 0.5 },
            { id: "bad-app", app: "other", itemId: "m", x: 0, y: 0, w: 0.5, h: 0.5 },
            { id: "bad-rect", app: "linkkit", itemId: "m", x: "0", y: 0, w: 0.5, h: 0.5 },
          ],
        },
        { id: 5, stones: [] },
      ],
    });
    const l = readLayout(raw)!;
    expect(l.pages).toHaveLength(1);
    expect(l.pages[0].stones).toEqual([{ id: "ok", app: "linkkit", itemId: "m", name: "M", x: 0.5, y: 0, w: 0.5, h: 0.5 }]);
  });
});
