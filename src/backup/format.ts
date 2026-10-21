// The backup file: everything this site keeps in one browser (the owner's
// Boardkit boards and their pictures, Linkkit maps, the whiteboard, and
// whatever else is stored, e.g. the old home page's layout), as one JSON file the owner keeps and can restore.
//
// It is a copy of the browser's storage itself, not of each app's own
// export: every localStorage key, and every IndexedDB database with its
// stores and records. So it keeps what the apps' own exports leave out
// (Boardkit's trash, a map linked to a board, settings), and it needs no
// change when an app adds a key. Pure: no browser storage here, see
// `storage.ts`.

export const FORMAT = "gauntlet-backup";
export const VERSION = 1;

export interface BackupFile {
  readonly format: typeof FORMAT;
  readonly version: typeof VERSION;
  /** When it was made (ISO time). */
  readonly createdAt: string;
  /** The address it was made on, e.g. https://gauntlet-home.vercel.app. */
  readonly site: string;
  readonly localStorage: Readonly<Record<string, string>>;
  readonly indexedDB: readonly DatabaseDump[];
}

export interface DatabaseDump {
  readonly name: string;
  readonly version: number;
  readonly stores: readonly StoreDump[];
}

export interface StoreDump {
  readonly name: string;
  readonly keyPath: string | string[] | null;
  readonly autoIncrement: boolean;
  readonly indexes: readonly IndexDump[];
  /** Keys and values, encoded (`encode`). */
  readonly records: readonly { readonly key: Encoded; readonly value: Encoded }[];
  /** Keys of records that cannot go in a file: a backup folder the owner
      picked (the browser keeps it as a handle). A restore leaves these as
      they are in the browser. */
  readonly skipped: readonly Encoded[];
}

export interface IndexDump {
  readonly name: string;
  readonly keyPath: string | string[];
  readonly unique: boolean;
  readonly multiEntry: boolean;
}

/** A value as JSON. Pictures and dates, which JSON cannot hold, become
    `{ [TAG]: … }`. */
export type Encoded = unknown;

export const TAG = "$gauntletBackup";

/** Thrown for a value that cannot go in a file (a folder handle). */
export class CannotEncode extends Error {}

const isPlain = (v: object) => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

export function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

export function base64ToBytes(data: string): Uint8Array<ArrayBuffer> {
  const text = atob(data);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** A stored value as JSON. Async because a picture's bytes are read. */
export async function encode(value: unknown): Promise<Encoded> {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    // JSON has no NaN or Infinity.
    return Number.isFinite(value) ? value : { [TAG]: { kind: "number", value: String(value) } };
  }
  if (value === undefined) return { [TAG]: { kind: "undefined" } };
  if (typeof value !== "object") throw new CannotEncode(typeof value);
  if (value instanceof Blob) {
    const data = bytesToBase64(new Uint8Array(await value.arrayBuffer()));
    const name = typeof File !== "undefined" && value instanceof File ? value.name : undefined;
    return { [TAG]: { kind: "blob", type: value.type, data, ...(name === undefined ? {} : { name }) } };
  }
  if (value instanceof Date) return { [TAG]: { kind: "date", value: value.toISOString() } };
  if (value instanceof ArrayBuffer) return { [TAG]: { kind: "bytes", data: bytesToBase64(new Uint8Array(value)) } };
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { [TAG]: { kind: "bytes", view: value.constructor.name, data: bytesToBase64(bytes) } };
  }
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (!isPlain(value)) throw new CannotEncode(value.constructor?.name ?? "object");
  const out: Record<string, Encoded> = {};
  for (const [k, v] of Object.entries(value)) out[k] = await encode(v);
  return out;
}

const VIEWS: Record<string, new (buffer: ArrayBuffer) => ArrayBufferView> = {
  Uint8Array, Int8Array, Uint8ClampedArray, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array,
};

/** The inverse of `encode`. */
export function decode(value: Encoded): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decode);
  const record = value as Record<string, unknown>;
  const tagged = record[TAG] as Record<string, string> | undefined;
  if (tagged && Object.keys(record).length === 1) {
    switch (tagged.kind) {
      case "undefined":
        return undefined;
      case "number":
        return Number(tagged.value);
      case "date":
        return new Date(tagged.value);
      case "blob": {
        const bytes = base64ToBytes(tagged.data);
        return tagged.name !== undefined && typeof File !== "undefined"
          ? new File([bytes], tagged.name, { type: tagged.type })
          : new Blob([bytes], { type: tagged.type });
      }
      case "bytes": {
        const buffer = base64ToBytes(tagged.data).buffer;
        const View = tagged.view === undefined ? undefined : VIEWS[tagged.view];
        return View ? new View(buffer) : buffer;
      }
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) out[k] = decode(v);
  return out;
}

/** The file's contents if it is a gauntlet backup, else `null`. */
export function readBackup(data: unknown): BackupFile | null {
  if (typeof data !== "object" || data === null) return null;
  const file = data as Partial<BackupFile>;
  if (file.format !== FORMAT || file.version !== VERSION) return null;
  if (typeof file.localStorage !== "object" || file.localStorage === null || !Array.isArray(file.indexedDB)) return null;
  if (!Object.values(file.localStorage).every((v) => typeof v === "string")) return null;
  return file as BackupFile;
}

export interface Summary {
  readonly boards: number;
  readonly maps: number;
  readonly pictures: number;
  readonly whiteboardPages: number;
}

const countList = (raw: string | undefined, field: string): number => {
  try {
    const list = (JSON.parse(raw ?? "null") as Record<string, unknown> | null)?.[field];
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
};

/** What a backup holds, in the owner's words: Boardkit's boards (its
    registry), Linkkit's maps (its registry), Boardkit's pictures, the
    whiteboard's pages. */
export function summarize(file: BackupFile): Summary {
  let pictures = 0;
  let whiteboardPages = 0;
  for (const db of file.indexedDB) {
    for (const store of db.stores) {
      for (const { key, value } of store.records) {
        if (db.name === "boardkit" && typeof key === "string" && key.startsWith("boardImage:")) pictures++;
        if (db.name.startsWith("TLDRAW_DOCUMENT") && (value as { typeName?: unknown } | null)?.typeName === "page") whiteboardPages++;
      }
    }
  }
  return {
    boards: countList(file.localStorage["boardkit:registry"], "boards"),
    maps: countList(file.localStorage["linkkit:registry"], "maps"),
    pictures,
    whiteboardPages,
  };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function describe(summary: Summary): string {
  return [
    plural(summary.boards, "Boardkit board"),
    plural(summary.pictures, "background picture"),
    plural(summary.maps, "Linkkit map"),
    plural(summary.whiteboardPages, "whiteboard page"),
  ].join(", ");
}

/** `gauntlet-backup-2026-10-19-1432.json`, in the owner's local time. */
export function fileName(prefix: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}
