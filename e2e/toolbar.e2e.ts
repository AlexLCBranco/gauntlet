import { expect, test, type Page } from "@playwright/test";

/**
 * The toolbar is no bigger than Excalidraw's (hand-test round item 2, owner
 * 2026-10-21). Excalidraw's own toolbar, measured on excalidraw.com with
 * this browser at 1400, 1915 and 1920 px wide windows on 2026-10-21: 542 x
 * 44 px at every width. Excalidraw's tools, Board and Map are on the row;
 * lasso and highlighter are in the "more" menu and keep their keys.
 */

const EXCALIDRAW = { w: 542, h: 44 };
const ROW = ["select", "hand", "rectangle", "diamond", "ellipse", "arrow", "line", "draw", "text", "asset", "eraser", "board", "map"];
const MOVED = [
  { id: "lasso", key: "w" },
  { id: "highlight", key: "Shift+D" },
];

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}
const tool = (page: Page) => page.evaluate(() => (window as any).editor.getCurrentToolId() as string);
const bar = (page: Page) => page.locator(".gauntlet-top-toolbar .tlui-main-toolbar__tools");
const rowTools = (page: Page) =>
  bar(page)
    .locator("button[data-value]")
    .evaluateAll((bs) => bs.filter((b) => (b as HTMLElement).offsetParent).map((b) => b.getAttribute("data-value")));

for (const width of [1400, 1915, 1920]) {
  test(`at ${width} px the toolbar is no bigger than Excalidraw's, with Excalidraw's tools, Board and Map on it, also while a moved tool is on`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await open(page);
    const check = async () => {
      const b = (await bar(page).boundingBox())!;
      expect(b.width, "width").toBeLessThanOrEqual(EXCALIDRAW.w);
      expect(b.height, "height").toBeLessThanOrEqual(EXCALIDRAW.h);
      expect(await rowTools(page)).toEqual(ROW);
      return b;
    };
    const first = await check();
    // A drawing tool's lock button doesn't push the toolbar down.
    await page.keyboard.press("r");
    expect((await check()).y).toBe(first.y);
    // A tool from the "more" menu stays off the row; Map stays on it.
    for (const { key } of MOVED) {
      await page.keyboard.press("Escape");
      await page.keyboard.press(key);
      expect((await check()).y).toBe(first.y);
    }
  });
}

test("every moved tool is reachable from the \"more\" menu and by its key", async ({ page }) => {
  await page.setViewportSize({ width: 1915, height: 1000 });
  await open(page);
  for (const { id, key } of MOVED) {
    await page.getByTestId("tools.more-button").click();
    await page.getByTestId(`tools.more.${id}`).click();
    expect(await tool(page)).toBe(id);
    await page.keyboard.press("Escape");
    await page.keyboard.press("v");
    expect(await tool(page)).toBe("select");
    await page.keyboard.press(key);
    expect(await tool(page)).toBe(id);
    await page.keyboard.press("v");
  }
  // Every tool on the row keeps its key too.
  const keys: Record<string, string> = { select: "1", hand: "h", rectangle: "2", diamond: "3", ellipse: "4", arrow: "5", line: "6", draw: "7", text: "8", eraser: "0" };
  for (const [id, key] of Object.entries(keys)) {
    await page.keyboard.press(key);
    // The row's button for it is the pressed one (rectangle, diamond and
    // ellipse are all tldraw's "geo" tool).
    await expect(bar(page).locator(`button[data-value="${id}"]`), key).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
  }
});
