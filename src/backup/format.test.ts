import { describe as group, expect, it } from "vitest";

import { CannotEncode, decode, describe, encode, fileName, FORMAT, readBackup, summarize, VERSION, type BackupFile } from "./format";

const roundTrip = async (value: unknown) => decode(JSON.parse(JSON.stringify(await encode(value))));

group("encode / decode", () => {
  it("keeps plain JSON as it is", async () => {
    const value = { a: 1, b: "x", c: [true, null, { d: 2.5 }] };
    expect(await encode(value)).toEqual(value);
    expect(await roundTrip(value)).toEqual(value);
  });

  it("keeps a picture's bytes and type through JSON", async () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 7) % 256);
    const back = (await roundTrip({ image: new Blob([bytes], { type: "image/png" }) })) as { image: Blob };
    expect(back.image).toBeInstanceOf(Blob);
    expect(back.image.type).toBe("image/png");
    expect(new Uint8Array(await back.image.arrayBuffer())).toEqual(bytes);
  });

  it("keeps a file's name", async () => {
    const back = (await roundTrip(new File(["hi"], "a.txt", { type: "text/plain" }))) as File;
    expect(back).toBeInstanceOf(File);
    expect(back.name).toBe("a.txt");
    expect(await back.text()).toBe("hi");
  });

  it("keeps dates, undefined, NaN, byte arrays", async () => {
    const value = { when: new Date("2026-10-19T12:00:00Z"), gone: undefined, nan: NaN, inf: -Infinity, bytes: new Uint16Array([1, 65535]) };
    const back = (await roundTrip(value)) as typeof value;
    expect(back.when).toEqual(value.when);
    expect("gone" in back && back.gone === undefined).toBe(true);
    expect(back.nan).toBeNaN();
    expect(back.inf).toBe(-Infinity);
    expect(back.bytes).toEqual(value.bytes);
  });

  it("refuses what cannot go in a file (a folder handle)", async () => {
    class FileSystemDirectoryHandle {}
    await expect(encode({ folder: new FileSystemDirectoryHandle() })).rejects.toBeInstanceOf(CannotEncode);
  });
});

const backup = (over: Partial<BackupFile> = {}): BackupFile => ({
  format: FORMAT,
  version: VERSION,
  createdAt: "2026-10-19T12:00:00.000Z",
  site: "https://gauntlet-home.vercel.app",
  localStorage: {
    "boardkit:registry": JSON.stringify({ boards: [{ id: "a" }, { id: "b" }], activeBoardId: "a" }),
    "linkkit:registry": JSON.stringify({ maps: [{ id: "m" }] }),
  },
  indexedDB: [
    {
      name: "boardkit",
      version: 1,
      stores: [{ name: "kv", keyPath: null, autoIncrement: false, indexes: [], records: [{ key: "boardImage:1", value: {} }], skipped: ["backupFolder"] }],
    },
    {
      name: "TLDRAW_DOCUMENT_v2gauntlet-whiteboard",
      version: 4,
      stores: [{ name: "records", keyPath: null, autoIncrement: false, indexes: [], records: [{ key: "page:1", value: { typeName: "page" } }, { key: "shape:1", value: { typeName: "shape" } }], skipped: [] }],
    },
  ],
  ...over,
});

group("readBackup", () => {
  it("reads a gauntlet backup", () => {
    expect(readBackup(JSON.parse(JSON.stringify(backup())))).not.toBeNull();
  });

  it("refuses anything else, e.g. a Boardkit or Linkkit export", () => {
    expect(readBackup(null)).toBeNull();
    expect(readBackup({ format: "linkkit-maps", version: 1, maps: [] })).toBeNull();
    expect(readBackup({ version: 1, boards: [] })).toBeNull();
    expect(readBackup({ ...backup(), version: 2 })).toBeNull();
    expect(readBackup({ ...backup(), localStorage: { a: 1 } })).toBeNull();
  });
});

group("summary", () => {
  it("counts boards, pictures, maps and whiteboard pages", () => {
    const summary = summarize(backup());
    expect(summary).toEqual({ boards: 2, maps: 1, pictures: 1, whiteboardPages: 1 });
    expect(describe(summary)).toBe("2 Boardkit boards, 1 background picture, 1 Linkkit map, 1 whiteboard page");
  });

  it("is zero for an empty browser", () => {
    expect(summarize(backup({ localStorage: {}, indexedDB: [] }))).toEqual({ boards: 0, maps: 0, pictures: 0, whiteboardPages: 0 });
  });
});

it("names files by local date and time", () => {
  expect(fileName("gauntlet-backup", new Date(2026, 9, 19, 9, 5))).toBe("gauntlet-backup-2026-10-19-0905.json");
});
