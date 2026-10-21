// Reads this browser's storage into a backup file, and puts a backup file
// back. The format is in `format.ts`.

import {
  CannotEncode,
  decode,
  encode,
  FORMAT,
  VERSION,
  type BackupFile,
  type DatabaseDump,
  type Encoded,
  type StoreDump,
} from "./format";

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException("The restore was not stored", "AbortError"));
    tx.onerror = () => reject(tx.error);
  });

/** Opens `name` (at `version`, if given), creating stores in `upgrade`. A
    tab that holds the database open and will not let go (a whiteboard tab,
    during an upgrade) makes this fail with a message saying so. */
function open(name: string, version?: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(OTHER_TABS));
  });
}

/** The automatic backups' own database (`auto.ts`): never part of a
    backup (it would hold every earlier backup) and never restored. */
export const AUTO_DB = "gauntlet-auto-backups";
/** Their note of the last outcome (localStorage): not part of a backup either. */
export const AUTO_NOTE = "gauntlet:auto-backup";
/** The picked backup folder (`folder.ts`): a folder on this computer can't
    go in a file, so never part of a backup and never restored. */
export const FOLDER_DB = "gauntlet-backup-folder";
/** Its note of the last write (localStorage): not part of a backup either. */
export const FOLDER_NOTE = "gauntlet:folder-backup";

/** Kept as they are here: never in a backup, never replaced by a restore. */
const LOCAL_ONLY_KEYS = [AUTO_NOTE, FOLDER_NOTE];
const LOCAL_ONLY_DBS = [AUTO_DB, FOLDER_DB];

export const OTHER_TABS = "Another tab of this site is open. Close every other gauntlet, Boardkit and Linkkit tab, then try again.";

async function dumpDatabase(name: string): Promise<DatabaseDump> {
  const db = await open(name);
  try {
    const stores: StoreDump[] = [];
    for (const storeName of Array.from(db.objectStoreNames)) {
      const store = db.transaction(storeName, "readonly").objectStore(storeName);
      const [keys, values] = await Promise.all([done(store.getAllKeys()), done(store.getAll())]);
      const records: { key: Encoded; value: Encoded }[] = [];
      const skipped: Encoded[] = [];
      for (let i = 0; i < keys.length; i++) {
        const key = await encode(keys[i]);
        try {
          records.push({ key, value: await encode(values[i]) });
        } catch (error) {
          if (!(error instanceof CannotEncode)) throw error;
          skipped.push(key);
        }
      }
      stores.push({
        name: storeName,
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        indexes: Array.from(store.indexNames, (indexName) => {
          const index = store.index(indexName);
          return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
        }),
        records,
        skipped,
      });
    }
    return { name, version: db.version, stores };
  } finally {
    db.close();
  }
}

/** Everything this site keeps in this browser. */
export async function makeBackup(now: Date): Promise<BackupFile> {
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (!LOCAL_ONLY_KEYS.includes(key)) local[key] = localStorage.getItem(key)!;
  }
  const names = (await indexedDB.databases())
    .map((db) => db.name)
    .filter((name): name is string => !!name && !LOCAL_ONLY_DBS.includes(name));
  const databases: DatabaseDump[] = [];
  for (const name of names.sort()) databases.push(await dumpDatabase(name));
  return { format: FORMAT, version: VERSION, createdAt: now.toISOString(), site: location.origin, localStorage: local, indexedDB: databases };
}

function createStore(db: IDBDatabase, dump: StoreDump): void {
  const store = db.createObjectStore(dump.name, { keyPath: dump.keyPath, autoIncrement: dump.autoIncrement });
  for (const index of dump.indexes) {
    store.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
  }
}

/** Opens the database with every store the dump has, creating it (at the
    dump's version) or adding missing stores (one version up). */
async function openForRestore(dump: DatabaseDump, exists: boolean): Promise<IDBDatabase> {
  if (!exists) {
    return open(dump.name, dump.version, (db) => dump.stores.forEach((store) => createStore(db, store)));
  }
  const db = await open(dump.name);
  const missing = dump.stores.filter((store) => !db.objectStoreNames.contains(store.name));
  if (missing.length === 0) return db;
  const version = db.version + 1;
  db.close();
  return open(dump.name, version, (upgraded) => missing.forEach((store) => createStore(upgraded, store)));
}

async function restoreDatabase(dump: DatabaseDump, exists: boolean): Promise<void> {
  if (dump.stores.length === 0) return;
  const db = await openForRestore(dump, exists);
  try {
    const tx = db.transaction(dump.stores.map((store) => store.name), "readwrite");
    const writing = finished(tx);
    for (const storeDump of dump.stores) {
      const store = tx.objectStore(storeDump.name);
      const keep = storeDump.skipped.map((key) => decode(key) as IDBValidKey);
      const keys = await done(store.getAllKeys());
      for (const key of keys) {
        if (!keep.some((k) => indexedDB.cmp(k, key) === 0)) store.delete(key);
      }
      for (const { key, value } of storeDump.records) {
        if (storeDump.keyPath === null) store.put(decode(value), decode(key) as IDBValidKey);
        else store.put(decode(value));
      }
    }
    await writing;
  } finally {
    db.close();
  }
}

/**
 * Puts this browser's storage back as it was in `file`. localStorage is
 * replaced wholesale. Each database in the file gets exactly the file's
 * records, except those the file could not hold (a picked backup folder),
 * which stay as they are here. A database that is not in the file is left
 * alone. Other tabs of the site must be closed first: an open app would
 * write its own state back over the restore.
 */
export async function restoreBackup(file: BackupFile): Promise<void> {
  const existing = new Set((await indexedDB.databases()).map((db) => db.name));
  // Databases first: a tab still holding one open makes this fail before
  // anything has been changed.
  for (const dump of file.indexedDB) {
    if (!LOCAL_ONLY_DBS.includes(dump.name)) await restoreDatabase(dump, existing.has(dump.name));
  }
  // The automatic backups' and the folder's notes stay as they are here.
  const notes = LOCAL_ONLY_KEYS.map((key) => [key, localStorage.getItem(key)] as const);
  localStorage.clear();
  for (const [key, value] of Object.entries(file.localStorage)) {
    if (!LOCAL_ONLY_KEYS.includes(key)) localStorage.setItem(key, value);
  }
  for (const [key, value] of notes) if (value !== null) localStorage.setItem(key, value);
}
