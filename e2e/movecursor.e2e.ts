import { expect, test, type Page } from "@playwright/test";

import { seedBoard, openBoardList } from "./helpers";

/**
 * The move cursor over an item, as in Excalidraw (owner, 2026-10-22): with
 * the select tool at rest, the four-arrow cursor shows over the body of any
 * item, selected or not, every time. A resize edge or handle keeps its
 * resize cursor; text being edited shows the text cursor; empty canvas,
 * locked items and other tools keep their own. Each check reads the cursor
 * the page really shows: the computed `cursor` of the element under the
 * pointer. Fresh browser profile.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}
const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) => page.evaluate(({ src, arg }) => { const e = (window as any).editor; const r = new Function("e", "a", `return (${src})(e, a)`)(e, arg); return r === e ? undefined : r; }, { src: fn.toString(), arg }) as Promise<T>;

const screenBox = (page: Page, id: string) =>
  ed(page, (e, id: string) => {
    const b = e.getShapePageBounds(id);
    const a = e.pageToScreen({ x: b.x, y: b.y });
    const c = e.pageToScreen({ x: b.maxX, y: b.maxY });
    return { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y };
  }, id);
const mid = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** What the page shows under the pointer at `p`: "move", "default",
    "text", "grab", "cross", or "resize" (any of tldraw's resize cursors),
    else the raw computed cursor. tldraw's cursors are custom images, so
    each is told apart by resolving tldraw's own variable for it. */
const cursorAt = (page: Page, p: Pt) =>
  page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y) as HTMLElement | null;
    if (!el) return "nothing";
    const shown = getComputedStyle(el).cursor;
    const container = (window as any).editor.getContainer() as HTMLElement;
    const probe = document.createElement("div");
    container.appendChild(probe);
    const resolve = (v: string) => {
      probe.style.cursor = v;
      return getComputedStyle(probe).cursor;
    };
    try {
      for (const name of ["move", "default", "text", "grab", "cross"]) if (shown === resolve(`var(--tl-cursor-${name})`)) return name;
      const type = container.dataset.edgeCursor ?? (window as any).editor.getInstanceState().cursor.type;
      if (/resize/.test(type) && shown === getComputedStyle(document.querySelector(".tl-canvas")!).cursor) return "resize";
      return shown;
    } finally {
      probe.remove();
    }
  }, p);

async function hover(page: Page, p: Pt) {
  // Off the point first, so every check is a fresh arrival ("every time").
  await page.mouse.move(p.x + 400, p.y + 300, { steps: 2 });
  await page.mouse.move(p.x, p.y, { steps: 4 });
}
async function expectCursor(page: Page, p: Pt, want: string, message: string) {
  await expect.poll(() => cursorAt(page, p), { message }).toBe(want);
}

const geo = (page: Page, x: number, y: number, extra: Record<string, unknown> = {}) =>
  ed(page, (e, a: { x: number; y: number; extra: Record<string, unknown> }) => {
    const before = new Set(e.getCurrentPageShapeIds());
    e.createShape({ type: "geo", x: a.x, y: a.y, props: { w: 240, h: 160, fill: "solid" }, ...a.extra });
    return [...e.getCurrentPageShapeIds()].find((id: string) => !before.has(id)) as string;
  }, { x, y, extra });

const textBox = (page: Page, x: number, y: number) =>
  ed(page, (e, a: { x: number; y: number }) => {
    const before = new Set(e.getCurrentPageShapeIds());
    const richText = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hover me, a text box" }] }] };
    e.createShape({ type: "text", x: a.x, y: a.y, props: { richText, scale: 2 } });
    return [...e.getCurrentPageShapeIds()].find((id: string) => !before.has(id)) as string;
  }, { x, y });

test("text box, unselected and selected: move over its body, every time; empty canvas: default", async ({ page }) => {
  await open(page);
  const id = await textBox(page, 300, 300);
  const b = await screenBox(page, id);
  for (let i = 0; i < 3; i++) {
    await hover(page, mid(b));
    await expectCursor(page, mid(b), "move", `unselected, pass ${i + 1}`);
  }
  await ed(page, (e, id: string) => e.select(id), id);
  for (let i = 0; i < 3; i++) {
    await hover(page, mid(b));
    await expectCursor(page, mid(b), "move", `selected, pass ${i + 1}`);
  }
  const empty = { x: b.x + b.w + 300, y: b.y + b.h + 200 };
  await hover(page, empty);
  await expectCursor(page, empty, "default", "empty canvas");
  await ed(page, (e) => e.selectNone());
  await hover(page, empty);
  await expectCursor(page, empty, "default", "empty canvas, nothing selected");
});

