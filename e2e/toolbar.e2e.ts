import { expect, test, type Page } from "./test";

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
  await expect(items.locator(".gk-more-item__text")).toHaveText(MORE_LABELS);
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

test("removed tools appear nowhere: not on the bar, the ⋮ menu, the main menu (nor its Insert embed / Upload media) and its preferences, the right-click menu; their keys do nothing", async ({ page }) => {
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
  // Image and web embed come in only through the ⋮ menu.
  await expect(page.getByRole("menuitem", { name: "Backups" })).toBeVisible();
  for (const name of [/Insert embed/, /Upload media/, /Insert image/, /Web embed/]) await expect(page.getByRole("menuitem", { name }), String(name)).toHaveCount(0);
  await expect(page.locator('[data-testid="main-menu.insert-embed"], [data-testid="main-menu.insert-media"]')).toHaveCount(0);
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

// ---------------------------------------------------------------------------
// Step 2: Excalidraw's look and size (src/whiteboard/toolbar.css, where each
// value's source file is named; dark only). Screens below 1921 px wide.

const css = (page: Page, sel: string, props: string[]) =>
  page.locator(sel).first().evaluate((el, p) => {
    const s = getComputedStyle(el);
    return Object.fromEntries(p.map((x) => [x, s.getPropertyValue(x)]));
  }, props);
const ISLAND_SHADOW = "rgba(0, 0, 0, 0.17) 0px 0px 1px 0px, rgba(0, 0, 0, 0.08) 0px 0px 3px 0px, rgba(0, 0, 0, 0.05) 0px 7px 14px 0px";

test("the bar has Excalidraw's sizes and colours: 36 px buttons, 16 px icons, 4 px padding and gap, its island, selected, hover and key hint", async ({ page }) => {
  await open(page);
  expect(await css(page, '[data-testid="toolbar"]', ["padding", "gap", "border-radius", "background-color", "box-shadow"])).toEqual({
    padding: "4px",
    gap: "4px",
    "border-radius": "8px",
    "background-color": "rgb(35, 35, 41)",
    "box-shadow": ISLAND_SHADOW,
  });
  // Excalidraw's own toolbar is 44 px tall (measured on excalidraw.com).
  expect((await page.getByTestId("toolbar").boundingBox())!.height).toBe(44);
  for (const id of ["select", "rectangle", "arrow", "line", "board", "map"]) {
    const b = (await page.locator(`[data-testid="tools.${id}"] .gk-tool__icon`).boundingBox())!;
    expect([b.width, b.height], id).toEqual([36, 36]);
    const svg = (await page.locator(`[data-testid="tools.${id}"] svg`).boundingBox())!;
    expect([svg.width, svg.height], id).toEqual([16, 16]);
  }
  const more = (await page.getByTestId("tools.more-button").boundingBox())!;
  expect([more.width, more.height]).toEqual([36, 36]);
  expect(await css(page, '[data-testid="tools.rectangle"] .gk-tool__icon', ["border-radius", "color", "background-color"])).toEqual({
    "border-radius": "8px",
    color: "rgb(227, 227, 232)",
    "background-color": "rgba(0, 0, 0, 0)",
  });
  // Selected: Excalidraw's soft primary container, not a bright fill.
  expect(await css(page, '[data-testid="tools.select"] .gk-tool__icon', ["background-color"])).toEqual({ "background-color": "rgb(64, 62, 106)" });
  expect(await css(page, '[data-testid="tools.select"] svg', ["color"])).toEqual({ color: "rgb(224, 223, 255)" });
  expect(await css(page, '[data-testid="tools.select"] .gk-tool__kbd', ["color"])).toEqual({ color: "rgb(224, 223, 255)" });
  // The key hint, bottom right.
  expect(await css(page, '[data-testid="tools.rectangle"] .gk-tool__kbd', ["position", "bottom", "right", "font-size", "color"])).toEqual({
    position: "absolute",
    bottom: "2px",
    right: "3px",
    "font-size": "10px",
    color: "rgb(122, 122, 122)",
  });
  // Hover: surface-high; the ⋮ button stays transparent, as Excalidraw's.
  await page.locator('[data-testid="tools.rectangle"] .gk-tool__icon').hover();
  expect(await css(page, '[data-testid="tools.rectangle"] .gk-tool__icon', ["background-color"])).toEqual({ "background-color": "rgb(46, 45, 57)" });
  await page.getByTestId("tools.more-button").hover();
  expect(await css(page, '[data-testid="tools.more-button"]', ["background-color"])).toEqual({ "background-color": "rgba(0, 0, 0, 0)" });
  // The separator.
  expect(await css(page, ".gk-toolbar-sep", ["width", "height", "background-color", "margin-left"])).toEqual({
    width: "1px",
    height: "24px",
    "background-color": "rgb(46, 45, 57)",
    "margin-left": "4px",
  });
});

test("the ⋮ menu looks as Excalidraw's: 32 px entries with 16 px icons, names, keys on the right", async ({ page }) => {
  await open(page);
  await page.getByTestId("tools.more-button").click();
  expect(await css(page, '[data-testid="tools.more"]', ["padding", "gap", "border-radius", "background-color", "min-width", "margin-top"])).toEqual({
    padding: "8px",
    gap: "1px",
    "border-radius": "8px",
    "background-color": "rgb(35, 35, 41)",
    "min-width": "190px",
    "margin-top": "6px",
  });
  for (const id of MORE) {
    const item = `[data-testid="tools.more.${id}"]`;
    expect((await page.locator(item).boundingBox())!.height, id).toBe(32);
    const svg = (await page.locator(`${item} svg`).boundingBox())!;
    expect([svg.width, svg.height], id).toEqual([16, 16]);
  }
  expect(await css(page, '[data-testid="tools.more.lasso"]', ["padding", "column-gap", "font-size", "border-radius", "color"])).toEqual({
    padding: "0px 8px",
    "column-gap": "10px",
    "font-size": "14px",
    "border-radius": "6px",
    color: "rgb(227, 227, 232)",
  });
  expect(await css(page, '[data-testid="tools.more.lasso"] .gk-more-item__shortcut', ["opacity"])).toEqual({ opacity: "0.5" });
  // Keys on the right, only where the key works (Markup: none yet).
  const keys = await page
    .getByTestId("tools.more")
    .getByRole("menuitem")
    .evaluateAll((els) => els.map((e) => e.querySelector(".gk-more-item__shortcut")?.textContent ?? ""));
  expect(keys).toEqual(["9", "I", "W", "", "T", "P"]);
});

test("every key hint shown works: it picks its tool (Board and Map make one), and the tooltip says it", async ({ page }) => {
  await open(page);
  const hints = await page
    .getByTestId("toolbar")
    .locator(".gk-tool")
    .evaluateAll((bs) => bs.map((b) => [b.getAttribute("data-value") ?? "", b.querySelector(".gk-tool__kbd")?.textContent ?? ""]));
  expect(hints).toEqual([
    ["select", "V"],
    ["rectangle", "R"],
    ["arrow", "A"],
    ["line", "L"],
    ["board", "B"],
    ["map", "M"],
  ]);
  await expect(page.getByTestId("tools.rectangle")).toHaveAttribute("title", "Rectangle — R or 2");
  await expect(page.getByTestId("tools.board")).toHaveAttribute("title", "Board — B");
  const want: Record<string, string> = { select: "select", rectangle: "geo", arrow: "arrow", line: "line" };
  for (const [id, key] of hints) {
    if (!want[id]) continue;
    await page.keyboard.press("v");
    await page.keyboard.press(key.toLowerCase());
    expect(await tool(page), `${key} → ${id}`).toBe(want[id]);
  }
  await page.keyboard.press("Escape");
  await page.keyboard.press("b");
  await expect.poll(() => shapeTypes(page)).toEqual(["boardkit-board"]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await expect.poll(() => shapeTypes(page)).toEqual(["boardkit-board", "linkkit-map"]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // The ⋮ menu's keys.
  for (const [key, id] of [
    ["w", "lasso"],
    ["t", "text"],
    ["p", "draw"],
  ]) {
    await page.keyboard.press("v");
    await page.keyboard.press(key);
    expect(await tool(page), `${key} → ${id}`).toBe(id);
  }
  await page.keyboard.press("v");
  await page.keyboard.press("i");
  await expect(page.locator(".tlui-dialog__content")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tlui-dialog__content")).toHaveCount(0);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("9")]);
  expect(chooser).toBeTruthy();
});

test("screenshots of the bar and the open ⋮ menu, to compare with Excalidraw's (screenshots/)", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await open(page);
  await page.getByTestId("toolbar").screenshot({ path: "screenshots/gauntlet-toolbar.png" });
  await page.getByTestId("tools.more-button").click();
  const bar = (await page.getByTestId("toolbar").boundingBox())!;
  const menu = (await page.getByTestId("tools.more").boundingBox())!;
  const x = Math.min(bar.x, menu.x) - 12;
  const right = Math.max(bar.x + bar.width, menu.x + menu.width) + 12;
  await page.screenshot({ path: "screenshots/gauntlet-toolbar-menu.png", clip: { x, y: 0, width: right - x, height: menu.y + menu.height + 12 } });
});
