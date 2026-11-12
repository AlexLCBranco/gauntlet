// Makes a smaller copy of a picture, off the page's own thread
// (src/images/smaller.ts asks): decoded, resized and written out again here.

export interface SmallerRequest {
  readonly id: number;
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}
export type SmallerReply = { readonly id: number; readonly blob: Blob } | { readonly id: number; readonly error: string };

self.onmessage = async (event: MessageEvent<SmallerRequest>) => {
  const { id, blob, width, height } = event.data;
  try {
    const bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    // A photo stays a JPEG; anything else (screenshots, logos, with or
    // without see-through parts) stays exact, as a PNG.
    const out = await canvas.convertToBlob(blob.type === "image/jpeg" ? { type: "image/jpeg", quality: 0.92 } : { type: "image/png" });
    self.postMessage({ id, blob: out } satisfies SmallerReply);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies SmallerReply);
  }
};
