import { expect, type BrowserContext, type Locator, type Page } from "./test";

/**
 * Shared by the e2e. Each test runs in a fresh, empty browser profile, so
 * the only boards and maps are the ones it makes here.
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

export const box = async (l: Locator) => (await l.boundingBox())!;

/** The list of Boardkit's boards: main menu → "Add existing board…" (the
    toolbar's Board button makes a new one). */
export async function openBoardList(page: Page) {
  await page.getByTestId("main-menu.button").click();
  await page.getByRole("menuitem", { name: "Add existing board…" }).click();
  await expect(page.getByTestId("board-picker")).toBeVisible();
}

/** The list of Linkkit's maps: main menu → "Add existing map…". */
export async function openMapList(page: Page) {
  await page.getByTestId("main-menu.button").click();
  await page.getByRole("menuitem", { name: "Add existing map…" }).click();
  await expect(page.getByTestId("map-picker")).toBeVisible();
}
