import { expect, test, type Page } from "@playwright/test";

/**
 * The toolbar (owner, 2026-10-22): Select, Rectangle, Arrow, Line, a
 * separator, Board, Map, then the ⋮ "More tools" button; the menu holds
 * Insert image, Web embed, Lasso selection, Markup, Text, Draw. Always
 * exactly these on the bar, at every window size. The removed tools have
 * no button, menu item or key anywhere.
 */

const BAR = ["select", "rectangle", "arrow", "line", "|", "board", "map", "more"];
const MORE = ["asset", "embed", "lasso", "markup", "text", "draw"];
const MORE_LABELS = ["Insert image", "Web embed", "Lasso selection", "Markup", "Text", "Draw"];
const REMOVED = ["hand", "diamond", "ellipse", "eraser", "highlight", "laser", "note", "frame"];
/** Their names in tldraw's English UI, and the tool lock's. */
const REMOVED_WORDS = ["Hand", "Diamond", "Ellipse", "Eraser", "Highlight", "Laser", "Sticky note", "Note", "Frame", "Tool lock", "Lock tool"];

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}
const tool = (page: Page) => page.evaluate(() => (window as any).editor.getCurrentToolId() as string);
const shapeTypes = (page: Page) => page.evaluate(() => (window as any).editor.getCurrentPageShapes().map((s: any) => s.type) as string[]);

/** What the bar shows, left to right, without opening anything: each
    visible button's tool, "|" for a separator, "more" for ⋮. */
const shown = (page: Page) =>
  page.getByTestId("toolbar").evaluate((bar) =>
    [...bar.children]
      .filter((el) => (el as HTMLElement).offsetParent && el.getBoundingClientRect().width > 0)
      .map((el) => (el.getAttribute("role") === "separator" ? "|" : el.getAttribute("data-testid") === "tools.more-button" ? "more" : el.getAttribute("data-value"))),
  );

for (const size of [
  { width: 640, height: 480 },
  { width: 1920, height: 1080 },
]) {
  test(`at ${size.width} x ${size.height} the bar shows exactly its tools, nothing more, inside the window`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    expect(await shown(page)).toEqual(BAR);
    // Nothing from the ⋮ menu is on show until it opens.
    for (const id of MORE) await expect(page.locator(`[data-testid="tools.${id}"], [data-testid="tools.more.${id}"]`)).toHaveCount(0);
    const bar = (await page.getByTestId("toolbar").boundingBox())!;
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(bar.x + bar.width).toBeLessThanOrEqual(size.width);
    expect(bar.height).toBeLessThan(60);
    // Every button on one row.
    const ys = await page.getByTestId("toolbar").locator("button").evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
    expect(new Set(ys).size).toBe(1);
    // Picking a menu tool doesn't put it on the bar.
    await page.keyboard.press("w");
    expect(await tool(page)).toBe("lasso");
    expect(await shown(page)).toEqual(BAR);
  });
}

test("the ⋮ menu holds Insert image, Web embed, Lasso selection, Markup, Text, Draw, in that order, and each works", async ({ page }) => {
  await open(page);
  const more = page.getByTestId("tools.more-button");
  await more.click();
  const items = page.getByTestId("tools.more").getByRole("menuitem");
  expect(await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-value")))).toEqual(MORE);
  await expect(items).toHaveText(MORE_LABELS);
  // Escape and a click outside close it.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tools.more")).toHaveCount(0);
  await more.click();
  await page.mouse.click(700, 500);
  await expect(page.getByTestId("tools.more")).toHaveCount(0);

  // Lasso, Text, Draw pick their tool; the menu closes and ⋮ shows it's on.
  for (const id of ["lasso", "text", "draw"]) {
    await more.click();
    await page.getByTestId(`tools.more.${id}`).click();
    await expect(page.getByTestId("tools.more")).toHaveCount(0);
    expect(await tool(page)).toBe(id);
    await expect(more).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("v");
    await expect(more).toHaveAttribute("aria-pressed", "false");
  }
  // Insert image asks for a file.
  await more.click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("tools.more.asset").click()]);
  expect(chooser.isMultiple()).toBe(true);
  // Web embed asks for the address.
  await more.click();
  await page.getByTestId("tools.more.embed").click();
  await expect(page.locator(".tlui-dialog__content")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tlui-dialog__content")).toHaveCount(0);
  // Markup is greyed out until its tool is built (step 4).
  await more.click();
  await expect(page.getByTestId("tools.more.markup")).toBeDisabled();
});

