import { expect, test, type Page } from "./test";

import { seedBoard, whiteboardSaved, openBoardList } from "./helpers";

/**
 * Drawings made just before a reload or tab close are kept
 * (src/whiteboard/unsavedJournal.ts). tldraw saves to IndexedDB 350 ms
 * after a change; every reload and close here comes right after the change,
 * well inside that, with no wait for the save. Fresh, empty browser profile
 * per test. Actions go through the mouse and keyboard; `window.editor` is
 * read to check (and, in two marked places, to set up a state a person
 * can't make by hand).
 */

test.use({ viewport: { width: 1920, height: 1080 } });

const JOURNAL = "gauntlet:whiteboard:unsaved";

type Pt = { x: number; y: number };

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

async function reload(page: Page) {
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Runs `fn(editor)` in the page. */
const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) =>
  page.evaluate(([src, a]) => new Function("e", "a", `return (${src})(e, a)`)((window as any).editor, a), [fn.toString(), arg] as const) as Promise<T>;

const screen = (page: Page, p: Pt) => ed(page, (e, p: Pt) => e.pageToScreen(p), p);

async function drag(page: Page, from: Pt, to: Pt) {
  const a = await screen(page, from);
  const b = await screen(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

const shapeIds = (page: Page) => ed(page, (e) => e.getCurrentPageShapes().map((s: any) => s.id) as string[]);
const shapeOf = (page: Page, id: string) => ed(page, (e, id: string) => e.getShape(id) ?? null, id);
/** The whole drawing (every page, shape, binding, asset) as stored. */
const doc = (page: Page) => ed(page, (e) => e.store.serialize("document") as Record<string, any>);

/** A rectangle drawn with the "2" key and a drag; its id. Left selected. */
async function rect(page: Page, x: number, y: number, w = 120, h = 80): Promise<string> {
  const before = await shapeIds(page);
  await page.keyboard.press("2");
  await drag(page, { x, y }, { x: x + w, y: y + h });
  const added = (await shapeIds(page)).filter((id) => !before.includes(id));
  expect(added).toHaveLength(1);
  return added[0];
}

/** Clicks shape `id` with the select tool. */
async function pick(page: Page, id: string) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("v");
  const c = await ed(page, (e, id: string) => e.getShapePageBounds(id).center, id);
  const p = await screen(page, c);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => ed(page, (e) => e.getSelectedShapeIds())).toEqual([id]);
}

/** Shape `id` as tldraw has it in IndexedDB (null: not there). */
const storedShape = (page: Page, id: string) =>
  page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("TLDRAW_DOCUMENT_v2gauntlet-whiteboard");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const req = db.transaction("records").objectStore("records").get(id);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }, id);

/** Moves the selection with Shift+arrows (a big step each). */
async function nudge(page: Page, right: number, down: number) {
  for (let i = 0; i < right; i++) await page.keyboard.press("Shift+ArrowRight");
  for (let i = 0; i < down; i++) await page.keyboard.press("Shift+ArrowDown");
}

/** Fails the test on any page error or console error. */
function noErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on("console", (m) => {
    // The browser's own /favicon.ico request (there is none) can log a 404;
    // every other failed request is caught above, with its address.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text());
  });
  return errors;
}

test("a shape drawn right before a reload is still there", async ({ page }) => {
  const errors = noErrors(page);
  await open(page);
  // tldraw's own async flush on unload sometimes lands in time (it did in
  // 2 of 5 single tries on the old code): five in a row, each must stay.
  for (let i = 0; i < 5; i++) {
    await whiteboardSaved(page);
    // Drawn in one quick stroke (screen points worked out first), so the
    // reload comes well inside tldraw's 350 ms.
    const from = await screen(page, { x: 100 + i * 200, y: 200 });
    const to = await screen(page, { x: 220 + i * 200, y: 280 });
    const before = await shapeIds(page);
    await page.keyboard.press("2");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 2 });
    await page.mouse.up();
    const drawn = await doc(page);
    await reload(page);
    expect(await shapeIds(page), `try ${i + 1}`).toHaveLength(before.length + 1);
    expect(await doc(page)).toEqual(drawn);
    // Put back once only: the journal is gone, and tldraw saves the shape.
    expect(await page.evaluate((k) => localStorage.getItem(k), JOURNAL)).toBeNull();
  }
  await whiteboardSaved(page);
  expect(errors).toEqual([]);
});

