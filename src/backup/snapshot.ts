// Reads everything this site keeps in this browser into a backup: the heavy
// part of every save, so it runs in a worker (`worker.ts`, called through
// `client.ts`), never on the page's own thread (speed session, Part 1).
// Nothing here touches the page: no `window`, no localStorage (a worker has
// none: the page hands its localStorage over), only IndexedDB.
//
// Two kinds of backup (format.ts): the split one (`snapshot`: the data as
// text, each picture named and handed back as it is stored, never read
// whole), and the complete one-file one (`fullBackup`: every picture read
// and put inside, for "Save a backup" and for copies that must stand
// alone).

import {
  CannotEncode,
  describe,
  encode,
  extensionOf,
  FORMAT,
  picturesOf,
  readBackup,
  shortWhat,
  SPLIT_VERSION,
  summarize,
  VERSION,
  type BackupFile,
  type DatabaseDump,
  type Encoded,
  type StoreDump,
} from "./format";
import { fingerprint, sameDataText } from "./policy";
import { LOCAL_ONLY_DBS } from "./storage";

export interface SnapshotRequest {
  /** The page's localStorage (without the backups' own notes). */
  readonly local: Readonly<Record<string, string>>;
  /** When (ms). */
  readonly now: number;
  /** The page's address, e.g. https://gauntlet-home.vercel.app. */
  readonly site: string;
}

export interface Snapshot {
  /** The split backup file (version 2), as text: everything but pictures. */
  readonly json: string;
  /** Tells "changed" from "the same" (policy.ts). */
  readonly print: string;
  /** What it holds, in the owner's words: long and short. */
  readonly what: string;
  readonly short: string;
  /** Every picture it names, as stored (a handle: its bytes are not read). */
  readonly images: readonly { readonly name: string; readonly blob: Blob }[];
  readonly stats: {
    /** How long reading and writing it out took (ms, in the worker). */
    readonly ms: number;
    readonly pictures: number;
    /** Bytes read from pictures to name them (a few KB each, never all). */
    readonly sampledBytes: number;
    readonly jsonChars: number;
  };
}

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("The database is held by another tab."));
  });
}

/** Names a picture found at `where` (database, store, key). */
type Namer = (blob: Blob, where: string) => Promise<string>;

