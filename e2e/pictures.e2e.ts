import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "./test";

import { whiteboardSaved } from "./helpers";

/**
 * Images on the page (speed session, Part 2; src/images/, src/stamps/).
 * No picture lives as a data: address inside a document record: pasted
 * files, an Excalidraw import and placed stickers store their bytes the
 * way tldraw stores a pasted file, a record found holding one is moved out,
 * and the stamps tray keeps its pictures as pictures. A picture shown
 * small is drawn from a smaller copy, the original when zoomed in or
 * exported. Only the current page's items are in the page.
 */

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** A PNG of this size as a dropped file; returns its bytes' length. */
const dropPicture = (page: Page, w: number, h: number, name: string) =>
  page.evaluate(
    async ({ w, h, name }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      g.fillStyle = "#24507a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff";
      g.font = `${Math.round(h / 12)}px sans-serif`;
      for (let i = 0; i < 10; i++) g.fillText(`${name} line ${i} ${Math.random().toString(36).slice(2)}`, w / 20, (h / 11) * (i + 1));
      const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), "image/png"));
      await (window as any).editor.putExternalContent({ type: "files", files: [new File([blob], `${name}.png`, { type: "image/png" })], point: { x: 700, y: 450 } });
      return blob.size;
    },
    { w, h, name },
  );

const assetsStored = (page: Page) =>
  expect.poll(() => page.evaluate(() => ((window as any).editor.getAssets() as any[]).every((a) => typeof a.props.src === "string" && a.props.src.startsWith("asset:"))), { timeout: 15_000 }).toBe(true);

/** What the whiteboard holds: each asset record's `src`, and whether any
    stored record (IndexedDB) contains a data: picture. */
const records = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => (indexedDB.open("TLDRAW_DOCUMENT_v2gauntlet-whiteboard").onsuccess = (e) => res((e.target as IDBOpenDBRequest).result)));
    const all = await new Promise<unknown[]>((res) => (db.transaction("records").objectStore("records").getAll().onsuccess = (e) => res((e.target as IDBRequest).result)));
    const blobs = await new Promise<IDBValidKey[]>((res) => (db.transaction("assets").objectStore("assets").getAllKeys().onsuccess = (e) => res((e.target as IDBRequest).result)));
    db.close();
    const text = JSON.stringify(all);
    return {
      srcs: ((window as any).editor.getAssets() as any[]).map((a) => String(a.props.src).slice(0, 12)),
      storedHasDataUrl: /data:(image|video)\//.test(text),
      storedChars: text.length,
      blobs: blobs.length,
    };
  });

const drawn = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".tl-canvas img")].filter((i) => i.complete && i.naturalWidth > 0).map((i) => i.naturalWidth).sort((a, b) => a - b));

