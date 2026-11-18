import { expect, test, type Page } from "./test";

/**
 * GT-15: the browser tab's title says where you are, "Gauntlet · <page
 * name>" (src/pages/tabTitle.ts). Switching page with ‹ ›, a new page,
 * a renamed page and a reload each show in the title. The test's pages are
 * its own (a fresh browser profile) and deleted at the end.
 */

const pageName = (page: Page) => page.evaluate(() => (window as any).editor.getCurrentPage().name as string);

test("GT-15: the tab title follows the page: ‹ ›, a new page, a rename, a reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
  const first = await pageName(page);
  await expect(page).toHaveTitle(`Gauntlet · ${first}`);

  // › on the last page makes a new one and goes there
  const before = await page.evaluate(() => (window as any).editor.getPages().map((p: any) => p.id) as string[]);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).editor.getPages().length)).toBe(before.length + 1);
  const second = await pageName(page);
  expect(second).not.toBe(first);
  await expect(page).toHaveTitle(`Gauntlet · ${second}`);

  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page).toHaveTitle(`Gauntlet · ${first}`);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveTitle(`Gauntlet · ${second}`);

  // A rename (set up through the editor, as tldraw's page menu does it)
  await page.evaluate(() => {
    const editor = (window as any).editor;
    editor.renamePage(editor.getCurrentPageId(), "GT-15 test page");
  });
  await expect(page).toHaveTitle("Gauntlet · GT-15 test page");

  // A reload opens on that page, and the title says so
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await expect(page).toHaveTitle("Gauntlet · GT-15 test page");

  // Clean up: the test's page goes
  await page.evaluate((keep) => {
    const editor = (window as any).editor;
    const made = editor.getPages().filter((p: any) => !keep.includes(p.id));
    editor.setCurrentPage(keep[0]);
    for (const p of made) editor.deletePage(p.id);
  }, before);
  await expect(page).toHaveTitle(`Gauntlet · ${first}`);
});