test("a move, a style change and a delete right before a reload are kept", async ({ page }) => {
  await open(page);
  const a = await rect(page, 300, 200);
  const b = await rect(page, 700, 200);
  const c = await rect(page, 1100, 200);
  await page.keyboard.press("Escape");
  await whiteboardSaved(page);

  // Move: `a` nudged right and down.
  await pick(page, a);
  const from = (await shapeOf(page, a)) as { x: number; y: number };
  await nudge(page, 4, 6);
  const moved = await shapeOf(page, a);
  expect(moved.x).toBeGreaterThan(from.x + 20);
  expect(moved.y).toBeGreaterThan(from.y + 30);
  await reload(page);
  expect(await shapeOf(page, a)).toEqual(moved);

  // Edit: `b` turns blue.
  await pick(page, b);
  await page.getByTestId("stroke-blue").click();
  const blue = await shapeOf(page, b);
  expect(blue.props.color).toBe("blue");
  await reload(page);
  expect(await shapeOf(page, b)).toEqual(blue);

  // Delete: `c` goes.
  await pick(page, c);
  await page.keyboard.press("Delete");
  expect(await shapeIds(page)).not.toContain(c);
  await reload(page);
  expect((await shapeIds(page)).sort()).toEqual([a, b].sort());
});

test("a shape drawn right before the tab is closed is there in a new tab", async ({ page, context }) => {
  await open(page);
  const a = await rect(page, 300, 200);
  await page.keyboard.press("Escape");
  await whiteboardSaved(page);
  // A copy (Ctrl+D), then the tab is closed at once. tldraw's own flush
  // often lands on a close (4 of 5 single tries on the old code): ten in
  // a row, each must stay.
  let tab = page;
  for (let i = 0; i < 10; i++) {
    // A new tab isn't always the front one, and tldraw ignores keys then.
    await tab.bringToFront();
    // Duplicated through the editor, as Ctrl+D does: in the first fresh tab
    // under load the key press was sometimes dropped even with tldraw
    // focused (7 of 12 in parallel, 2026-10-21). The key isn't what this
    // tests; the journal is. (A click would pick the copy on top.)
    await ed(tab, (e, id: string) => void e.duplicateShapes([id]), a);
    await expect.poll(() => shapeIds(tab)).toHaveLength(i + 2);
    const drawn = await doc(tab);
    await tab.close();
    tab = await context.newPage();
    await open(tab);
    expect(await doc(tab), `try ${i + 1}`).toEqual(drawn);
    await whiteboardSaved(tab);
  }
});

test("two tabs: a change made in the other tab after this one closed wins over this tab's journal", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await open(a);
  await open(b);
  const moved = await rect(a, 300, 200);
  const gone = await rect(a, 700, 200);
  const kept = await rect(a, 1100, 200);
  // Tab B shows them at once (tldraw tells the other tabs).
  await expect.poll(() => shapeIds(b)).toHaveLength(3);
  // All three moved again just before the close, and B shown the move: the
  // journal keeps only the last 10 s of changes, and on a busy run drawing
  // the three took longer, so the first was left out.
  await a.keyboard.press("Control+a");
  await a.keyboard.press("Shift+ArrowRight");
  const places = (p: Page) => ed(p, (e) => e.getCurrentPageShapes().map((s: any) => [s.id, s.x, s.y]).sort());
  const nudged = await places(a);
  await expect.poll(() => places(b)).toEqual(nudged);
  await a.close();
  // A's journal has all three (one never saved by tldraw).
  await expect.poll(() => b.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k) ?? '{"records":{}}').records), JOURNAL)).toEqual(expect.arrayContaining([moved, gone, kept]));

  // Then B moves one and deletes another.
  await pick(b, moved);
  const from = (await shapeOf(b, moved)) as { x: number; y: number };
  await nudge(b, 0, 8);
  const inB = await shapeOf(b, moved);
  expect(inB.y).toBeGreaterThan(from.y + 40);
  await pick(b, gone);
  await b.keyboard.press("Delete");
  // tldraw in B saves B's own changes (not the shape only A drew and
  // never saved: that is only in A's journal, so whiteboardSaved can't
  // pass here).
  await expect.poll(() => storedShape(b, gone)).toBeNull();
  await expect.poll(() => storedShape(b, moved)).toEqual(inB);
  const keptInB = await shapeOf(b, kept);

  // A opens again: B's move and delete stand, the third shape is there.
  const again = await context.newPage();
  await open(again);
  expect((await shapeIds(again)).sort()).toEqual([moved, kept].sort());
  expect(await shapeOf(again, moved)).toEqual(inB);
  expect(await shapeOf(again, kept)).toEqual(keptInB);
  // And B still has the same.
  expect(await shapeOf(b, moved)).toEqual(inB);
  expect((await shapeIds(b)).sort()).toEqual([moved, kept].sort());
});

test("reloading twice in a row: the same drawing each time, nothing doubled", async ({ page }) => {
  await open(page);
  const a = await rect(page, 300, 200);
  await rect(page, 700, 200);
  await page.keyboard.press("Escape");
  await whiteboardSaved(page);
  // Then, in one quick go: a copy of `a` (Ctrl+D), moved; reloaded twice
  // at once. Three times.
  for (let i = 0; i < 3; i++) {
    await pick(page, a);
    await page.keyboard.press("Control+d");
    await nudge(page, 2, 2);
    expect(await shapeIds(page)).toHaveLength(3 + i);
    const drawn = await doc(page);
    await reload(page);
    expect(await doc(page), `try ${i + 1}, first reload`).toEqual(drawn);
    await reload(page);
    expect(await doc(page), `try ${i + 1}, second reload`).toEqual(drawn);
    await whiteboardSaved(page);
    await reload(page);
    expect(await doc(page)).toEqual(drawn);
  }
});

