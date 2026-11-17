import { expect, test, type Page } from "./test";

/**
 * GT-1: one broken widget never breaks the page (src/widgets/WidgetBoundary.tsx).
 * Each widget kind is made to throw while rendering (the test hook
 * `window.__gkFailWidgets`); its box says so, and the rest of the whiteboard
 * still selects, drags, types and changes page. "Try again" brings it back.
 * Fresh browser profile.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

const KINDS = [
  { kind: "board", type: "boardkit-board", props: { w: 400, h: 260 } },
  { kind: "map", type: "linkkit-map", props: { w: 400, h: 260 } },
  { kind: "slate", type: "calendarkit-slate", props: { w: 400, h: 200, date: "2026-11-04" } },
  { kind: "embed", type: "web-embed", props: { w: 400, h: 260, url: "https://example.com/" } },
] as const;

const rt = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const textOf = (page: Page, id: string) => page.evaluate((id) => (window as any).editor.getShape(id).props.richText.content[0].content[0].text as string, id);
const shapeAt = (page: Page, id: string) => page.evaluate((id) => { const s = (window as any).editor.getShape(id); return { x: s.x, y: s.y }; }, id);
const selected = (page: Page) => page.evaluate(() => (window as any).editor.getSelectedShapeIds() as string[]);
/** A point of a shape on screen: its middle, or (fx, fy) of the way across. */
const middle = (page: Page, id: string, fx = 0.5, fy = 0.5) =>
  page.evaluate(({ id, fx, fy }) => {
    const e = (window as any).editor;
    const b = e.getShapePageBounds(id);
    return e.pageToScreen({ x: b.x + b.w * fx, y: b.y + b.h * fy }) as { x: number; y: number };
  }, { id, fx, fy });

async function drag(page: Page, id: string, dx: number, fx = 0.5, fy = 0.5) {
  const m = await middle(page, id, fx, fy);
  await page.mouse.move(m.x, m.y);
  await page.mouse.down();
  await page.mouse.move(m.x + dx / 2, m.y, { steps: 4 });
  await page.mouse.move(m.x + dx, m.y, { steps: 4 });
  await page.mouse.up();
}

for (const { kind, type, props } of KINDS) {
  test(`a failing ${kind} widget shows "failed" and the rest of the page keeps working`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.waitForFunction(() => "editor" in window);
    await expect(page.getByTestId("sheet")).toBeVisible();
    await page.evaluate(() => void (window as any).editor.setCamera({ x: 0, y: 0, z: 1 }));

    await page.evaluate(({ kind, type, props, text }) => {
      (window as any).__gkFailWidgets = [kind];
      const e = (window as any).editor;
      e.createShapes([
        { id: "shape:wf", type, x: 300, y: 100, props },
        { id: "shape:box", type: "geo", x: 900, y: 120, props: { w: 160, h: 100, fill: "solid" } },
        { id: "shape:txt", type: "text", x: 900, y: 450, props: { richText: text } },
      ]);
    }, { kind, type, props, text: rt("Hello") });

    const failed = page.locator('[data-shape-id="shape:wf"] [data-testid="widget-failed"]');
    await expect(failed).toBeVisible();
    await expect(failed).toHaveAttribute("data-kind", kind);
    await expect(failed).toContainText("widget failed");
    // Not the whole page's crash screen.
    await expect(page.locator(".tl-error-boundary")).toHaveCount(0);

    // Drag and select: the box moves and is selected; the failed widget moves too (it is still a shape).
    const box0 = await shapeAt(page, "shape:box");
    await drag(page, "shape:box", 120);
    await expect.poll(async () => (await shapeAt(page, "shape:box")).x).toBeGreaterThan(box0.x + 100);
    await expect.poll(() => selected(page)).toEqual(["shape:box"]);
    const wf0 = await shapeAt(page, "shape:wf");
    // (Not its middle: "Try again" is there.)
    await drag(page, "shape:wf", 60, 0.25, 0.2);
    await expect.poll(async () => (await shapeAt(page, "shape:wf")).x).toBeGreaterThan(wf0.x + 40);

    // Type: edit the text (all of it selected, typing replaces it).
    await page.evaluate(() => void (window as any).editor.select("shape:txt"));
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => (window as any).editor.getEditingShapeId())).toBe("shape:txt");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Typed here");
    await page.keyboard.press("Escape");
    await expect.poll(() => textOf(page, "shape:txt")).toBe("Typed here");

    // Change page and back: the other page works, the failed widget still shows its box.
    const pages = await page.evaluate(() => {
      const e = (window as any).editor;
      const first = e.getCurrentPageId();
      e.createPage({ id: "page:wf2", name: "Two" });
      e.setCurrentPage("page:wf2");
      e.createShapes([{ id: "shape:p2", type: "geo", x: 200, y: 200, props: { w: 100, h: 100 } }]);
      return { first, now: e.getCurrentPageId(), count: e.getCurrentPageShapes().length };
    });
    expect(pages).toMatchObject({ now: "page:wf2", count: 1 });
    await expect(page.locator('[data-shape-id="shape:p2"]')).toBeVisible();
    await page.evaluate((id) => void (window as any).editor.setCurrentPage(id), pages.first);
    await expect(failed).toBeVisible();

    // Try again, once the fault is gone: the widget comes back.
    await page.evaluate(() => { (window as any).__gkFailWidgets = []; });
    await failed.getByTestId("widget-retry").click();
    await expect(page.locator('[data-shape-id="shape:wf"] [data-testid="widget-failed"]')).toHaveCount(0);

    // The forced failure is caught by React, not thrown to the page.
    expect(errors.filter((e) => !/Test failure in the/.test(e))).toEqual([]);
  });
}
