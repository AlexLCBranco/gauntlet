import { expect, test, type Page } from "@playwright/test";

import { whiteboardSaved } from "./helpers";

/**
 * Dark and custom colours in the style panel (Excalidraw parity item 1,
 * owner 2026-10-21): fixed colours (true black, dark shades) and custom
 * colours look the same in dark and light mode, and stay through undo,
 * reload, the unsaved journal, duplicate and copy/paste. Fresh, empty
 * browser profile per test; every shape is made here.
 */

test.use({ viewport: { width: 1920, height: 1080 } });

type Pt = { x: number; y: number };

const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) =>
  page.evaluate(([src, a]) => new Function("e", "a", `return (${src})(e, a)`)((window as any).editor, a), [fn.toString(), arg] as const) as Promise<T>;

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const shapeIds = (page: Page) => ed(page, (e) => e.getCurrentPageShapes().map((s: any) => s.id) as string[]);
const shapeOf = (page: Page, id: string) => ed(page, (e, id: string) => e.getShape(id), id);

async function rect(page: Page, from: Pt, to: Pt): Promise<string> {
  const before = await shapeIds(page);
  await page.keyboard.press("2");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  const added = (await shapeIds(page)).filter((id) => !before.includes(id));
  expect(added).toHaveLength(1);
  return added[0];
}

/** The colours a shape is drawn with: its fill, its outline, its label. */
const drawn = (page: Page, id: string) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-shape-id="${id}"]`)!;
    const paths = [...el.querySelectorAll("path")];
    return {
      fills: paths.map((p) => p.getAttribute("fill")).filter((f) => f && f !== "none"),
      strokes: paths.map((p) => p.getAttribute("stroke")).filter((f) => f && f !== "none"),
      label: getComputedStyle(el.querySelector(".tl-rich-text") as HTMLElement).color,
    };
  }, id);

const WANT = { fills: ["#0b2a6f"], strokes: ["#000000"], label: "rgb(18, 52, 86)" };
const WANT_META = { strokeHex: "#000000", fillHex: "#0b2a6f", textHex: "#123456" };

const setMode = (page: Page, mode: "dark" | "light") =>
  ed(page, (e, mode: string) => {
    e.user.updateUserPreferences({ colorScheme: mode });
    return e.getColorMode();
  }, mode);

test("a rectangle with stroke true black, background dark blue and a custom text colour keeps exactly those colours in dark and light mode, through undo, reload, duplicate and copy/paste", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  expect(await setMode(page, "dark")).toBe("dark");
  const a = await rect(page, { x: 500, y: 300 }, { x: 800, y: 460 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("Exact");
  await page.keyboard.press("Escape");
  await ed(page, (e, id: string) => void e.select(id), a);

  await page.getByTestId("stroke-true-black").click();
  await page.getByTestId("background-dark-blue").click();
  await page.getByTestId("text-custom").click();
  await page.getByTestId("text-hex").fill("#123456");
  await page.getByTestId("text-hex").press("Enter");

  expect((await shapeOf(page, a)).meta).toMatchObject(WANT_META);
  expect(await drawn(page, a)).toEqual(WANT);
  await expect(page.getByTestId("stroke-true-black")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("background-dark-blue")).toHaveAttribute("aria-pressed", "true");
  // The custom colour shows in the recent colours (every row's).
  await expect(page.getByTestId("text-recent-123456")).toBeVisible();
  await expect(page.getByTestId("text-recent-123456")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("stroke-recent-123456")).toBeVisible();

  // Light mode: the same colours, never inverted (tldraw's own black would turn).
  expect(await setMode(page, "light")).toBe("light");
  await expect.poll(() => drawn(page, a)).toEqual(WANT);
  expect(await setMode(page, "dark")).toBe("dark");
  await expect.poll(() => drawn(page, a)).toEqual(WANT);

  // One Ctrl+Z takes back the last pick only; Ctrl+Y brings it back.
  await page.keyboard.press("Control+z");
  expect((await shapeOf(page, a)).meta.textHex).toBeUndefined();
  expect((await shapeOf(page, a)).meta.fillHex).toBe("#0b2a6f");
  await page.keyboard.press("Control+y");
  expect((await shapeOf(page, a)).meta).toMatchObject(WANT_META);

  // Reload (saved) and a reload right after a pick (the unsaved journal).
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  expect((await shapeOf(page, a)).meta).toMatchObject(WANT_META);
  await expect.poll(() => drawn(page, a)).toEqual(WANT);
  await ed(page, (e, id: string) => void e.select(id), a);
  await page.getByTestId("stroke-dark-red").click();
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  expect((await shapeOf(page, a)).meta.strokeHex).toBe("#8a1c1c");
  await ed(page, (e, id: string) => void e.select(id), a);
  await page.getByTestId("stroke-true-black").click();
  // The recent colours are remembered across the reload.
  await expect(page.getByTestId("text-recent-123456")).toBeVisible();

  // Duplicate (Ctrl+D) and copy/paste carry the same colours.
  const before = await shapeIds(page);
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await shapeIds(page)).length).toBe(before.length + 1);
  const dup = (await shapeIds(page)).find((id) => !before.includes(id))!;
  expect((await shapeOf(page, dup)).meta).toMatchObject(WANT_META);
  await expect.poll(() => drawn(page, dup)).toEqual(WANT);
  await ed(page, (e, id: string) => void e.select(id), a);
  await page.keyboard.press("Control+c");
  // tldraw writes the clipboard asynchronously: paste once it holds the shape.
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.read()).some((i) => i.types.includes("text/html")))).toBe(true);
  const before2 = await shapeIds(page);
  await page.keyboard.press("Control+v");
  await expect.poll(async () => (await shapeIds(page)).length).toBe(before2.length + 1);
  const pasted = (await shapeIds(page)).find((id) => !before2.includes(id))!;
  expect((await shapeOf(page, pasted)).meta).toMatchObject(WANT_META);
  await expect.poll(() => drawn(page, pasted)).toEqual(WANT);

  // A tldraw colour picked again drops the exact one (tldraw's colours keep working).
  await ed(page, (e, id: string) => void e.select(id), a);
  await page.getByTestId("stroke-blue").click();
  const s = await shapeOf(page, a);
  expect(s.props.color).toBe("blue");
  expect(s.meta.strokeHex ?? null).toBeNull();
  await expect.poll(async () => (await drawn(page, a)).strokes).not.toEqual(["#000000"]);
});

test("the custom colour area and hue slider pick a colour; the last five custom colours are kept, newest first", async ({ page }) => {
  await open(page);
  const a = await rect(page, { x: 500, y: 300 }, { x: 800, y: 460 });
  await ed(page, (e, id: string) => void e.select(id), a);
  await page.getByTestId("background-custom").click();
  const area = page.getByLabel("background: colour area");
  const b = (await area.boundingBox())!;
  // Bottom-left of the area is black; top-right the hue at full strength.
  await page.mouse.click(b.x + b.width - 1, b.y + 1);
  const fill = (await shapeOf(page, a)).meta.fillHex as string;
  expect(fill).toMatch(/^#[0-9a-f]{6}$/);
  expect(fill).not.toBe("#123456");
  for (const hex of ["#111111", "#222222", "#333333", "#444444", "#555555"]) {
    await page.getByTestId("background-hex").fill(hex);
    await page.getByTestId("background-hex").press("Enter");
  }
  const recents = await page.locator('[data-testid^="background-recent-"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
  expect(recents).toEqual(["555555", "444444", "333333", "222222", "111111"].map((h) => `background-recent-${h}`));
});
