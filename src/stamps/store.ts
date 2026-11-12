import { atom, type Editor, type TLAsset, type TLContent, type TLShapeId } from "tldraw";

import { markChanged } from "../backup/save";

// The stamps tray (owner, Edges round item 6, v0): the owner's own stickers
// (team logos, a "tv" tag, icons), the same on every page, kept apart from
// the pages in this browser's IndexedDB (`STAMPS_DB`), so the backup file,
// a restore and the folder save carry it like everything else. A sticker is
// tldraw content (shapes and their pictures) and a small picture of it for
// the tray.
//
// Its pictures are kept as pictures (Blobs, beside the content), not as
// data: addresses inside it (speed session, Part 2): as text they were part
// of every save file, rewritten with every change; as Blobs the folder save
// keeps each once, as a file of its own. A tray kept the old way is
// converted when it is read (`modern`), and saved back once.

export interface Stamp {
  readonly id: string;
  /** Its shapes; an asset whose picture is in `pictures` has no `src`. */
  readonly content: TLContent;
  /** Its pictures, by asset id. */
  readonly pictures: Readonly<Record<string, Blob>>;
  /** A picture of it, for the tray. */
  readonly thumb: Blob | null;
  /** An address for `thumb`, to show it (made here, never stored). */
  readonly thumbUrl: string;
}

/** As stored: the same without the address; `thumb` and a picture's `src`
    may still be data: text in a tray stored before 2026-11-12. */
