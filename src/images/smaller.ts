// A picture shown small is drawn from a smaller copy, not from its
// full-resolution original (speed session, Part 2).
//
// How tldraw 5.5.2 holds pictures under `persistenceKey` (its
// useLocalStore.ts, read, not assumed): a pasted or dropped file is stored
// as a Blob in the whiteboard's IndexedDB database (store "assets", key =
// the asset's id), and the asset record's `src` is just "asset:<id>", never
// the bytes. To draw one, tldraw asks the store's `resolve(asset, context)`
// for an address; its own answer is always an object URL of the original.
// `context` says how big the picture is on screen (`screenScale`, `dpr`),
// and tldraw asks again when that changes: this is its own way to serve a
// smaller version, and `<Tldraw assets={{ resolve }}>` replaces just that
// part (upload and remove stay tldraw's).
//
// So here: `resolve` answers with a copy at 1/2, 1/4 or 1/8 of the
// original's size when the picture is shown at most that big, and with the
// original otherwise (zoomed in, exports, copies, animated or vector
// pictures, small pictures). The copies are made in a worker
// (smallerWorker.ts) and kept in this browser, in a database of their own
// (`CACHE_DB`: a cache, never part of a backup, remade when missing). A
// copy that isn't made yet never delays a picture: the next bigger copy
// (or the original) is shown now, and the copy is used from the next time
// tldraw asks (a page change, a zoom).

import type { Editor, TLAsset, TLAssetContext, TLAssetStore } from "tldraw";

import { PICTURE_CACHE_DB } from "../backup/storage";
import type { SmallerReply, SmallerRequest } from "./smallerWorker";

/** The smaller copies: a cache (src/backup/storage.ts leaves it out of backups). */
export const CACHE_DB = PICTURE_CACHE_DB;
const STORE = "smaller";
/** The sizes kept, as parts of the original's. */
const LEVELS = [0.5, 0.25, 0.125] as const;
/** Pictures with fewer pixels than this are left alone (nothing to gain). */
const MIN_PIXELS = 600_000;
/** No copy narrower than this. */
const MIN_WIDTH = 160;

type Level = (typeof LEVELS)[number];
const keyOf = (assetId: string, level: Level) => `${assetId}@${level}`;

const done = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

async function openCache(): Promise<IDBDatabase> {
  const open = (version?: number) => {
    const r = indexedDB.open(CACHE_DB, version);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    return done(r);
  };
  const db = await open();
  if (db.objectStoreNames.contains(STORE)) return db;
  // There, but without its store (made empty by something else): added.
  const next = db.version + 1;
  db.close();
  return open(next);
}

/** The level to draw a picture from: the smallest that is still at least
    as big as it shows on screen (in device pixels); null: the original. */
export function levelFor(asset: Pick<TLAsset, "type" | "props">, context: Pick<TLAssetContext, "screenScale" | "dpr" | "shouldResolveToOriginal">): Level | null {
  if (context.shouldResolveToOriginal || asset.type !== "image") return null;
  const { w, h, mimeType, isAnimated } = asset.props as { w: number; h: number; mimeType: string | null; isAnimated: boolean };
  if (isAnimated || !mimeType || mimeType === "image/svg+xml" || mimeType === "image/gif" || mimeType === "image/apng") return null;
  if (!(w * h >= MIN_PIXELS)) return null;
  const need = context.screenScale * context.dpr;
  let best: Level | null = null;
  for (const level of LEVELS) if (level >= need && w * level >= MIN_WIDTH) best = level;
  return best;
}

export interface SmallerPictures {
  /** For `<Tldraw assets>`: tldraw's local store with this `resolve`. */
  readonly assets: Partial<TLAssetStore>;
  /** Once the editor is there: makes the half-size copies of the pictures
      that have none yet, quietly, and forgets copies of deleted pictures.
      Returns a stop function. */
  attach(editor: Editor): () => void;
  /** Copies being made or waiting (for the tests). */
  pending(): number;
}

