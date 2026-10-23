import { expect, test, type Page } from "./test";

/**
 * Tool behaviour, toolbar rework step 4 (owner, 2026-10-22; request in
 * docs/TOOLBAR-REWORK.md). Fresh, empty browser profile per test; drawing
 * through the mouse and keyboard, `window.editor` read to check.
 */

test.use({ viewport: { width: 1400, height: 900 } });

type Pt = { x: number; y: number };

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) =>
  page.evaluate(([src, a]) => new Function("e", "a", `return (${src})(e, a)`)((window as any).editor, a), [fn.toString(), arg] as const) as Promise<T>;

/** A drag in window coordinates, in small steps, optionally holding Shift. */
async function drag(page: Page, from: Pt, to: Pt, shift = false) {
  await page.mouse.move(from.x, from.y);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}

/** The last shape's two ends on the page (a line's first and last point, an arrow's start and end). */
const ends = (page: Page) =>
  ed(page, (e) => {
    const s = e.getCurrentPageShapesSorted().at(-1);
    const t = e.getShapePageTransform(s.id);
    const pts =
      s.type === "line"
        ? Object.values(s.props.points as Record<string, { index: string; x: number; y: number }>)
            .sort((a, b) => (a.index < b.index ? -1 : 1))
            .map((p) => ({ x: p.x, y: p.y }))
        : [s.props.start, s.props.end];
    const [a, b] = [pts[0], pts.at(-1)!].map((p) => t.applyToPoint(p));
    return { type: s.type as string, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
  });
const angleOf = (r: { a: Pt; b: Pt }) => (Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x) * 180) / Math.PI;
const off = (from: Pt, deg: number, length = 300) => ({ x: from.x + Math.cos((deg * Math.PI) / 180) * length, y: from.y + Math.sin((deg * Math.PI) / 180) * length });

test("lines and arrows drawn 2-3° off horizontal or vertical end up exactly straight; 10° off stays as drawn", async ({ page }) => {
  await open(page);
  const cases: [string, string, number, "h" | "v" | "none"][] = [
    ["6", "line", 2, "h"],
    ["6", "line", -2, "h"],
    ["5", "arrow", 2, "h"],
    ["5", "arrow", 93, "v"],
    ["6", "line", 267, "v"],
    ["6", "line", 10, "none"],
    ["5", "arrow", 80, "none"],
  ];
  for (const [key, type, deg, want] of cases) {
    // One at a time, on an empty page (an arrow started on another shape
    // would attach to it).
    await ed(page, (e) => void e.deleteShapes([...e.getCurrentPageShapeIds()]));
    await page.keyboard.press(key);
    const from = { x: 500, y: 450 };
    await drag(page, from, off(from, deg));
    await page.keyboard.press("Escape");
    const r = await ends(page);
    expect(r.type).toBe(type);
    if (want === "h") expect(r.b.y, `${type} ${deg}°`).toBe(r.a.y);
    else if (want === "v") expect(r.b.x, `${type} ${deg}°`).toBe(r.a.x);
    else expect(Math.abs(angleOf(r) - deg), `${type} ${deg}° stays`).toBeLessThan(1.5);
  }
});

test("Shift snaps lines and arrows to fixed angles, diagonals included (tldraw's 15° steps)", async ({ page }) => {
  await open(page);
  for (const [key, deg, want] of [
    ["6", 41, 45],
    ["5", 28, 30],
    ["6", 2, 0],
  ] as const) {
    await page.keyboard.press(key);
    await drag(page, { x: 300, y: 300 }, off({ x: 300, y: 300 }, deg), true);
    await page.keyboard.press("Escape");
    expect(angleOf(await ends(page)), `${deg}° with Shift`).toBeCloseTo(want, 6);
    await ed(page, (e) => void e.deleteShapes([...e.getCurrentPageShapeIds()]));
  }
});

test("moving an end of an existing line to 2° off horizontal straightens it too", async ({ page }) => {
  await open(page);
  await page.keyboard.press("6");
  await drag(page, { x: 400, y: 400 }, { x: 600, y: 300 });
  await page.keyboard.press("Escape");
  const r = await ends(page);
  // Select it, then drag its far end to 2° off level with the start.
  await page.keyboard.press("v");
  await page.mouse.click((r.a.x + r.b.x) / 2, (r.a.y + r.b.y) / 2);
  const screen = await ed(page, (e, p: Pt) => e.pageToScreen(p), r.b);
  await drag(page, screen, await ed(page, (e, p: Pt) => e.pageToScreen(p), off(r.a, -2, 260)));
  const after = await ends(page);
  expect(after.b.y).toBe(after.a.y);
});

// Panning (no hand tool): only when the page is bigger than the window,
// and never past its edges. A page that fits doesn't move at all.

