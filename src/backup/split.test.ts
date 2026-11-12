import { describe as group, expect, it } from "vitest";

import { decode, encode, extensionOf, FORMAT, IMAGE_NAME, MissingPictures, picturesOf, pictureSizes, readBackup, SPLIT_VERSION, TAG, VERSION, withPictures, type BackupFile } from "./format";
import { fullFromCopy, pictureName, picturesUsedBy, serialize } from "./snapshot";

// The split save (speed session, Part 1): a copy without its pictures, each
// picture a file of its own.

const bytes = (n: number, seed = 7) => new Uint8Array(n).map((_, i) => (i * seed) % 256);
const png = (n: number, seed = 7) => new Blob([bytes(n, seed)], { type: "image/png" });

/** A split copy holding two pictures (one nested in a record), encoded as a save is. */
async function splitCopy() {
  const stored = new Map<string, Blob>();
  const namer = async (blob: Blob) => {
    const { name } = await pictureName(blob, `db\0assets\0${blob.size}`);
    stored.set(name, blob);
    return name;
  };
  const a = png(50_000);
  const b = new File([bytes(20, 3)], "small.gif", { type: "image/gif", lastModified: 1_700_000_000_000 });
  const file: BackupFile = {
    format: FORMAT,
    version: SPLIT_VERSION,
    createdAt: "2026-11-12T10:00:00.000Z",
    site: "http://localhost",
    localStorage: { k: "v" },
    indexedDB: [
      {
        name: "db",
        version: 1,
        stores: [
          {
            name: "assets",
            keyPath: null,
            autoIncrement: false,
            indexes: [],
            records: [
              { key: "asset:a", value: await encode(a, namer) },
              { key: "rec", value: await encode({ title: "t", when: new Date("2026-01-02T03:04:05Z"), pic: [b] }, namer) },
            ],
            skipped: [],
          },
        ],
      },
    ],
    images: [],
  };
  return { file: { ...file, images: [...stored.keys()].sort() }, stored, a, b };
}

group("a split copy", () => {
  it("names each picture instead of holding its bytes, and reads no picture whole", async () => {
    const { file, stored } = await splitCopy();
    const text = JSON.stringify(file);
    expect(text.length).toBeLessThan(2000);
    expect(text).not.toContain('"kind":"blob"');
    expect(stored.size).toBe(2);
    for (const name of stored.keys()) expect(name).toMatch(IMAGE_NAME);
    expect(picturesOf(file).sort()).toEqual([...stored.keys()].sort());
    expect([...pictureSizes(file).values()].sort((x, y) => x! - y!)).toEqual([20, 50_000]);
    expect(readBackup(JSON.parse(text))).not.toBeNull();
  });

  it("with its pictures put back, restores byte for byte (type, file name and time kept)", async () => {
    const { file, stored, a } = await splitCopy();
    const back = withPictures(JSON.parse(JSON.stringify(file)) as BackupFile, stored);
    const [first, second] = back.indexedDB[0]!.stores[0]!.records.map((r) => decode(r.value)) as [Blob, { title: string; when: Date; pic: File[] }];
    expect(first).toBeInstanceOf(Blob);
    expect(first.type).toBe("image/png");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array(await a.arrayBuffer()));
    expect(second.title).toBe("t");
    expect(second.when).toEqual(new Date("2026-01-02T03:04:05Z"));
    expect(second.pic[0]).toBeInstanceOf(File);
    expect(second.pic[0]!.name).toBe("small.gif");
    expect(second.pic[0]!.lastModified).toBe(1_700_000_000_000);
    expect(new Uint8Array(await second.pic[0]!.arrayBuffer())).toEqual(bytes(20, 3));
  });

  it("is refused whole when one picture is missing: which, and how many", async () => {
    const { file, stored } = await splitCopy();
    const [gone] = [...stored.keys()];
    stored.delete(gone!);
    let thrown: unknown;
    try {
      withPictures(file, stored);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MissingPictures);
    expect((thrown as MissingPictures).missing).toEqual([gone]);
    expect((thrown as MissingPictures).message).toContain("1 of this copy's 2 pictures could not be found");
  });

  it("can't be decoded before its pictures are loaded (never a picture-less restore)", async () => {
    const { file } = await splitCopy();
    expect(() => decode(file.indexedDB[0]!.stores[0]!.records[0]!.value)).toThrow(/pictures were not loaded/);
  });

  it("a complete (version 1) file needs no pictures and passes through", async () => {
    const v1: BackupFile = { format: FORMAT, version: VERSION, createdAt: "", site: "", localStorage: {}, indexedDB: [] };
    expect(picturesOf(v1)).toEqual([]);
    expect(withPictures(v1, new Map())).toBe(v1);
  });
});

