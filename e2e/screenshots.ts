import { expect, type Page } from "./test";

import { whiteboardSaved } from "./helpers";

/**
 * A throwaway whiteboard like the owner's slow one (speed session): `pages`
 * pages, each with `perPage` screenshots: generated 1920 x 1080 PNGs (about
 * 1.15 MB each), pasted through tldraw's own file handler, four to a page.
 * Returns how many pictures and their bytes, once tldraw has stored them all.
 */
export async function buildScreenshots(page: Page, pages: number, perPage: number): Promise<{ pictures: number; bytes: number }> {
  const built = await page.evaluate(
    async ({ pages, perPage }) => {
      const editor = (window as any).editor;
      /** A 1920 x 1080 "screenshot": a dark app window with rows of text,
          coloured panels and a photo-like block (noise: as hard to compress
          as a real picture). Each one differs. */
      const shot = async (n: number): Promise<File> => {
        const c = document.createElement("canvas");
        c.width = 1920;
        c.height = 1080;
        const g = c.getContext("2d")!;
        g.fillStyle = "#1e1f24";
        g.fillRect(0, 0, 1920, 1080);
        g.fillStyle = "#2b2d36";
        g.fillRect(0, 0, 1920, 56);
        g.fillRect(0, 56, 300, 1024);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = ["#7a2e2e", "#2e5a7a", "#2e7a45", "#7a6a2e", "#5a2e7a", "#2e7a78"][(i + n) % 6]!;
          g.fillRect(330 + (i % 3) * 320, 80 + Math.floor(i / 3) * 190, 300, 170);
        }
        g.font = "15px Segoe UI, Arial, sans-serif";
        for (let row = 0; row < 34; row++) {
          g.fillStyle = row % 5 === 0 ? "#e8e8ea" : "#a9abb3";
          g.fillText(`${n}.${row}  Game ${row + 1}: Team ${(n * 7 + row) % 30} at Team ${(n * 3 + row * 5) % 30}  7:${String((row * 7) % 60).padStart(2, "0")}pm  -${100 + ((n * row) % 250)}  o/u ${200 + ((n + row) % 40)}.5  notes ${Math.random().toString(36).slice(2)}`, 330, 500 + row * 17);
          g.fillText(`List ${row}  ${Math.random().toString(36).slice(2, 9)}`, 20, 90 + row * 28);
        }
        // The photo: 640 x 400 of noise.
        const photo = g.createImageData(640, 400);
        for (let i = 0; i < photo.data.length; i += 4) {
          photo.data[i] = Math.random() * 255;
          photo.data[i + 1] = Math.random() * 255;
          photo.data[i + 2] = Math.random() * 255;
          photo.data[i + 3] = 255;
        }
        g.putImageData(photo, 1250, 80);
        const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), "image/png"));
        return new File([blob], `Screenshot ${n}.png`, { type: "image/png" });
      };
      const first = editor.getCurrentPageId();
      let bytes = 0;
      let n = 0;
      for (let p = 0; p < pages; p++) {
        if (p > 0) {
          editor.createPage({ name: `Page ${p + 1}` });
          editor.setCurrentPage(editor.getPages().at(-1).id);
        }
        const files: File[] = [];
        for (let i = 0; i < perPage; i++) files.push(await shot(++n));
        bytes += files.reduce((x, f) => x + f.size, 0);
        // The way a paste or a drop of files arrives.
        await editor.putExternalContent({ type: "files", files, point: { x: 900, y: 500 } });
        // Four to a page, each 900 wide (a full page of screenshots).
        const shapes = editor.getCurrentPageShapes().filter((s: any) => s.type === "image");
        shapes.forEach((s: any, i: number) => editor.updateShape({ id: s.id, type: "image", x: 40 + (i % 2) * 930, y: 40 + Math.floor(i / 2) * 520, props: { w: 900, h: 506 } }));
        editor.selectNone();
      }
      editor.setCurrentPage(first);
      return { pictures: n, bytes };
    },
    { pages, perPage },
  );
  await expect.poll(async () => (await screenshotsStored(page)).blobsInIndexedDB, { timeout: 120_000 }).toBe(pages * perPage);
  await expect.poll(async () => (await screenshotsStored(page)).noSrc, { timeout: 120_000 }).toBe(0);
  await whiteboardSaved(page);
  return built;
}

/** How tldraw holds the pictures: asset records, and blobs in IndexedDB. */
export const screenshotsStored = (page: Page) =>
  page.evaluate(async () => {
      const editor = (window as any).editor;
      const assets = editor.getAssets() as { props: { src?: string } }[];
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("TLDRAW_DOCUMENT_v2gauntlet-whiteboard");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      try {
        const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
          const req = db.transaction("assets").objectStore("assets").getAllKeys();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        return {
          assetRecords: assets.length,
          asDataUrl: assets.filter((a) => a.props.src?.startsWith("data:")).length,
          asAssetRef: assets.filter((a) => a.props.src?.startsWith("asset:")).length,
          noSrc: assets.filter((a) => !a.props.src).length,
          blobsInIndexedDB: keys.length,
        };
      } finally {
        db.close();
      }
  });