const camera = (page: Page) => ed(page, (e) => ({ ...e.getCamera() }) as { x: number; y: number; z: number });
const pageBox = (page: Page) => ed(page, (e) => ({ ...e.getCameraOptions().constraints.bounds }) as { x: number; y: number; w: number; h: number });
const viewBox = (page: Page) => ed(page, (e) => ({ ...e.getViewportPageBounds().toJson() }) as { x: number; y: number; w: number; h: number });

/** Every way a person might move the view; `during` runs mid-gesture. */
async function tryToPan(page: Page, during: () => Promise<void>) {
  const c = { x: 700, y: 450 };
  await page.mouse.move(c.x, c.y);
  for (const [dx, dy] of [[0, 400], [0, -400], [400, 0], [-400, 0]]) await page.mouse.wheel(dx, dy);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 400);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(100);
  await during();
  // Space + drag, middle-button drag, right-button drag: checked mid-drag too.
  for (const how of ["space", "middle", "right"] as const) {
    await page.mouse.move(c.x, c.y);
    if (how === "space") await page.keyboard.down("Space");
    await page.mouse.down({ button: how === "space" ? "left" : how });
    await page.mouse.move(c.x - 300, c.y - 200, { steps: 8 });
    await during();
    await page.mouse.move(c.x + 300, c.y + 250, { steps: 8 });
    await during();
    await page.mouse.up({ button: how === "space" ? "left" : how });
    if (how === "space") await page.keyboard.up("Space");
    await page.keyboard.press("Escape");
    await during();
  }
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "Home", "End"]) await page.keyboard.press(key);
  await during();
}

test("a page that fits the window can't be moved: wheel, Shift+wheel, Space+drag, middle- and right-button drag, keys", async ({ page }) => {
  await open(page);
  const start = await camera(page);
  const box = await pageBox(page);
  const view = await viewBox(page);
  // It fits: the page is the window.
  expect(box.w).toBeCloseTo(view.w, 0);
  expect(box.h).toBeCloseTo(view.h, 0);
  await tryToPan(page, async () => expect(await camera(page)).toEqual(start));
  expect(await camera(page)).toEqual(start);
});

test("a page bigger than the window pans with the wheel and Space+drag, and never past its edges", async ({ page }) => {
  await open(page);
  // Zoomed to 200%: the page is twice the window.
  await ed(page, (e) => void e.setCamera({ ...e.getCamera(), z: 2 }, { immediate: true }));
  const inside = async () => {
    const p = await pageBox(page);
    const v = await viewBox(page);
    expect(v.x).toBeGreaterThanOrEqual(p.x - 0.5);
    expect(v.y).toBeGreaterThanOrEqual(p.y - 0.5);
    expect(v.x + v.w).toBeLessThanOrEqual(p.x + p.w + 0.5);
    expect(v.y + v.h).toBeLessThanOrEqual(p.y + p.h + 0.5);
  };
  await inside();
  const before = await camera(page);
  // The wheel moves it.
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => (await camera(page)).y).not.toBe(before.y);
  // Far past each edge: it stops there, inside, also mid-drag.
  for (let i = 0; i < 10; i++) await page.mouse.wheel(3000, 3000);
  await inside();
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(2000, 2000, { steps: 10 });
  await inside();
  await page.mouse.move(-2000, -2000, { steps: 10 });
  await inside();
  await page.mouse.up();
  await page.keyboard.up("Space");
  await inside();
  // Space+drag moved it back to the top left corner.
  const v = await viewBox(page);
  const p = await pageBox(page);
  expect(v.x + v.w).toBeCloseTo(p.x + p.w, 0);
});

test("Group and Ungroup are right there in the right-click menu (not only Ctrl+G, not in a submenu)", async ({ page }) => {
  await open(page);
  for (const x of [300, 600]) {
    await page.keyboard.press("2");
    await drag(page, { x, y: 300 }, { x: x + 150, y: 400 });
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+a");
  await page.mouse.click(375, 350, { button: "right" });
  const group = page.getByRole("menuitem", { name: /^Group / });
  await expect(group).toBeVisible();
  await group.click();
  await expect.poll(() => ed(page, (e) => e.getCurrentPageShapes().map((s: any) => s.type).sort())).toEqual(["geo", "geo", "group"]);
  // The group selected: Ungroup, right there too.
  await page.mouse.click(375, 350, { button: "right" });
  const ungroup = page.getByRole("menuitem", { name: /^Ungroup / });
  await expect(ungroup).toBeVisible();
  await ungroup.click();
  await expect.poll(() => ed(page, (e) => e.getCurrentPageShapes().map((s: any) => s.type))).toEqual(["geo", "geo"]);
  // One shape alone: no Group.
  await page.keyboard.press("Escape");
  await page.mouse.click(375, 350);
  await page.mouse.click(375, 350, { button: "right" });
  await expect(page.getByRole("menuitem", { name: /^Group / })).toHaveCount(0);
});
