import type { SlateBundle } from "./format";

// GT-10: the Slate bundles of opened archive files (format.ts), kept in this
// browser's IndexedDB (`ARCHIVE_DB`), not in the whiteboard's records: a
// schedule snapshot is ~0.6 MB, a page holds only its key (shape meta
// `frozen.bundle`). The backup file carries every IndexedDB database, so a
// backup and a restore keep them. A frozen Slate's notes are typed into its
// bundle, never into calendarkit's own (`ck:notes:v1`).

export const ARCHIVE_DB = "gauntlet-archives";
const STORE = "slates";

const done = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

function openDb(): Promise<IDBDatabase> {
  const r = indexedDB.open(ARCHIVE_DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  return done(r);
}

const cache = new Map<string, Promise<SlateBundle | undefined>>();

/** A bundle by key (undefined when this browser doesn't have it). */
export function getBundle(key: string): Promise<SlateBundle | undefined> {
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const db = await openDb();
      try {
        return (await done(db.transaction(STORE, "readonly").objectStore(STORE).get(key))) as SlateBundle | undefined;
      } finally {
        db.close();
      }
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export async function putBundle(key: string, bundle: SlateBundle): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(bundle, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  cache.set(key, Promise.resolve(bundle));
}

/** A new bundle key: "slate-<time>-<random>". */
export const newBundleKey = () => `slate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * A Storage for calendarkit's notes store (createNotesStore) over a
 * bundle's notes: what is typed on a frozen Slate is saved into its bundle.
 */
export function bundleNotesStorage(key: string, bundle: SlateBundle, notesKey: string): Storage {
  let notes = bundle.notes;
  const keep = (next: Record<string, unknown>) => {
    notes = next;
    void putBundle(key, { ...bundle, notes: next }).catch((error) => console.error("Gauntlet: a frozen Slate's notes could not be kept", error));
  };
  return {
    get length() {
      return 1;
    },
    clear: () => keep({}),
    key: () => notesKey,
    getItem: (k: string) => (k === notesKey ? JSON.stringify(notes) : null),
    setItem: (k: string, v: string) => k === notesKey && keep(JSON.parse(v) as Record<string, unknown>),
    removeItem: (k: string) => k === notesKey && keep({}),
  } as Storage;
}