test("rectangle: move over its body; resize over an edge (unselected) and a handle (selected) wins over move", async ({ page }) => {
  await open(page);
  const id = await geo(page, 500, 300);
  const b = await screenBox(page, id);
  await hover(page, mid(b));
  await expectCursor(page, mid(b), "move", "unselected body");
  const right = { x: b.x + b.w + 1, y: b.y + b.h / 2 };
  await hover(page, right);
  await expectCursor(page, right, "resize", "unselected right edge");
  // Back into the body from the edge: move again.
  await page.mouse.move(mid(b).x, mid(b).y, { steps: 4 });
  await expectCursor(page, mid(b), "move", "body after the edge");

  await ed(page, (e, id: string) => e.select(id), id);
  await hover(page, mid(b));
  await expectCursor(page, mid(b), "move", "selected body");
  const corner = { x: b.x + b.w, y: b.y + b.h };
  await hover(page, corner);
  await expectCursor(page, corner, "resize", "selected bottom-right handle");
  const bottom = { x: b.x + b.w / 2, y: b.y + b.h };
  await hover(page, bottom);
  await expectCursor(page, bottom, "resize", "selected bottom edge");
});

test("outline-only rectangle: default inside when unselected (nothing to grab, as in Excalidraw), move inside once selected", async ({ page }) => {
  await open(page);
  const id = await geo(page, 500, 300, { props: { w: 240, h: 160, fill: "none" } });
  const b = await screenBox(page, id);
  await hover(page, mid(b));
  await expectCursor(page, mid(b), "default", "unselected, hollow");
  await ed(page, (e, id: string) => e.select(id), id);
  await hover(page, mid(b));
  await expectCursor(page, mid(b), "move", "selected, inside the selection");
});

test("board widget (a stone): move over its body", async ({ page, context }) => {
  const boardId = await seedBoard(context);
  await open(page);
  await openBoardList(page);
  await page.getByTestId("board-picker").locator(`[data-board="${boardId}"]`).click();
  await expect(page.locator(".tl-html-container [data-boardkit-board]").first()).toBeVisible();
  await expect.poll(() => ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board")?.props.scale ?? 0)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await ed(page, (e) => e.selectNone());
  const id = await ed(page, (e) => e.getCurrentPageShapes().find((s: any) => s.type === "boardkit-board").id as string);
  const b = await screenBox(page, id);
  // Plain board space: just inside the bottom-right corner, past the edge band.
  const p = { x: b.x + b.w - 20, y: b.y + b.h - 20 };
  await hover(page, p);
  await expectCursor(page, p, "move", "unselected widget");
  await ed(page, (e, id: string) => e.select(id), id);
  await hover(page, p);
  await expectCursor(page, p, "move", "selected widget");
});

test("a box at the top of the page (under the toolbar's row): move over its body", async ({ page }) => {
  await open(page);
  const id = await geo(page, 0, 0, { props: { w: 900, h: 160, fill: "solid" } });
  await ed(page, (e, id: string) => {
    const at = e.screenToPage({ x: 300, y: 4 });
    e.updateShape({ id, type: "geo", x: at.x, y: at.y });
  }, id);
  const b = await screenBox(page, id);
  expect(b.y).toBeLessThan(10);
  // Points across its top band that no toolbar or menu covers.
  const points = await page.evaluate((b) => {
    const out: { x: number; y: number }[] = [];
    for (let x = b.x + 20; x < b.x + b.w - 20; x += 40)
      for (const y of [b.y + 12, b.y + 30]) {
        const el = document.elementFromPoint(x, y);
        if (el && el.closest(".tl-canvas")) out.push({ x, y });
      }
    return out;
  }, b);
  expect(points.length).toBeGreaterThan(3);
  for (const p of points.slice(0, 6)) {
    await hover(page, p);
    await expectCursor(page, p, "move", `top box at ${p.x},${p.y}`);
  }
});

test("editing text: the text cursor, not move", async ({ page }) => {
  await open(page);
  const id = await textBox(page, 300, 300);
  const b = await screenBox(page, id);
  await page.mouse.dblclick(mid(b).x, mid(b).y);
  await expect.poll(() => ed(page, (e) => e.getEditingShapeId())).toBe(id);
  await page.mouse.move(mid(b).x + 10, mid(b).y + 2, { steps: 3 });
  await expectCursor(page, { x: mid(b).x + 10, y: mid(b).y + 2 }, "text", "over the text being edited");
  await page.keyboard.press("Escape");
});

test("hand tool and drawing tools keep their own cursor over an item", async ({ page }) => {
  await open(page);
  const id = await geo(page, 500, 300);
  const b = await screenBox(page, id);
  await hover(page, mid(b));
  await expectCursor(page, mid(b), "move", "select tool first");
  await ed(page, (e) => e.setCurrentTool("hand"));
  await hover(page, mid(b));
  await expectCursor(page, mid(b), "grab", "hand tool");
  for (const tool of ["draw", "geo", "arrow"]) {
    await ed(page, (e, t: string) => e.setCurrentTool(t), tool);
    await hover(page, mid(b));
    await expectCursor(page, mid(b), "cross", `${tool} tool`);
  }
  // Back to select: move again over the same item.
  await ed(page, (e) => e.setCurrentTool("select"));
  await hover(page, mid(b));
  await expectCursor(page, mid(b), "move", "select tool again");
});

test("locked item: default, not move", async ({ page }) => {
  await open(page);
  const id = await geo(page, 500, 300, { isLocked: true });
  const b = await screenBox(page, id);
  await hover(page, mid(b));
  await expectCursor(page, mid(b), "default", "locked");
  expect(await ed(page, (e, id: string) => e.getShape(id).isLocked, id)).toBe(true);
});