/** `persistenceKey`: the whiteboard's, to read its stored pictures. */
export function smallerPictures(persistenceKey: string): SmallerPictures {
  const documentDb = `TLDRAW_DOCUMENT_v2${persistenceKey}`;
  /** Object URLs handed out: originals by asset id, copies by key. */
  const urls = new Map<string, Promise<string | null>>();
  /** The copies the cache holds (their keys), once read. */
  let cached: Promise<Set<string>> | null = null;
  const making = new Map<string, Promise<void>>();
  let worker: Worker | null | undefined;
  let nextId = 1;
  const waiting = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

  const cacheKeys = () =>
    (cached ??= (async () => {
      try {
        const db = await openCache();
        try {
          return new Set((await done(db.transaction(STORE).objectStore(STORE).getAllKeys())).map(String));
        } finally {
          db.close();
        }
      } catch {
        return new Set<string>();
      }
    })());

  async function original(assetId: string): Promise<Blob | null> {
    const db = await done(indexedDB.open(documentDb));
    try {
      if (!db.objectStoreNames.contains("assets")) return null;
      return ((await done(db.transaction("assets").objectStore("assets").get(assetId))) as Blob | undefined) ?? null;
    } finally {
      db.close();
    }
  }

  function shrink(blob: Blob, width: number, height: number): Promise<Blob> {
    if (worker === undefined) {
      try {
        worker = new Worker(new URL("./smallerWorker.ts", import.meta.url), { type: "module", name: "gauntlet-pictures" });
        worker.onmessage = (event: MessageEvent<SmallerReply>) => {
          const call = waiting.get(event.data.id);
          waiting.delete(event.data.id);
          if ("blob" in event.data) call?.resolve(event.data.blob);
          else call?.reject(new Error(event.data.error));
        };
        worker.onerror = () => {
          worker = null;
          for (const call of waiting.values()) call.reject(new Error("The picture worker stopped."));
          waiting.clear();
        };
      } catch {
        worker = null;
      }
    }
    // No worker: no copies (the originals are drawn, as before).
    if (!worker) return Promise.reject(new Error("No picture worker."));
    return new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      worker!.postMessage({ id, blob, width, height } satisfies SmallerRequest);
    });
  }

  /** Makes and keeps the copy, once. Never throws. */
  function make(asset: TLAsset, level: Level): Promise<void> {
    const key = keyOf(asset.id, level);
    let job = making.get(key);
    if (!job) {
      job = (async () => {
        try {
          const keys = await cacheKeys();
          if (keys.has(key)) return;
          const blob = await original(asset.id);
          if (!blob) return;
          const { w, h } = asset.props as { w: number; h: number };
          // (Kept even when its file is no smaller than the original's, as
          // with very plain pictures: what it saves is the decoded pixels.)
          const small = await shrink(blob, Math.max(1, Math.round(w * level)), Math.max(1, Math.round(h * level)));
          const db = await openCache();
          try {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(small, key);
            await new Promise<void>((resolve, reject) => {
              tx.oncomplete = () => resolve();
              tx.onerror = tx.onabort = () => reject(tx.error);
            });
          } finally {
            db.close();
          }
          keys.add(key);
        } catch (error) {
          // No copy: the original is drawn.
          console.warn("Gauntlet: a smaller copy of a picture could not be made", asset.id, error);
        } finally {
          making.delete(key);
        }
      })();
      making.set(key, job);
    }
    return job;
  }

  const url = (key: string, read: () => Promise<Blob | null>) => {
    let u = urls.get(key);
    if (!u) {
      u = read().then(
        (blob) => (blob ? URL.createObjectURL(blob) : null),
        () => null,
      );
      urls.set(key, u);
      // Not there (yet): asked again next time, never remembered as missing.
      void u.then((made) => {
        if (made === null && urls.get(key) === u) urls.delete(key);
      });
    }
    return u;
  };

  const copy = async (key: string): Promise<Blob | null> => {
    const db = await openCache();
    try {
      return ((await done(db.transaction(STORE).objectStore(STORE).get(key))) as Blob | undefined) ?? null;
    } finally {
      db.close();
    }
  };

  const resolve: TLAssetStore["resolve"] = async (asset, context) => {
    const src = asset.props.src;
    if (!src) return null;
    if (!src.startsWith("asset:")) return src;
    const level = levelFor(asset, context);
    if (level !== null) {
      const keys = await cacheKeys();
      // The wanted copy, else the next bigger one that exists.
      for (const l of LEVELS.filter((l) => l >= level).reverse()) {
        if (!keys.has(keyOf(asset.id, l))) continue;
        const u = await url(keyOf(asset.id, l), () => copy(keyOf(asset.id, l)));
        if (u) {
          if (l !== level) void make(asset, level);
          return u;
        }
        // Gone from the cache (cleared): remake it.
        keys.delete(keyOf(asset.id, l));
        urls.delete(keyOf(asset.id, l));
      }
      void make(asset, level);
    }
    return url(asset.id, () => original(asset.id));
  };

  function attach(editor: Editor): () => void {
    let stopped = false;
    const idle = (fn: () => void) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 1000));
    /** Half-size copies of the pictures that have none, one at a time. */
    const fill = async () => {
      const keys = await cacheKeys();
      const assets = editor.getAssets();
      // Copies of pictures that are gone.
      const live = new Set(assets.map((a) => a.id as string));
      const stale = [...keys].filter((k) => !live.has(k.slice(0, k.lastIndexOf("@"))));
      if (stale.length > 0) {
        try {
          const db = await openCache();
          try {
            const tx = db.transaction(STORE, "readwrite");
            for (const k of stale) tx.objectStore(STORE).delete(k);
            await new Promise<void>((res) => (tx.oncomplete = tx.onerror = tx.onabort = () => res()));
          } finally {
            db.close();
          }
          for (const k of stale) keys.delete(k);
        } catch {
          // Left for next time.
        }
      }
      for (const asset of assets) {
        if (stopped) return;
        if (!asset.props.src?.startsWith("asset:")) continue;
        if (levelFor(asset, { screenScale: 0.5, dpr: 1, shouldResolveToOriginal: false }) === null) continue;
        if (keys.has(keyOf(asset.id, 0.5))) continue;
        await make(asset, 0.5);
        await new Promise<void>((res) => idle(() => res()));
      }
    };
    // After opening, and when a picture arrives (its file stored: `src` set).
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => void fill(), 4000);
    const stopListen = editor.store.listen(
      ({ changes }) => {
        const arrived = [...Object.values(changes.added), ...Object.values(changes.updated).map(([, to]) => to)].some((r) => r.typeName === "asset" && (r as TLAsset).props.src?.startsWith("asset:"));
        if (!arrived) return;
        clearTimeout(timer);
        timer = setTimeout(() => void fill(), 1500);
      },
      { scope: "document" },
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
      stopListen();
    };
  }

  return { assets: { resolve }, attach, pending: () => making.size };
}
