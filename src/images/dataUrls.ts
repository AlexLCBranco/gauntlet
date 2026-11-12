// No picture lives inside a document record as a data: address (speed
// session, Part 2). tldraw's own paths never leave one (a pasted or dropped
// file is stored as a Blob and its asset's `src` is "asset:<id>"; pasted
// content with data: pictures is uploaded the same way), but a whiteboard
// saved by older code, or by a path nobody thought of, may hold some: each
// such record carries the whole picture as text, is rewritten with every
// save and sits in memory twice. Any found, when the whiteboard opens or
// later, is moved: its bytes stored as tldraw stores a pasted file, then its
// record pointed there. The bytes are stored FIRST; if that fails the record
// is left exactly as it was.

import { dataUrlToFile, type Editor, type TLAsset } from "tldraw";

const inRecord = (a: TLAsset) => (a.type === "image" || a.type === "video") && typeof a.props.src === "string" && a.props.src.startsWith("data:");

/** Moves every data: picture out of its record. Returns how many moved. */
export async function movePicturesOutOfRecords(editor: Editor): Promise<number> {
  let moved = 0;
  for (const asset of editor.getAssets().filter(inRecord)) {
    try {
      const props = asset.props as { src: string; name: string; mimeType: string | null };
      const file = await dataUrlToFile(props.src, props.name || "picture", props.mimeType ?? "image/png");
      const { src } = await editor.uploadAsset(asset, file);
      // Still there, still the same picture?
      const now = editor.getAsset(asset.id);
      if (!now || now.props.src !== props.src) continue;
      editor.run(() => editor.updateAssets([{ ...now, props: { ...now.props, src } } as TLAsset]), { history: "ignore" });
      moved++;
    } catch (error) {
      console.warn("Gauntlet: a picture kept inside its record could not be moved out", asset.id, error);
    }
  }
  return moved;
}

/** Does it when the whiteboard opens and whenever such a record appears.
    Returns a stop function. */
export function keepPicturesOutOfRecords(editor: Editor): () => void {
  let running = false;
  let again = false;
  const run = async () => {
    if (running) return void (again = true);
    running = true;
    try {
      do {
        again = false;
        await movePicturesOutOfRecords(editor);
      } while (again);
    } finally {
      running = false;
    }
  };
  void run();
  return editor.store.listen(
    ({ changes }) => {
      const found = [...Object.values(changes.added), ...Object.values(changes.updated).map(([, to]) => to)].some((r) => r.typeName === "asset" && inRecord(r as TLAsset));
      if (found) void run();
    },
    { scope: "document" },
  );
}
