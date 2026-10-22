import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { whiteboardSaved } from "./helpers";
import { checkBothModes, checkImported, imported, openWhiteboard, type ExcElement } from "./excalidrawChecks";

/**
 * Excalidraw paste and import that keep everything (Excalidraw parity item
 * 2, owner 2026-10-21), with a small drawing made for the tests
 * (e2e/fixtures/excalidraw-sample.excalidraw: one of each element kind, a
 * cropped picture, a frame, a group, an embed that can't be shown). The
 * owner's own drawing is checked by realexcalidraw.e2e.ts. Fresh, empty
 * browser profile per test.
 */

test.use({ viewport: { width: 1920, height: 1080 } });

const FIXTURE = new URL("./fixtures/excalidraw-sample.excalidraw", import.meta.url);
const sample = JSON.parse(readFileSync(FIXTURE, "utf-8")) as { elements: ExcElement[]; files: Record<string, unknown> };
const clipboardOf = (files: Record<string, unknown> | undefined) => JSON.stringify({ type: "excalidraw/clipboard", elements: sample.elements, files });

async function paste(page: Page, text: string, at: { x: number; y: number }) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.press("Control+v");
  await expect(page.getByTestId("import-notice")).toBeVisible();
}

test("pasting a copied Excalidraw drawing keeps every element's place, size, colours, fonts and pictures, lands at the pointer, and is one undo step", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWhiteboard(page);
  await paste(page, clipboardOf(sample.files), { x: 960, y: 560 });

  const shapes = await imported(page);
  await checkImported(page, sample.elements, shapes);
  // Centred on the pointer.
  const box = await page.evaluate(() => {
    const e = (window as any).editor;
    const b = e.getSelectionPageBounds();
    return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
  });
  expect(Math.abs(box.cx - 960)).toBeLessThan(2);
  expect(Math.abs(box.cy - 560)).toBeLessThan(2);
  // The embed is listed, and is a visible placeholder.
  await expect(page.getByTestId("import-not-converted")).toHaveText(/embeddable \(embed-1\): can't be shown on the whiteboard/);
  expect(shapes.find((s) => s.meta.excalidrawId === "embed-1")!.meta.placeholder).toBe("embeddable");

  // One Ctrl+Z takes the whole paste back; Ctrl+Y brings it back.
  const count = await page.evaluate(() => (window as any).editor.getCurrentPageShapes().length);
  await page.keyboard.press("Control+z");
  await expect.poll(() => page.evaluate(() => (window as any).editor.getCurrentPageShapes().length)).toBe(0);
  await page.keyboard.press("Control+y");
  await expect.poll(() => page.evaluate(() => (window as any).editor.getCurrentPageShapes().length)).toBe(count);

  // Kept through a reload, pictures included.
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await checkImported(page, sample.elements, await imported(page));
});

test("imported colours follow Excalidraw's dark mode: dark mode draws them as Excalidraw's does, light mode as stored, pictures untouched, also after a reload", async ({ page }) => {
  await openWhiteboard(page);
  await page.getByTestId("main-menu.button").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import Excalidraw file…" }).click();
  await (await chooser).setFiles(FIXTURE.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  await expect(page.getByTestId("import-notice")).toBeVisible();
  await checkBothModes(page, sample.elements);
  await whiteboardSaved(page);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await checkBothModes(page, sample.elements);
});

test("a .excalidraw file opened from the main menu, or dropped on the whiteboard, is imported the same way", async ({ page }) => {
  await openWhiteboard(page);
  await page.getByTestId("main-menu.button").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import Excalidraw file…" }).click();
  await (await chooser).setFiles(FIXTURE.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  await expect(page.getByTestId("import-notice")).toBeVisible();
  await checkImported(page, sample.elements, await imported(page));

  // Dropped on the whiteboard: lands where it is dropped.
  await page.evaluate(() => {
    const e = (window as any).editor;
    e.selectAll();
    e.deleteShapes(e.getSelectedShapeIds());
  });
  const text = readFileSync(FIXTURE, "utf-8");
  await page.evaluate(
    ({ text, x, y }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], "drawing.excalidraw", { type: "" }));
      const target = document.querySelector(".tl-canvas")!;
      for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
    { text, x: 900, y: 600 },
  );
  await expect.poll(() => page.evaluate(() => (window as any).editor.getCurrentPageShapes().length)).toBeGreaterThan(10);
  await checkImported(page, sample.elements, await imported(page));
  const center = await page.evaluate(() => {
    const b = (window as any).editor.getSelectionPageBounds();
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  });
  expect(Math.abs(center.x - 900)).toBeLessThan(2);
  expect(Math.abs(center.y - 600)).toBeLessThan(2);
});

test("a paste without the picture's data shows a placeholder that says so, never an empty box", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWhiteboard(page);
  await paste(page, clipboardOf(undefined), { x: 960, y: 560 });
  await expect(page.getByTestId("import-not-converted")).toContainText("image (image-1): picture not included in the paste, shown as a placeholder");
  const placeholders = await page.evaluate(() =>
    (window as any).editor
      .getCurrentPageShapes()
      .filter((s: any) => s.meta.placeholder === "image")
      .map((s: any) => document.querySelector(`[data-shape-id="${s.id}"]`)!.textContent),
  );
  expect(placeholders).toEqual(["Picture not included in the paste — import the .excalidraw file instead", "Picture not included in the paste — import the .excalidraw file instead"]);
});

test("a drawing bigger than the page grows the page instead of being pulled apart", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWhiteboard(page);
  // The sample spread four times wider than the window.
  const wide = sample.elements.map((e) => ({ ...e, x: e.x * 6, width: e.type === "frame" ? e.width : e.width }));
  await paste(page, JSON.stringify({ type: "excalidraw/clipboard", elements: wide, files: sample.files }), { x: 960, y: 560 });
  await page.waitForTimeout(300);
  const shapes = await imported(page);
  const at = (id: string) => shapes.find((s) => s.meta.excalidrawId === id)!;
  // Every element keeps its place relative to the others.
  // (Arrows are left out: bound to boxes that moved apart, they follow the boxes.)
  for (const e of wide.filter((e) => ["rectangle", "ellipse", "diamond", "image"].includes(e.type) && !e.isDeleted && !e.containerId && !e.frameId && !e.angle)) {
    expect(at(e.id).page.x - at("rect-dark").page.x, e.id).toBeCloseTo(e.x - 600, 0);
  }
  // It starts at the page's left edge and the page reaches past its right end.
  const page_ = await page.evaluate(() => {
    const e = (window as any).editor;
    const b = e.getCurrentPageBounds();
    return { bounds: { minX: b.x, maxX: b.x + b.w }, camera: e.getCameraOptions().constraints.bounds };
  });
  expect(page_.bounds.minX).toBeCloseTo(0, 0);
  expect(page_.camera.w).toBeGreaterThanOrEqual(page_.bounds.maxX - 0.5);
});