test.describe("pictures", () => {
  test.setTimeout(120_000);

  test("a pasted file, an Excalidraw import with a picture and a placed sticker: every record points at its picture, none holds it as data: text", async ({ page, context }) => {
    await open(page);
    // A dropped file.
    await dropPicture(page, 400, 225, "dropped");
    await assetsStored(page);
    // An Excalidraw paste with a picture (the sample's files are data: text).
    const sample = JSON.parse(await readFile(new URL("./fixtures/excalidraw-sample.excalidraw", import.meta.url), "utf-8"));
    expect(Object.values(sample.files as Record<string, { dataURL: string }>)[0]!.dataURL).toMatch(/^data:image\//);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate((t) => navigator.clipboard.writeText(t), JSON.stringify({ type: "excalidraw/clipboard", elements: sample.elements, files: sample.files }));
    await page.mouse.move(900, 500);
    await page.keyboard.press("Control+v");
    await expect.poll(() => page.evaluate(() => ((window as any).editor.getAssets() as any[]).length)).toBeGreaterThanOrEqual(2);
    await assetsStored(page);
    // A sticker made from the dropped picture, placed twice.
    await page.evaluate(() => {
      const e = (window as any).editor;
      e.select(e.getCurrentPageShapes().find((s: any) => s.type === "image" && !s.meta?.excalidrawId).id);
    });
    await page.getByTestId("tools.stamps").click();
    await page.getByTestId("stamps-add-selection").click();
    const sticker = page.getByTestId("stamps-tray").getByTestId("stamp");
    await expect(sticker).toHaveCount(1);
    const before = await page.evaluate(() => (window as any).editor.getCurrentPageShapes().length);
    await page.mouse.move(400, 600);
    await sticker.click();
    await page.mouse.move(1000, 700);
    await sticker.click();
    await expect.poll(() => page.evaluate(() => (window as any).editor.getCurrentPageShapes().length)).toBe(before + 2);
    await assetsStored(page);
    await whiteboardSaved(page);

    const r = await records(page);
    for (const src of r.srcs) expect(src).toMatch(/^asset:/);
    expect(r.storedHasDataUrl).toBe(false);
    expect(r.blobs).toBe(r.srcs.length);
    // The tray itself: its pictures as pictures, no data: text.
    const tray = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res) => (indexedDB.open("gauntlet-stamps").onsuccess = (e) => res((e.target as IDBOpenDBRequest).result)));
      const v = await new Promise<any[]>((res) => (db.transaction("tray").objectStore("tray").get("stamps").onsuccess = (e) => res((e.target as IDBRequest).result)));
      db.close();
      const blobs = v.flatMap((s) => [s.thumb, ...Object.values(s.pictures ?? {})]);
      return { stickers: v.length, blobs: blobs.filter((b) => b instanceof Blob).length, text: JSON.stringify(v).length, hasDataUrl: /data:image/.test(JSON.stringify(v)) };
    });
    expect(tray).toMatchObject({ stickers: 1, blobs: 2, hasDataUrl: false });
    // And every picture on the page is drawn.
    await expect.poll(async () => (await drawn(page)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(4);
  });

  test("a whiteboard saved with a picture inside its record (data: text) is put right when it opens: same picture, now stored as a file", async ({ page }) => {
    await open(page);
    const size = await dropPicture(page, 400, 225, "old");
    await assetsStored(page);
    await whiteboardSaved(page);
    // As older code could have left it: the record holds the picture as
    // text, and no stored file. (Written straight into the database, with
    // the whiteboard closed.)
    await page.goto("/backup/");
    await page.evaluate(async () => {
      // (The whiteboard's note of its last unsaved changes would put the
      // record back as it just was.)
      localStorage.removeItem("gauntlet:whiteboard:unsaved");
      const db = await new Promise<IDBDatabase>((res) => (indexedDB.open("TLDRAW_DOCUMENT_v2gauntlet-whiteboard").onsuccess = (e) => res((e.target as IDBOpenDBRequest).result)));
      const get = <T,>(store: string, op: (s: IDBObjectStore) => IDBRequest<T>) => new Promise<T>((res) => (op(db.transaction(store).objectStore(store)).onsuccess = (e) => res((e.target as IDBRequest).result)));
      const all = await get<any[]>("records", (s) => s.getAll());
      const asset = all.find((r) => r.typeName === "asset");
      const blob = await get<Blob>("assets", (s) => s.get(asset.id));
      const data = await new Promise<string>((res) => {
        const f = new FileReader();
        f.onload = () => res(f.result as string);
        f.readAsDataURL(blob);
      });
      const tx = db.transaction(["records", "assets"], "readwrite");
      tx.objectStore("records").put({ ...asset, props: { ...asset.props, src: data } }, asset.id);
      tx.objectStore("assets").delete(asset.id);
      await new Promise<void>((res) => (tx.oncomplete = () => res()));
      db.close();
    });
    await open(page);
    await assetsStored(page);
    await whiteboardSaved(page);
    const r = await records(page);
    expect(r.srcs).toHaveLength(1);
    expect(r.srcs[0]).toMatch(/^asset:/);
    expect(r.storedHasDataUrl).toBe(false);
    expect(r.blobs).toBe(1);
    const stored = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res) => (indexedDB.open("TLDRAW_DOCUMENT_v2gauntlet-whiteboard").onsuccess = (e) => res((e.target as IDBOpenDBRequest).result)));
      const blobs = await new Promise<Blob[]>((res) => (db.transaction("assets").objectStore("assets").getAll().onsuccess = (e) => res((e.target as IDBRequest).result)));
      db.close();
      return { size: blobs[0]!.size, type: blobs[0]!.type };
    });
    expect(stored).toEqual({ size, type: "image/png" });
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toEqual([400]);
    // Not an undo step.
    await page.keyboard.press("Control+z");
    expect((await records(page)).srcs[0]).toMatch(/^asset:/);
  });

  test("a stamps tray kept the old way (pictures as data: text) is converted when read; its stickers still show and place", async ({ page }) => {
    await open(page);
    await dropPicture(page, 400, 225, "logo");
    await assetsStored(page);
    await page.evaluate(() => {
      const e = (window as any).editor;
      e.select(e.getCurrentPageShapes()[0].id);
    });
    await page.getByTestId("tools.stamps").click();
    await page.getByTestId("stamps-add-selection").click();
    await expect(page.getByTestId("stamps-tray").getByTestId("stamp")).toHaveCount(1);
    // Rewritten as the code before 2026-11-12 stored it.
    const oldChars = await page.evaluate(async () => {
      const toData = (b: Blob) =>
        new Promise<string>((res) => {
          const f = new FileReader();
          f.onload = () => res(f.result as string);
          f.readAsDataURL(b);
        });
      const db = await new Promise<IDBDatabase>((res) => (indexedDB.open("gauntlet-stamps").onsuccess = (e) => res((e.target as IDBOpenDBRequest).result)));
      const v = await new Promise<any[]>((res) => (db.transaction("tray").objectStore("tray").get("stamps").onsuccess = (e) => res((e.target as IDBRequest).result)));
      const old = [];
      for (const s of v) {
        const assets = [];
        for (const a of s.content.assets) assets.push(s.pictures[a.id] ? { ...a, props: { ...a.props, src: await toData(s.pictures[a.id]) } } : a);
        old.push({ id: s.id, content: { ...s.content, assets }, thumb: await toData(s.thumb) });
      }
      const tx = db.transaction("tray", "readwrite");
      tx.objectStore("tray").put(old, "stamps");
      await new Promise<void>((res) => (tx.oncomplete = () => res()));
      db.close();
      return JSON.stringify(old).length;
    });
    // The whiteboard without that picture, so placing must bring its own.
    await page.evaluate(() => {
      const e = (window as any).editor;
      e.deleteShapes(e.getCurrentPageShapes().map((s: any) => s.id));
      e.deleteAssets(e.getAssets().map((a: any) => a.id));
    });
    await whiteboardSaved(page);
    await open(page);
    await page.getByTestId("tools.stamps").click();
    const sticker = page.getByTestId("stamps-tray").getByTestId("stamp");
    await expect(sticker).toHaveCount(1);
    await expect.poll(() => sticker.locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    const tray = () =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((res) => (indexedDB.open("gauntlet-stamps").onsuccess = (e) => res((e.target as IDBOpenDBRequest).result)));
        const v = await new Promise<any[]>((res) => (db.transaction("tray").objectStore("tray").get("stamps").onsuccess = (e) => res((e.target as IDBRequest).result)));
        db.close();
        return { hasDataUrl: /data:image/.test(JSON.stringify(v)), chars: JSON.stringify(v).length, pictures: Object.values(v[0].pictures ?? {}).filter((b) => b instanceof Blob).length, thumb: v[0].thumb instanceof Blob };
      });
    await expect.poll(async () => (await tray()).hasDataUrl).toBe(false);
    expect(await tray()).toMatchObject({ pictures: 1, thumb: true });
    expect((await tray()).chars).toBeLessThan(oldChars / 2);
    await page.mouse.move(700, 600);
    await sticker.click();
    await assetsStored(page);
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toEqual([400]);
    expect((await records(page)).storedHasDataUrl).toBe(false);
  });

  test("a screenshot shown at half size is drawn from a half-size copy; zoomed in, from the original; a copy or export gets the original; a small picture is left alone; the copies are not part of a save", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await open(page);
    const big = await dropPicture(page, 1920, 1080, "screenshot");
    await dropPicture(page, 400, 225, "small");
    await assetsStored(page);
    await page.evaluate(() => {
      const e = (window as any).editor;
      const shapes = e.getCurrentPageShapes();
      const s = shapes.find((x: any) => x.props.w > 500 || e.getAsset(x.props.assetId).props.w === 1920);
      e.updateShape({ id: s.id, type: "image", x: 40, y: 40, props: { w: 900, h: 506 } });
      const t = shapes.find((x: any) => x.id !== s.id);
      e.updateShape({ id: t.id, type: "image", x: 1000, y: 40, props: { w: 200, h: 112 } });
      e.selectNone();
      e.createPage({ name: "Other" });
    });
    // The half-size copy is made quietly, a moment after the picture arrives.
    const cache = () =>
      page.evaluate(async () => {
        // (Opening a database that isn't there yet would make it, empty.)
        if (!(await indexedDB.databases()).some((d) => d.name === "gauntlet-picture-cache")) return [];
        const db = await new Promise<IDBDatabase>((res, rej) => {
          const o = indexedDB.open("gauntlet-picture-cache");
          o.onsuccess = () => res(o.result);
          o.onerror = () => rej(o.error);
        });
        if (!db.objectStoreNames.contains("smaller")) return (db.close(), []);
        const keys = await new Promise<IDBValidKey[]>((res) => (db.transaction("smaller").objectStore("smaller").getAllKeys().onsuccess = (e) => res((e.target as IDBRequest).result)));
        const blobs = await new Promise<Blob[]>((res) => (db.transaction("smaller").objectStore("smaller").getAll().onsuccess = (e) => res((e.target as IDBRequest).result)));
        db.close();
        return keys.map((k, i) => ({ key: String(k), size: blobs[i]!.size, type: blobs[i]!.type }));
      });
    await expect.poll(async () => (await cache()).length, { timeout: 30_000 }).toBe(1);
    const copy = (await cache())[0]!;
    expect(copy.key).toMatch(/^asset:.+@0\.5$/);
    expect(copy.type).toBe("image/png");
    expect(copy.size).toBeLessThan(big);

    // Away and back (tldraw asks for the picture's address again): the copy.
    const go = (i: number) => page.evaluate((i) => void (window as any).editor.setCurrentPage((window as any).editor.getPages()[i].id), i);
    await go(1);
    await go(0);
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toEqual([400, 960]);
    // After a reload too (the copies are kept in this browser).
    await whiteboardSaved(page);
    await open(page);
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toEqual([400, 960]);

    // Zoomed in to 300%: the original (tldraw asks again half a second after the zoom settles).
    await page.evaluate(() => void (window as any).editor.setCamera({ x: 0, y: 0, z: 3 }));
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toEqual([400, 1920]);
    await page.evaluate(() => void (window as any).editor.setCamera({ x: 0, y: 0, z: 1 }));
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toEqual([400, 960]);

    // What leaves the whiteboard (a copy, an export, a sticker) is the original.
    const original = await page.evaluate(async () => {
      const e = (window as any).editor;
      const asset = e.getAssets().find((a: any) => a.props.w === 1920);
      const url = await e.resolveAssetUrl(asset.id, { shouldResolveToOriginal: true });
      return (await (await fetch(url)).blob()).size;
    });
    expect(original).toBe(big);

    // A save doesn't carry the copies (a cache: remade when missing).
    await page.goto("/backup/");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save a backup" }).click()]);
    const file = await readFile((await download.path())!, "utf-8");
    expect(file).toContain("TLDRAW_DOCUMENT_v2gauntlet-whiteboard");
    expect(file).not.toContain("gauntlet-picture-cache");
    // The cache cleared (as a restore on another computer starts): the
    // picture still shows, from the original, and its copy is made again.
    await page.evaluate(() => new Promise<void>((res) => (indexedDB.deleteDatabase("gauntlet-picture-cache").onsuccess = () => res())));
    await open(page);
    await expect.poll(async () => (await drawn(page)).length, { timeout: 15_000 }).toBe(2);
    await expect.poll(async () => (await cache()).length, { timeout: 30_000 }).toBe(1);
  });

  test("only the current page's items are in the page: other pages' pictures are neither mounted nor loaded", async ({ page }) => {
    await open(page);
    await dropPicture(page, 400, 225, "one-a");
    await dropPicture(page, 400, 225, "one-b");
    for (const n of [3, 1]) {
      await page.evaluate(() => {
        const e = (window as any).editor;
        e.createPage({ name: "More" });
        e.setCurrentPage(e.getPages().at(-1).id);
      });
      for (let i = 0; i < n; i++) await dropPicture(page, 400, 225, `p${n}-${i}`);
    }
    await assetsStored(page);
    const mounted = () =>
      page.evaluate(() => {
        const e = (window as any).editor;
        return { inFile: e.store.allRecords().filter((r: any) => r.typeName === "shape").length, onPage: e.getCurrentPageShapes().length, shapeElements: document.querySelectorAll(".tl-shape").length, pictures: document.querySelectorAll(".tl-canvas img").length };
      });
    for (const [i, n] of [[0, 2], [1, 3], [2, 1]] as const) {
      await page.evaluate((i) => void (window as any).editor.setCurrentPage((window as any).editor.getPages()[i].id), i);
      await expect.poll(mounted).toEqual({ inFile: 6, onPage: n, shapeElements: n, pictures: n });
    }
  });
});
