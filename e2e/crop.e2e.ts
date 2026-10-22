import { readFileSync } from "node:fs";

import { expect, test, type Page } from "./test";

import { whiteboardSaved } from "./helpers";
import { openWhiteboard } from "./excalidrawChecks";

/**
 * Crop in the style panel (Excalidraw parity item 3, owner 2026-10-21): a
 * "Crop" button in the panel's Actions row while one picture is selected,
 * starting tldraw's own crop mode, as the floating crop button does. The
 * pictures come from the made-up Excalidraw drawing
 * (e2e/fixtures/excalidraw-sample.excalidraw): one cropped there, one not.
 */

test.use({ viewport: { width: 1920, height: 1080 } });

const sample = readFileSync(new URL("./fixtures/excalidraw-sample.excalidraw", import.meta.url), "utf-8");

type Crop = { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } } | null;
type Img = { id: string; w: number; h: number; crop: Crop };

const image = (page: Page, excId: string) =>
  page.evaluate((excId) => {
    const s = (window as any).editor.getCurrentPageShapes().find((s: any) => s.meta.excalidrawId === excId);
    return { id: s.id, w: s.props.w, h: s.props.h, crop: s.props.crop };
  }, excId) as Promise<Img>;

async function importSample(page: Page) {
  await page.evaluate((text) => navigator.clipboard.writeText(text), JSON.stringify({ ...JSON.parse(sample), type: "excalidraw/clipboard" }));
  await page.mouse.move(960, 540);
  await page.keyboard.press("Control+v");
  await expect(page.getByTestId("import-notice")).toBeVisible();
  await page.getByTestId("import-notice").getByRole("button", { name: "Close" }).click();
}

const select = (page: Page, id: string) => page.evaluate((id) => void (window as any).editor.select(id), id);

/** Drags the picture's bottom-right crop handle up and left by `by` px. */
async function cropCorner(page: Page, id: string, by: number) {
  const corner = await page.evaluate((id) => {
    const e = (window as any).editor;
    const b = e.getShapePageBounds(id);
    return e.pageToScreen({ x: b.maxX, y: b.maxY });
  }, id);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x - by / 2, corner.y - by / 2, { steps: 4 });
  await page.mouse.move(corner.x - by, corner.y - by, { steps: 4 });
  await page.mouse.up();
}

test("Crop in the panel's Actions starts tldraw's crop mode on the selected picture, keeping its imported crop; the crop is one undo step and survives reload, duplicate and copy/paste", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWhiteboard(page);
  await importSample(page);
  const crop = page.getByTestId("action-crop");

  // Absent with nothing selected, and with something that isn't a picture.
  await page.evaluate(() => void (window as any).editor.selectNone());
  await expect(crop).toHaveCount(0);
  const box = await page.evaluate(() => (window as any).editor.getCurrentPageShapes().find((s: any) => s.meta.excalidrawId === "rect-dark").id);
  await select(page, box);
  await expect(page.getByTestId("style-panel")).toBeVisible();
  await expect(crop).toHaveCount(0);

  // The picture cropped in Excalidraw: Crop starts tldraw's crop mode with that crop.
  const before = await image(page, "image-1");
  expect(before.crop).toEqual({ topLeft: { x: 0.5, y: 0 }, bottomRight: { x: 1, y: 1 } });
  await select(page, before.id);
  await expect(crop).toHaveAttribute("title", "Crop");
  await crop.click();
  await expect.poll(() => page.evaluate(() => [(window as any).editor.isIn("select.crop"), (window as any).editor.getCroppingShapeId()])).toEqual([true, before.id]);
  expect((await image(page, "image-1")).crop).toEqual(before.crop);

  // Crop it smaller from its corner.
  await cropCorner(page, before.id, 20);
  const after = await image(page, "image-1");
  expect(after.w).toBeLessThan(before.w - 5);
  expect(after.h).toBeLessThan(before.h - 5);
  expect(after.crop).not.toEqual(before.crop);
  // Enter is done (tldraw's way): the crop stays.
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).editor.isIn("select.crop"))).toBe(false);
  expect(await image(page, "image-1")).toEqual(after);
  // Escape cancels a crop session (tldraw's way): back to how it was.
  await crop.click();
  await cropCorner(page, before.id, 10);
  expect(await image(page, "image-1")).not.toEqual(after);
  await page.keyboard.press("Escape");
  await expect.poll(() => image(page, "image-1")).toEqual(after);

  // One Ctrl+Z puts the picture back as it was; Ctrl+Y crops it again.
  await page.keyboard.press("Control+z");
  await expect.poll(() => image(page, "image-1")).toEqual(before);
  await page.keyboard.press("Control+y");
  await expect.poll(() => image(page, "image-1")).toEqual(after);

  // Kept through a reload.
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  expect(await image(page, "image-1")).toEqual(after);

  // Duplicate and copy/paste keep it.
  await select(page, after.id);
  const ids = () => page.evaluate(() => (window as any).editor.getCurrentPageShapes().map((s: any) => s.id) as string[]);
  const old = await ids();
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await ids()).length).toBe(old.length + 1);
  const dup = (await ids()).find((id) => !old.includes(id))!;
  const dupProps = await page.evaluate((id) => (window as any).editor.getShape(id).props, dup);
  expect([dupProps.w, dupProps.h, dupProps.crop]).toEqual([after.w, after.h, after.crop]);
  await select(page, after.id);
  await page.keyboard.press("Control+c");
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.read()).some((i) => i.types.includes("text/html")))).toBe(true);
  const old2 = await ids();
  await page.keyboard.press("Control+v");
  await expect.poll(async () => (await ids()).length).toBe(old2.length + 1);
  const pasted = (await ids()).find((id) => !old2.includes(id))!;
  const pastedProps = await page.evaluate((id) => (window as any).editor.getShape(id).props, pasted);
  expect([pastedProps.w, pastedProps.h, pastedProps.crop]).toEqual([after.w, after.h, after.crop]);

  // tldraw's floating crop button is still there too.
  await select(page, after.id);
  await expect(page.locator(".tlui-contextual-toolbar").getByRole("button", { name: /crop/i }).first()).toBeVisible();
});

test("Crop works on an uncropped picture too, and a crop made right before a reload is kept", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWhiteboard(page);
  await importSample(page);
  const before = await image(page, "image-2");
  expect(before.crop).toBeNull();
  await select(page, before.id);
  await page.getByTestId("action-crop").click();
  await expect.poll(() => page.evaluate(() => (window as any).editor.getCroppingShapeId())).toBe(before.id);
  await cropCorner(page, before.id, 30);
  await page.keyboard.press("Enter");
  const after = await image(page, "image-2");
  expect(after.crop).not.toBeNull();
  // Reload at once: the unsaved journal keeps it.
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  expect(await image(page, "image-2")).toEqual(after);
});
