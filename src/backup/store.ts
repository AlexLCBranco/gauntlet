/**
 * Backups, the browser side: reads the apps' data (localStorage and their
 * IndexedDB stores), keeps backups in an IndexedDB of their own
 * (`gauntlet-backups`), and writes a backup back. See `snapshot.ts`.
 */
import { APP_DBS, fingerprintOf, isAppKey, restorePlan, toKeep, type AppDb, type Reason, type Snapshot } from "./snapshot";

const OWN_DB = "gauntlet-backups";
const SNAPSHOTS = "snapshots";
const APP_STORE = "kv";

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const committed = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("aborted"));
  });

function openOwn(): Promise<IDBDatabase> {
  const request = indexedDB.open(OWN_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(SNAPSHOTS, { keyPath: "id" });
  return done(request);
}

/**
 * An app's database, only if it exists: opening a missing one would create
 * it empty, without its `kv` store, and the app would then fail to open it.
 */
function openAppIfThere(name: AppDb): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let created = false;
    request.onupgradeneeded = () => {
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(APP_STORE)) resolve(db);
      else {
        db.close();
        resolve(null);
      }
    };
    request.onerror = () => (created ? resolve(null) : reject(request.error));
  });
}

/** An app's database, made as the app makes it (version 1, store `kv`) if missing. */
function openAppForWrite(name: AppDb): Promise<IDBDatabase> {
  const request = indexedDB.open(name);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(APP_STORE)) request.result.createObjectStore(APP_STORE);
  };
  return done(request);
}

async function readApp(name: AppDb): Promise<[IDBValidKey, unknown][]> {
  const db = await openAppIfThere(name);
  if (!db) return [];
  try {
    const store = db.transaction(APP_STORE, "readonly").objectStore(APP_STORE);
    const [keys, values] = await Promise.all([done(store.getAllKeys()), done(store.getAll())]);
    return keys.map((k, i) => [k, values[i]]);
  } finally {
    db.close();
  }
}

function readLocal(): Record<string, string> {
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (isAppKey(key)) local[key] = localStorage.getItem(key)!;
  }
  return local;
}

/** The apps' data as it is now. */
export async function current(reason: Reason): Promise<Snapshot> {
  const local = readLocal();
  const idb = {} as Record<AppDb, [IDBValidKey, unknown][]>;
  for (const db of APP_DBS) idb[db] = await readApp(db).catch(() => []);
  const at = Date.now();
  return { id: `${at}-${Math.random().toString(36).slice(2, 8)}`, at, reason, fingerprint: fingerprintOf(local, idb), local, idb };
}

/** Every backup, newest first. */
export async function list(): Promise<Snapshot[]> {
  const db = await openOwn();
  try {
    const all = await done(db.transaction(SNAPSHOTS, "readonly").objectStore(SNAPSHOTS).getAll());
    return (all as Snapshot[]).sort((a, b) => b.at - a.at);
  } finally {
    db.close();
  }
}

/** Saves `s`, then lets go of the backups no longer kept (`toKeep`). */
export async function save(s: Snapshot): Promise<void> {
  const db = await openOwn();
  try {
    const tx = db.transaction(SNAPSHOTS, "readwrite");
    const store = tx.objectStore(SNAPSHOTS);
    store.put(s);
    const all = (await done(store.getAll())) as Snapshot[];
    const keep = toKeep(all, Date.now());
    for (const old of all) if (!keep.has(old.id)) store.delete(old.id);
    await committed(tx);
  } finally {
    db.close();
  }
}

/**
 * Backs up the apps' data. An automatic backup is skipped when the newest
 * backup already holds exactly this. Returns the backup saved, or null.
 */
export async function backUp(reason: Reason = "auto"): Promise<Snapshot | null> {
  const now = await current(reason);
  if (reason === "auto") {
    const [newest] = await list();
    if (newest?.fingerprint === now.fingerprint) return null;
  }
  await save(now);
  return now;
}

/**
 * Puts the apps' data back as it was in `s`. The data as it is now is
 * backed up first ("before restore"), so a restore can itself be undone.
 */
export async function restore(s: Snapshot): Promise<void> {
  await backUp("before-restore");
  const plan = restorePlan(readLocal(), s.local);
  for (const key of plan.remove) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(plan.set)) localStorage.setItem(key, value);
  for (const name of APP_DBS) {
    const entries = s.idb[name] ?? [];
    const existing = await openAppIfThere(name);
    existing?.close();
    if (!existing && entries.length === 0) continue;
    const db = await openAppForWrite(name);
    try {
      const tx = db.transaction(APP_STORE, "readwrite");
      const store = tx.objectStore(APP_STORE);
      store.clear();
      for (const [k, v] of entries) store.put(v, k);
      await committed(tx);
    } finally {
      db.close();
    }
  }
}