interface StoredStamp {
  readonly id: string;
  readonly content: TLContent;
  readonly pictures?: Readonly<Record<string, Blob>>;
  readonly thumb: Blob | string | null;
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

const dataToBlob = async (data: string): Promise<Blob> => (await fetch(data)).blob();
const srcOf = (a: TLAsset) => (a.props as { src?: string | null }).src ?? null;
const withSrc = (a: TLAsset, src: string | null) => ({ ...a, props: { ...a.props, src } }) as TLAsset;

/** A stored sticker as this code keeps one: data: text turned into Blobs.
    `changed`: it was stored the old way. */
async function modern(s: StoredStamp): Promise<{ stamp: Stamp; changed: boolean }> {
  let changed = false;
  const pictures: Record<string, Blob> = { ...s.pictures };
  const assets: TLAsset[] = [];
  for (const a of s.content.assets ?? []) {
    const src = srcOf(a);
    if (src?.startsWith("data:")) {
      try {
        pictures[a.id] = await dataToBlob(src);
        assets.push(withSrc(a, null));
        changed = true;
        continue;
      } catch {
        // Unreadable: kept as it is.
      }
    }
    assets.push(a);
  }
  let thumb: Blob | null = null;
  if (typeof s.thumb === "string") {
    changed = true;
    try {
      thumb = s.thumb ? await dataToBlob(s.thumb) : null;
    } catch {
      thumb = null;
    }
  } else thumb = s.thumb ?? null;
  return { stamp: { id: s.id, content: { ...s.content, assets }, pictures, thumb, thumbUrl: thumb ? URL.createObjectURL(thumb) : "" }, changed };
}

/** Reads the tray from the browser (once per page). */
export function loadStamps(): Promise<void> {
  loaded ??= (async () => {
    try {
      const db = await openDb();
      let stored: StoredStamp[] = [];
      try {
        const v = (await done(db.transaction(STORE, "readonly").objectStore(STORE).get(KEY))) as StoredStamp[] | undefined;
        stored = Array.isArray(v) ? v : [];
      } finally {
        db.close();
      }
      const read = await Promise.all(stored.map(modern));
      stamps.set(read.map((r) => r.stamp));
      // Stored the old way: written back the new way, once.
      if (read.some((r) => r.changed)) await save(stamps.get());
    } catch (error) {
      console.error("Gauntlet: the stamps tray could not be read", error);
    }
  })();
  return loaded;
}

async function save(next: readonly Stamp[]): Promise<void> {
  stamps.set(next);
  const stored: StoredStamp[] = next.map(({ id, content, pictures, thumb }) => ({ id, content, pictures, thumb }));
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(stored, KEY);
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

const newId = () => `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const stampOf = (content: TLContent, pictures: Record<string, Blob>, thumb: Blob | null): Stamp => ({ id: newId(), content, pictures, thumb, thumbUrl: thumb ? URL.createObjectURL(thumb) : "" });

/** `content` standing on its own: every picture the page stores (or holds
    as data: text) taken along as a Blob, since the page's own storage would
    not follow the sticker. A picture on the web keeps its address. */
async function standAlone(editor: Editor, content: TLContent): Promise<{ content: TLContent; pictures: Record<string, Blob> }> {
  const pictures: Record<string, Blob> = {};
  const assets = await Promise.all(
    (content.assets ?? []).map(async (a) => {
      const src = srcOf(a);
      if (!src || /^https?:/.test(src)) return a;
      try {
        const url = src.startsWith("data:") ? src : ((await editor.resolveAssetUrl(a.id, { shouldResolveToOriginal: true })) ?? src);
        pictures[a.id] = await (await fetch(url)).blob();
        return withSrc(a, null);
      } catch {
        return a;
      }
    }),
  );
  return { content: { ...content, assets }, pictures };
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
  await loadStamps();
  const alone = await standAlone(editor, content);
  await save([...stamps.get(), stampOf(alone.content, alone.pictures, image?.blob ?? null)]);
  return true;
}

/** A picture file (pasted or dropped into the tray) as a new sticker: put
    on the page for a moment to become tldraw content, then taken off again
    (neither is an undo step). The picture itself never enters a record. */
export async function addImageFile(editor: Editor, file: File): Promise<boolean> {
  if (!file.type.startsWith("image/")) return false;
  const url = URL.createObjectURL(file);
  const size = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
    img.onerror = () => resolve({ w: 100, h: 100 });
    img.src = url;
  });
  URL.revokeObjectURL(url);
  const scale = Math.min(1, 200 / Math.max(size.w, size.h));
  const w = size.w * scale;
  const h = size.h * scale;
  const assetId = `asset:stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` as never;
  const shapeId = `shape:stamp-${Date.now()}` as TLShapeId;
  let content: TLContent | undefined;
  editor.run(
    () => {
      editor.createAssets([{ id: assetId, type: "image", typeName: "asset", props: { name: file.name || "sticker", src: null, w: size.w, h: size.h, mimeType: file.type, isAnimated: file.type === "image/gif" }, meta: {} }]);
      editor.createShape({ id: shapeId, type: "image", x: 0, y: 0, props: { assetId, w, h } });
      content = editor.getContentFromCurrentPage([shapeId]);
      editor.deleteShape(shapeId);
      editor.deleteAssets([assetId]);
    },
    { history: "ignore" },
  );
  if (!content) return false;
  await loadStamps();
  await save([...stamps.get(), stampOf(content, { [assetId as string]: file }, file)]);
  return true;
}

/**
 * A normal, independent copy of the sticker on the current page, its
 * middle at `point` (page space), selected. One undo step. Its pictures
 * are stored the way a pasted file is (tldraw's own upload) before the
 * sticker is drawn, so the page's records only ever point at them.
 */
export async function placeStamp(editor: Editor, stamp: Stamp, point: { x: number; y: number }): Promise<void> {
  const assets: TLAsset[] = [];
  for (const a of stamp.content.assets ?? []) {
    const picture = stamp.pictures[a.id];
    // On the page already (an earlier copy of this sticker): shared.
    if (!picture || editor.getAsset(a.id)) {
      assets.push(a);
      continue;
    }
    try {
      const name = (a.props as { name?: string }).name || "sticker";
      const { src } = await editor.uploadAsset(a, new File([picture], name, { type: picture.type }));
      assets.push(withSrc(a, src));
    } catch (error) {
      console.error("Gauntlet: a sticker's picture could not be stored", error);
      assets.push(a);
    }
  }
  editor.markHistoryStoppingPoint("place sticker");
  editor.putContentOntoCurrentPage({ ...stamp.content, assets }, { point, select: true });
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
