import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "./test";

/**
 * The case switcher (owner, Edges round item 7; src/style/textCase.ts):
 * Aa / AA / aa in the style panel, a display style: the typed text is kept.
 * Fresh profile.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** A text, a labelled box and a labelled arrow (set up). */
const three = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).editor;
    const rt = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
    e.createShapes([
      { id: "shape:ct", type: "text", x: 300, y: 200, props: { richText: rt("Lakers ml") } },
      { id: "shape:cg", type: "geo", x: 300, y: 300, props: { w: 220, h: 80, richText: rt("Tv Tag") } },
      { id: "shape:ca", type: "arrow", x: 700, y: 300, props: { start: { x: 0, y: 0 }, end: { x: 300, y: 0 }, richText: rt("Pts O 24.5") } },
    ]);
  });

const shown = (page: Page, id: string) => page.locator(`[data-shape-id="${id}"]`).innerText();
const typed = (page: Page, id: string) => page.evaluate((id) => (window as any).editor.getShape(id).props.richText.content[0].content[0].text as string, id);
const svgOf = (page: Page, ids: string[]) => page.evaluate(async (ids) => (await (window as any).editor.getSvgString(ids))?.svg as string, ids);
const select = (page: Page, ...ids: string[]) => page.evaluate((ids) => void (window as any).editor.select(...ids), ids);

test("each button on one item and on several at once (text, box label, arrow label); the typed text is kept; one undo step; the copy-as-image and page images show the shown case", async ({ page }) => {
  await open(page);
  await three(page);

  // One: the text, AA.
  await select(page, "shape:ct");
  await page.getByTestId("case-upper").click();
  await expect.poll(() => shown(page, "shape:ct")).toBe("LAKERS ML");
  expect(await typed(page, "shape:ct")).toBe("Lakers ml");
  // On one line still: the box grew with the caps.
  const h = await page.evaluate(() => (window as any).editor.getShapePageBounds("shape:ct").h);
  expect(h).toBeLessThan(45);

  // Several: aa on all three, one undo step.
  await select(page, "shape:ct", "shape:cg", "shape:ca");
  await page.getByTestId("case-lower").click();
  await expect.poll(() => shown(page, "shape:cg")).toBe("tv tag");
  await expect.poll(() => shown(page, "shape:ct")).toBe("lakers ml");
  expect(await page.locator('[data-shape-id="shape:ca"]').innerText()).toContain("pts o 24.5");
  await expect(page.getByTestId("case-lower")).toHaveAttribute("aria-pressed", "true");
  for (const id of ["shape:ct", "shape:cg", "shape:ca"]) expect(await typed(page, id)).not.toMatch(/^[a-z ]+$/);
  // Images show the shown case.
  const svg = await svgOf(page, ["shape:ct", "shape:cg", "shape:ca"]);
  expect(svg).toContain("tv tag");
  expect(svg).not.toContain("Tv Tag");
  expect(svg).toContain("pts o 24.5");

  // One Ctrl+Z: all three back to what they were (the text in caps, the others as typed).
  await page.mouse.move(800, 700);
  await page.keyboard.press("Control+z");
  await expect.poll(() => shown(page, "shape:cg")).toBe("Tv Tag");
  await expect.poll(() => shown(page, "shape:ct")).toBe("LAKERS ML");

  // Aa: back to as typed, nothing lost.
  await select(page, "shape:ct");
  await page.getByTestId("case-as").click();
  await expect.poll(() => shown(page, "shape:ct")).toBe("Lakers ml");
  expect(await page.evaluate(() => (window as any).editor.getShape("shape:ct").meta.textCase ?? null)).toBeNull();
  // Mixed selection: the panel says so (no button pressed).
  await select(page, "shape:ct", "shape:cg");
  await page.getByTestId("case-upper").click();
  await select(page, "shape:ct");
  await page.getByTestId("case-as").click();
  await select(page, "shape:ct", "shape:cg");
  for (const c of ["as", "upper", "lower"]) await expect(page.getByTestId(`case-${c}`)).toHaveAttribute("aria-pressed", "false");
});

test("survives a reload and a backup restored into a fresh browser", async ({ page, browser, baseURL }) => {
  await open(page);
  await three(page);
  await select(page, "shape:cg");
  await page.getByTestId("case-upper").click();
  await expect.poll(() => shown(page, "shape:cg")).toBe("TV TAG");
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect.poll(() => shown(page, "shape:cg")).toBe("TV TAG");
  expect(await typed(page, "shape:cg")).toBe("Tv Tag");

  await page.goto("/backup/");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save a backup" }).click()]);
  const file = await readFile((await download.path())!, "utf-8");
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
  const fresh = await ctx.newPage();
  await fresh.goto("/backup/");
  await fresh.getByLabel("Backup file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(file) });
  const dialog = fresh.getByRole("dialog", { name: "Replace what's here with this backup?" });
  await Promise.all([fresh.waitForEvent("download"), dialog.getByRole("button", { name: "Replace with this backup" }).click()]);
  await expect(fresh.getByRole("status")).toContainText("Restored");
  await open(fresh);
  await expect.poll(() => shown(fresh, "shape:cg")).toBe("TV TAG");
  expect(await typed(fresh, "shape:cg")).toBe("Tv Tag");
  await ctx.close();
});