test("the bar's tools pick their tool and light up", async ({ page }) => {
  await open(page);
  for (const id of ["rectangle", "arrow", "line", "select"]) {
    await page.getByTestId(`tools.${id}`).click();
    expect(await tool(page)).toBe(id === "rectangle" ? "geo" : id);
    await expect(page.getByTestId(`tools.${id}`)).toHaveAttribute("aria-pressed", "true");
    for (const other of ["select", "rectangle", "arrow", "line"].filter((o) => o !== id))
      await expect(page.getByTestId(`tools.${other}`)).toHaveAttribute("aria-pressed", "false");
  }
});

test("Board and Map put a new, empty board / map on the current page; existing ones are in the main menu", async ({ page }) => {
  await open(page);
  await page.getByTestId("tools.board").click();
  await expect.poll(() => shapeTypes(page)).toEqual(["boardkit-board"]);
  await expect(page.getByTestId("board-picker")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByTestId("tools.map").click();
  await expect.poll(() => shapeTypes(page)).toEqual(["boardkit-board", "linkkit-map"]);
  await expect(page.getByTestId("map-picker")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // Adding an existing one: main menu → the list.
  for (const [item, list] of [
    ["Add existing board…", "board-picker"],
    ["Add existing map…", "map-picker"],
  ]) {
    await page.getByTestId("main-menu.button").click();
    await page.getByRole("menuitem", { name: item }).click();
    await expect(page.getByTestId(list)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId(list)).toHaveCount(0);
  }
});

test("removed tools appear nowhere: not on the bar, the ⋮ menu, the main menu and its preferences, the right-click menu; their keys do nothing", async ({ page }) => {
  await open(page);
  const nowhere = async (where: string, scope = page.locator("body")) => {
    for (const id of REMOVED)
      await expect(page.locator(`[data-testid="tools.${id}"], [data-testid="tools.more.${id}"], [data-value="${id}"]`), `${id} in ${where}`).toHaveCount(0);
    const text = await scope.innerText();
    for (const w of REMOVED_WORDS) expect(text, `"${w}" in ${where}`).not.toMatch(new RegExp(`\\b${w}\\b`));
    // tldraw's tool-lock button.
    await expect(page.locator('[data-testid="tool-lock"], .tlui-main-toolbar__lock-button')).toHaveCount(0);
  };
  await nowhere("the page");
  await page.getByTestId("tools.more-button").click();
  await nowhere("the ⋮ menu");
  await page.keyboard.press("Escape");
  await page.getByTestId("main-menu.button").click();
  await nowhere("the main menu");
  await page.getByRole("menuitem", { name: "Preferences" }).click();
  await expect(page.getByRole("menuitemcheckbox").first()).toBeVisible();
  await nowhere("the preferences");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // tldraw's keyboard shortcuts list.
  await page.getByTestId("main-menu.button").click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  await expect(page.locator(".tlui-dialog__content")).toBeVisible();
  // (Its text-formatting group has a "Highlight" of its own: only the tools.)
  await nowhere("the keyboard shortcuts list", page.getByTestId("kbd-group.tools"));
  await page.keyboard.press("Escape");
  await expect(page.locator(".tlui-dialog__content")).toHaveCount(0);
  await page.mouse.click(700, 500, { button: "right" });
  await expect(page.locator(".tlui-menu").first()).toBeVisible();
  await nowhere("the right-click menu");
  await page.keyboard.press("Escape");
  // A drawing tool on: still no tool lock next to the bar.
  await page.keyboard.press("r");
  await nowhere("the bar while drawing");
  await page.keyboard.press("v");
  // Their keys (and the tool lock's Q) do nothing.
  for (const key of ["h", "d", "o", "e", "Shift+D", "k", "n", "f", "3", "4", "0", "q"]) {
    await page.keyboard.press(key);
    expect(await tool(page), `key ${key}`).toBe("select");
  }
  expect(await page.evaluate(() => (window as any).editor.getInstanceState().isToolLocked)).toBe(false);
});