test("a board moved right before a reload comes back moved and unchanged, and Boardkit's data is untouched", async ({ page, context }) => {
  const id = await seedBoard(context);
  await open(page);
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${id}"]`).click();
  const board = page.locator(".tl-html-container [data-boardkit-board]").first();
  await expect(board).toBeVisible();
  const boardShape = () => ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board") ?? null);
  await expect.poll(async () => (await boardShape())?.props.scale ?? 0).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  // Top left, so there is room to move it (set up by hand).
  await ed(page, (e) => {
    const s = e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board");
    e.updateShape({ id: s.id, type: s.type, x: 20, y: 20 });
  });
  await whiteboardSaved(page);
  await pick(page, (await boardShape()).id);
  const stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("boardkit:")).map((k) => [k, localStorage.getItem(k)])));

  // Nudge it with Shift+arrows (10 a press), then reload at once.
  const s = await boardShape();
  await nudge(page, 1, 1);
  const moved = await boardShape();
  expect(moved.x).toBeGreaterThan(s.x + 5);
  expect(moved.y).toBeGreaterThan(s.y + 5);
  await reload(page);
  expect(await boardShape()).toEqual(moved);
  await expect(page.locator(".tl-html-container [data-boardkit-board] article[data-card-id]").first()).toBeVisible();
  expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("boardkit:")).map((k) => [k, localStorage.getItem(k)])))).toEqual(stored);
});

test("a journal for a page that is gone: its shapes are skipped, the rest is kept, no error", async ({ page, context }) => {
  const errors = noErrors(page);
  await open(page);
  const first = await rect(page, 100, 100);
  await page.keyboard.press("Escape");
  await whiteboardSaved(page);

  // Tab B makes page 2, draws on it, and is closed at once; then this tab
  // deletes page 2 while B's journal waits.
  const b = await context.newPage();
  await open(b);
  await b.getByRole("button", { name: "Next page" }).click();
  await expect(b.getByTestId("page-position")).toHaveText(/2 \/ 2/);
  const page2 = await ed(b, (e) => e.getCurrentPageId() as string);
  const onPage2 = await rect(b, 300, 300);
  await b.close();
  await expect.poll(() => page.evaluate(([k, id]) => localStorage.getItem(k)?.includes(id) ?? false, [JOURNAL, onPage2] as const)).toBe(true);
  await ed(page, (e, id: string) => void e.deletePage(id), page2);
  await whiteboardSaved(page);
  await reload(page);
  expect(await ed(page, (e) => e.getPages().length)).toBe(1);
  expect(await ed(page, (e, id: string) => e.getShape(id) ?? null, onPage2)).toBeNull();
  expect(await shapeIds(page)).toEqual([first]);

  // A journal that names a page nobody has (set up by hand, as a tab
  // closed before a delete reached it would leave): that shape is skipped,
  // the other change is kept.
  const stored = await doc(page);
  const journal = await ed(page, (e, id: string) => {
    const s = e.getShape(id);
    return JSON.stringify({
      schema: JSON.stringify(e.store.schema.serialize()),
      records: {
        [id]: { ...s, x: s.x + 50 },
        "shape:orphan": { ...s, id: "shape:orphan", parentId: "page:never-there" },
      },
    });
  }, first);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [JOURNAL, journal]);
  await reload(page);
  expect(await shapeIds(page)).toEqual([first]);
  expect(await ed(page, (e) => e.getShape("shape:orphan") ?? null)).toBeNull();
  expect((await doc(page))[first].x).toBe(stored[first].x + 50);
  expect(await page.evaluate((k) => localStorage.getItem(k), JOURNAL)).toBeNull();
  // Still works: draw, undo.
  await rect(page, 600, 300);
  expect(await shapeIds(page)).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("localStorage failing (full, or a broken journal) never stops the whiteboard opening", async ({ page }) => {
  const errors = noErrors(page);
  // A broken journal: opens as saved, and the journal is cleared.
  await open(page);
  const a = await rect(page, 300, 200);
  await page.keyboard.press("Escape");
  await whiteboardSaved(page);
  const stored = await doc(page);
  await page.evaluate((k) => localStorage.setItem(k, "{not json"), JOURNAL);
  await reload(page);
  expect(await doc(page)).toEqual(stored);
  expect(await page.evaluate((k) => localStorage.getItem(k), JOURNAL)).toBeNull();

  // Storage full: writing the journal throws. Leaving and opening still work.
  await page.addInitScript((k) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === k) throw new DOMException("full", "QuotaExceededError");
      return set.call(this, key, value);
    };
  }, JOURNAL);
  await reload(page);
  await rect(page, 700, 200);
  await reload(page);
  expect(await shapeIds(page)).toContain(a);
  await rect(page, 1100, 200);
  expect(errors).toEqual([]);
});