async function dumpDatabase(name: string, namer?: Namer): Promise<DatabaseDump> {
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
        const where = `${name}\0${storeName}\0${JSON.stringify(key)}`;
        try {
          records.push({ key, value: await encode(values[i], namer && ((blob) => namer(blob, where))) });
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

async function dumpAll(namer?: Namer): Promise<DatabaseDump[]> {
  const names = (await indexedDB.databases()).map((db) => db.name).filter((name): name is string => !!name && !LOCAL_ONLY_DBS.includes(name));
  const databases: DatabaseDump[] = [];
  for (const name of names.sort()) databases.push(await dumpDatabase(name, namer));
  return databases;
}

const SAMPLE = 4096;
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * A picture's file name: from where it is stored (database, store, key),
 * its size, its type, and three small samples of its bytes (start, middle,
 * end). So the same picture always gets the same name without being read
 * whole, a different picture under the same key gets another, and whether
 * it is already in the folder is just "is there a file of that name".
 */
export async function pictureName(blob: Blob, where: string): Promise<{ name: string; sampled: number }> {
  const parts: BlobPart[] = [`${where}\0${blob.size}\0${blob.type}\0`];
  let sampled = 0;
  if (blob.size <= SAMPLE * 3) {
    parts.push(blob);
    sampled = blob.size;
  } else {
    const mid = Math.floor(blob.size / 2);
    parts.push(blob.slice(0, SAMPLE), blob.slice(mid, mid + SAMPLE), blob.slice(blob.size - SAMPLE));
    sampled = SAMPLE * 3;
  }
  const digest = await crypto.subtle.digest("SHA-256", await new Blob(parts).arrayBuffer());
  return { name: `${hex(digest).slice(0, 40)}.${extensionOf(blob.type)}`, sampled };
}

/** Everything here now, as a split backup. */
export async function snapshot(req: SnapshotRequest): Promise<Snapshot> {
  const t0 = performance.now();
  const images = new Map<string, Blob>();
  let sampledBytes = 0;
  const databases = await dumpAll(async (blob, where) => {
    const { name, sampled } = await pictureName(blob, where);
    sampledBytes += sampled;
    images.set(name, blob);
    return name;
  });
  const file: BackupFile = {
    format: FORMAT,
    version: SPLIT_VERSION,
    createdAt: new Date(req.now).toISOString(),
    site: req.site,
    localStorage: req.local,
    indexedDB: databases,
    images: [...images.keys()].sort(),
  };
  const json = JSON.stringify(file);
  const summary = summarize(file);
  return {
    json,
    print: fingerprint(sameDataText(file)),
    what: describe(summary),
    short: shortWhat(summary),
    images: [...images].map(([name, blob]) => ({ name, blob })),
    stats: { ms: performance.now() - t0, pictures: images.size, sampledBytes, jsonChars: json.length },
  };
}

/**
 * A backup file as a Blob, written out piece by piece (one record at a
 * time), so a big one never has to exist as one string: the same text as
 * `JSON.stringify(file)`.
 */
export function serialize(file: BackupFile): Blob {
  const parts: string[] = [];
  const openObject = (value: object, next: string) => {
    const text = JSON.stringify(value);
    parts.push(text === "{}" ? `{"${next}":[` : `${text.slice(0, -1)},"${next}":[`);
  };
  const { indexedDB: databases, ...head } = file;
  openObject(head, "indexedDB");
  databases.forEach((db, i) => {
    if (i > 0) parts.push(",");
    const { stores, ...dbHead } = db;
    openObject(dbHead, "stores");
    stores.forEach((store, j) => {
      if (j > 0) parts.push(",");
      const { records, skipped, ...storeHead } = store;
      openObject(storeHead, "records");
      records.forEach((record, k) => parts.push(k > 0 ? "," : "", JSON.stringify(record)));
      parts.push('],"skipped":', JSON.stringify(skipped), "}");
    });
    parts.push("]}");
  });
  parts.push("]}");
  return new Blob(parts, { type: "application/json" });
}

/** Everything here now as ONE complete file (version 1): every picture
    read and put inside. Slow with many pictures: on demand only. */
export async function fullBackup(req: SnapshotRequest): Promise<{ blob: Blob; what: string }> {
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date(req.now).toISOString(),
    site: req.site,
    localStorage: req.local,
    indexedDB: await dumpAll(),
  };
  return { blob: serialize(file), what: describe(summarize(file)) };
}

/** A copy whose pictures were put back in (`withPictures`) as one complete
    file (version 1): for downloading a split copy. */
export async function fullFromCopy(file: BackupFile): Promise<Blob> {
  const embed = async (v: Encoded): Promise<Encoded> => {
    if (v === null || typeof v !== "object") return v;
    if (v instanceof Blob) return encode(v);
    if (Array.isArray(v)) return Promise.all(v.map(embed));
    const out: Record<string, Encoded> = {};
    for (const [k, x] of Object.entries(v)) out[k] = await embed(x);
    return out;
  };
  const databases: DatabaseDump[] = [];
  for (const db of file.indexedDB) {
    const stores: StoreDump[] = [];
    for (const store of db.stores) {
      const records: { key: Encoded; value: Encoded }[] = [];
      for (const r of store.records) records.push({ key: r.key, value: await embed(r.value) });
      stores.push({ ...store, records });
    }
    databases.push({ ...db, stores });
  }
  const { images: _images, ...rest } = file;
  return serialize({ ...rest, version: VERSION, indexedDB: databases });
}

export interface CopyInfo {
  readonly version: number;
  readonly createdAt: string;
  readonly what: string;
  readonly short: string;
}

/** What a backup file holds (null: not a gauntlet backup). */
export async function describeCopy(copy: Blob): Promise<CopyInfo | null> {
  let file: BackupFile | null = null;
  try {
    file = readBackup(JSON.parse(await copy.text()));
  } catch {
    file = null;
  }
  if (!file) return null;
  const summary = summarize(file);
  return { version: file.version, createdAt: file.createdAt, what: describe(summary), short: shortWhat(summary) };
}

/**
 * The picture files a copy in the folder uses. Only a split copy (version
 * 2) uses any; a complete one (version 1, which may be very big) is told
 * from its first characters and not read. Throws when a split copy can't
 * be read: then nobody may conclude a picture is unused.
 */
export async function picturesUsedBy(copy: Blob): Promise<string[]> {
  const head = await copy.slice(0, 400).text();
  if (!head.includes(`"format":"${FORMAT}"`) || !new RegExp(`"version":${SPLIT_VERSION}\\b`).test(head)) return [];
  const file = readBackup(JSON.parse(await copy.text()));
  if (!file) throw new Error("A save in the folder could not be read.");
  return picturesOf(file);
}
