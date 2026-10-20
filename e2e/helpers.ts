import { expect, type BrowserContext, type Frame, type Locator, type Page } from "@playwright/test";

/**
 * Shared by the canvas e2e. Each test runs in a fresh, empty browser
 * profile, so the only boards and maps are the ones it makes here.
 */

/**
 * Waits until tldraw has saved the whiteboard to IndexedDB: every drawing
 * record in the page's store is stored as it is now (and nothing stored
 * that isn't), and this tab's saved session is on the current page. tldraw
 * saves 350 ms after a change, and a reload or a new tab before that loses
 * it: wait for this, not a fixed time, before either.
 */
export async function whiteboardSaved(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const editor = (window as any).editor;
          const stable = (v: unknown): string =>
            JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
          const want = editor.store.serialize("document") as Record<string, unknown>;
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const open = indexedDB.open("TLDRAW_DOCUMENT_v2gauntlet-whiteboard");
            open.onsuccess = () => resolve(open.result);
            open.onerror = () => reject(open.error);
          });
          const read = <T,>(store: string, op: (s: IDBObjectStore) => IDBRequest<T>) =>
            new Promise<T>((resolve, reject) => {
              const req = op(db.transaction(store).objectStore(store));
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
          try {
            const keys = (await read("records", (s) => s.getAllKeys())).map(String);
            const values = await read("records", (s) => s.getAll());
            const stored = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
            if (keys.length !== Object.keys(want).length) return `stored ${keys.length} records, store has ${Object.keys(want).length}`;
            const stale = Object.keys(want).find((id) => stable(stored[id]) !== stable(want[id]));
            if (stale) return `${stale} not saved yet`;
            const session = await read<{ snapshot?: { currentPageId?: string } } | undefined>("session_state", (s) => s.get((window as any).TLDRAW_TAB_ID_v2 ?? ""));
            if (session?.snapshot?.currentPageId !== editor.getCurrentPageId()) return "current page not saved yet";
            return "saved";
          } finally {
            db.close();
          }
        }),
      { message: "tldraw saved the whiteboard to IndexedDB", timeout: 10_000 },
    )
    .toBe("saved");
}

/** Boardkit's first-visit board: its id. */
export async function seedBoard(context: BrowserContext): Promise<string> {
  const bk = await context.newPage();
  await bk.goto("/boardkit/");
  const notNow = bk.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 3_000 }).catch(() => false)) await notNow.click();
  await expect(bk.getByRole("button", { name: "Switch board" })).toBeVisible();
  await expect.poll(() => bk.evaluate(() => localStorage.getItem("boardkit:registry"))).not.toBeNull();
  const id = await bk.evaluate(() => (JSON.parse(localStorage.getItem("boardkit:registry")!) as { activeBoardId: string }).activeBoardId);
  await bk.close();
  return id;
}

/** A new Linkkit tree map whose start box is `name`: its id. */
export async function seedMap(context: BrowserContext, name: string): Promise<string> {
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await lk.getByRole("button", { name: /^Switch map/ }).click();
  await lk.getByRole("menuitem", { name: /^\+ New/ }).click();
  await lk.getByRole("menuitem", { name: /^Map with tree rules/ }).click();
  await expect(lk.getByRole("textbox", { name: "Box name" })).toBeFocused();
  await lk.keyboard.type(name);
  await lk.keyboard.press("Enter");
  await expect(lk.getByRole("textbox", { name: "Box name" })).toHaveCount(0);
  const idOf = () =>
    lk.evaluate((name) => {
      const registry = JSON.parse(localStorage.getItem("linkkit:registry") ?? '{"maps":[]}') as { maps: { id: string; name: string }[] };
      return registry.maps.find((m) => m.name === name)?.id ?? null;
    }, name);
  // Saves wait for a short quiet moment.
  await expect.poll(idOf).not.toBeNull();
  const id = (await idOf())!;
  await lk.close();
  return id;
}

export const canvasEl = (page: Page) => page.getByTestId("canvas");
export const stones = (page: Page) => page.locator("[data-stone-id]");
export const pageEl = (page: Page, index: number) => page.locator(`section[data-page-index="${index}"]`);

/** Adds the board or map named `name` to the current page; the new widget. */
export async function addStone(page: Page, name: string): Promise<Locator> {
  const before = await stones(page).count();
  await page.getByRole("button", { name: "+ Add stone" }).click();
  await page.getByRole("dialog", { name: "Add a stone" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(stones(page)).toHaveCount(before + 1);
  return stones(page).nth(before);
}

/** The app inside a widget's frame. */
export async function frameOf(stone: Locator): Promise<Frame> {
  await expect(stone.locator("iframe")).toHaveCount(1);
  return (await (await stone.locator("iframe").elementHandle())!.contentFrame())!;
}

export const box = async (l: Locator) => (await l.boundingBox())!;

/** The layout as saved. */
export const savedLayout = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("gauntlet:canvas")!) as { pages: { id: string; stones: { id: string; x: number; y: number; w: number; h: number }[] }[] });

/** Drags from the middle of `from` by (dx, dy), in steps like a hand would. */
export async function dragBy(page: Page, from: Locator, dx: number, dy: number, at?: { x: number; y: number }) {
  const b = await box(from);
  const x = at ? b.x + at.x : b.x + b.width / 2;
  const y = at ? b.y + at.y : b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

/** The scroll position of the canvas, and where each page starts. */
export const canvasScroll = (page: Page) => canvasEl(page).evaluate((el) => el.scrollTop);

/** Index of the page aligned at the top of the canvas (its top one margin
    below the canvas's top), or null when none is. */
export const alignedPage = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>("[data-testid=canvas]")!.getBoundingClientRect();
    for (const section of document.querySelectorAll<HTMLElement>("section[data-page-index]")) {
      if (Math.abs(section.getBoundingClientRect().top - canvas.top - 24) <= 1) return Number(section.dataset.pageIndex);
    }
    return null;
  });
