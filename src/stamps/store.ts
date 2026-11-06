import { atom, type Editor, type TLContent, type TLShapeId } from "tldraw";

import { markChanged } from "../backup/save";

// The stamps tray (owner, Edges round item 6, v0): the owner's own stickers
// (team logos, a "tv" tag, icons), the same on every page, kept apart from
// the pages in this browser's IndexedDB (`STAMPS_DB`), so the backup file,
// a restore and the folder save carry it like everything else. A sticker is
// tldraw content (shapes and their pictures, pictures as data: addresses so
// it stands on its own) and a small picture of it for the tray.

export interface Stamp {
  readonly id: string;
  readonly content: TLContent;
  /** A picture of it, for the tray (data: address). */
  readonly thumb: string;
}

export const STAMPS_DB = "gauntlet-stamps";
const STORE = "tray";
const KEY = "stamps";

const done = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

function openDb(): Promise<IDBDatabase> {
  const r = indexedDB.open(STAMPS_DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  return done(r);
}

/** The tray, in its order (newest added last). Empty until loaded. */
export const stamps = atom<readonly Stamp[]>("stamps", []);
let loaded: Promise<void> | null = null;

/** Reads the tray from the browser (once per page). */
export function loadStamps(): Promise<void> {
  loaded ??= (async () => {
    try {
      const db = await openDb();
      try {
        const v = (await done(db.transaction(STORE, "readonly").objectStore(STORE).get(KEY))) as Stamp[] | undefined;
        stamps.set(Array.isArray(v) ? v : []);
      } finally {
        db.close();
      }
    } catch (error) {
      console.error("Gauntlet: the stamps tray could not be read", error);
    }
  })();
  return loaded;
}

async function save(next: readonly Stamp[]): Promise<void> {
  stamps.set(next);
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(next, KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  // The folder save (src/backup/save.ts) watches localStorage; this is in
  // IndexedDB, so it is told.
  markChanged();
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const f = new FileReader();
    f.onload = () => resolve(f.result as string);
    f.onerror = () => reject(f.error);
    f.readAsDataURL(b);
  });

/** `content` with every picture's address made a data: address (a picture
    stored in the page's own storage would not follow the sticker). */
async function standAlone(editor: Editor, content: TLContent): Promise<TLContent> {
  const assets = await Promise.all(
    content.assets.map(async (a) => {
      const src = (a.props as { src?: string | null }).src;
      if (!src || src.startsWith("data:")) return a;
      try {
        const url = (await editor.resolveAssetUrl(a.id, { shouldResolveToOriginal: true })) ?? src;
        const data = await blobToDataUrl(await (await fetch(url)).blob());
        return { ...a, props: { ...a.props, src: data } } as typeof a;
      } catch {
        return a;
      }
    }),
  );
  return { ...content, assets };
}

/** The selected items as a new sticker, at the end of the tray. */
export async function addSelection(editor: Editor): Promise<boolean> {
  const ids = editor.getSelectedShapeIds();
  if (ids.length === 0) return false;
  return addShapes(editor, ids);
}

async function addShapes(editor: Editor, ids: TLShapeId[]): Promise<boolean> {
  const content = editor.getContentFromCurrentPage(ids);
  if (!content) return false;
  const image = await editor.toImage(ids, { format: "png", background: false, scale: 1, padding: 4 }).catch(() => null);
  const thumb = image ? await blobToDataUrl(image.blob) : "";
  await loadStamps();
  await save([...stamps.get(), { id: `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, content: await standAlone(editor, content), thumb }]);
  return true;
}

/** A picture file (pasted or dropped into the tray) as a new sticker: put
    on the page for a moment to become tldraw content, then taken off again
    (neither is an undo step). */
export async function addImageFile(editor: Editor, file: File): Promise<boolean> {
  if (!file.type.startsWith("image/")) return false;
  const src = await blobToDataUrl(file);
  const size = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
    img.onerror = () => resolve({ w: 100, h: 100 });
    img.src = src;
  });
  const scale = Math.min(1, 200 / Math.max(size.w, size.h));
  const w = size.w * scale;
  const h = size.h * scale;
  const assetId = `asset:stamp-${Date.now()}` as never;
  const shapeId = `shape:stamp-${Date.now()}` as TLShapeId;
  let content: TLContent | undefined;
  editor.run(
    () => {
      editor.createAssets([{ id: assetId, type: "image", typeName: "asset", props: { name: file.name || "sticker", src, w: size.w, h: size.h, mimeType: file.type, isAnimated: file.type === "image/gif" }, meta: {} }]);
      editor.createShape({ id: shapeId, type: "image", x: 0, y: 0, props: { assetId, w, h } });
      content = editor.getContentFromCurrentPage([shapeId]);
      editor.deleteShape(shapeId);
      editor.deleteAssets([assetId]);
    },
    { history: "ignore" },
  );
  if (!content) return false;
  await loadStamps();
  await save([...stamps.get(), { id: `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, content, thumb: src }]);
  return true;
}

/** A normal, independent copy of the sticker on the current page, its
    middle at `point` (page space), selected. One undo step. */
export function placeStamp(editor: Editor, stamp: Stamp, point: { x: number; y: number }): void {
  editor.markHistoryStoppingPoint("place sticker");
  editor.putContentOntoCurrentPage(stamp.content, { point, select: true });
  editor.setCurrentTool("select");
}

export async function deleteStamp(id: string): Promise<void> {
  await save(stamps.get().filter((s) => s.id !== id));
}

/** Moves sticker `id` to place `to` (0-based) in the tray. */
export async function moveStamp(id: string, to: number): Promise<void> {
  const list = [...stamps.get()];
  const from = list.findIndex((s) => s.id === id);
  if (from < 0) return;
  const [s] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(to, list.length)), 0, s!);
  await save(list);
}