group("a picture's file name", () => {
  it("is the same for the same picture in the same place, whatever its size, without reading it whole", async () => {
    const big = png(3_000_000);
    const one = await pictureName(big, "db\0s\0k");
    const two = await pictureName(png(3_000_000), "db\0s\0k");
    expect(one.name).toBe(two.name);
    expect(one.name).toMatch(/^[0-9a-f]{40}\.png$/);
    expect(one.sampled).toBe(4096 * 3);
  });

  it("differs for another picture, another size, another type or another place", async () => {
    const base = (await pictureName(png(100_000), "db\0s\0k")).name;
    expect((await pictureName(png(100_000, 11), "db\0s\0k")).name).not.toBe(base);
    expect((await pictureName(png(100_001), "db\0s\0k")).name).not.toBe(base);
    expect((await pictureName(new Blob([bytes(100_000)], { type: "image/jpeg" }), "db\0s\0k")).name).not.toBe(base);
    expect((await pictureName(png(100_000), "db\0s\0other")).name).not.toBe(base);
  });

  it("ends as its type says", () => {
    expect(extensionOf("image/jpeg")).toBe("jpg");
    expect(extensionOf("image/svg+xml")).toBe("svg");
    expect(extensionOf("video/mp4")).toBe("mp4");
    expect(extensionOf("application/x-unknown")).toBe("bin");
    expect(extensionOf("")).toBe("bin");
  });
});

group("one complete file", () => {
  it("serialize writes the same text as JSON.stringify, piece by piece", async () => {
    const { file } = await splitCopy();
    const empty: BackupFile = { format: FORMAT, version: VERSION, createdAt: "x", site: "y", localStorage: {}, indexedDB: [] };
    const noRecords: BackupFile = { ...empty, indexedDB: [{ name: "a", version: 2, stores: [{ name: "s", keyPath: "id", autoIncrement: true, indexes: [], records: [], skipped: ["k"] }, { name: "t", keyPath: null, autoIncrement: false, indexes: [], records: [{ key: 1, value: { a: [1, 2] } }, { key: 2, value: null }], skipped: [] }] }, { name: "b", version: 1, stores: [] }] };
    for (const f of [file, empty, noRecords]) expect(JSON.parse(await serialize(f).text())).toEqual(JSON.parse(JSON.stringify(f)));
    expect(await serialize(noRecords).text()).toBe(JSON.stringify(noRecords));
  });

  it("a split copy with its pictures becomes a version 1 file that restores the same", async () => {
    const { file, stored, a } = await splitCopy();
    const full = readBackup(JSON.parse(await (await fullFromCopy(withPictures(file, stored))).text()))!;
    expect(full.version).toBe(VERSION);
    expect(full.images).toBeUndefined();
    const value = full.indexedDB[0]!.stores[0]!.records[0]!.value as Record<string, { kind: string }>;
    expect(value[TAG]!.kind).toBe("blob");
    const back = decode(value) as Blob;
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(new Uint8Array(await a.arrayBuffer()));
    expect(picturesOf(full)).toEqual([]);
  });
});

group("which pictures a save in the folder uses", () => {
  it("a split save: the ones it names", async () => {
    const { file, stored } = await splitCopy();
    expect((await picturesUsedBy(new Blob([JSON.stringify(file)]))).sort()).toEqual([...stored.keys()].sort());
  });

  it("a complete old save, another JSON file, an empty file: none (and not read through)", async () => {
    const v1 = { format: FORMAT, version: VERSION, createdAt: "", site: "", localStorage: {}, indexedDB: [] };
    expect(await picturesUsedBy(new Blob([JSON.stringify(v1)]))).toEqual([]);
    expect(await picturesUsedBy(new Blob(["{}"]))).toEqual([]);
    expect(await picturesUsedBy(new Blob([""]))).toEqual([]);
    expect(await picturesUsedBy(new Blob([JSON.stringify({ notes: "mine" })]))).toEqual([]);
  });

  it("a split save that can't be read throws, so nothing is taken for unused", async () => {
    const { file } = await splitCopy();
    const cut = JSON.stringify(file).slice(0, -40);
    await expect(picturesUsedBy(new Blob([cut]))).rejects.toThrow();
  });
});
