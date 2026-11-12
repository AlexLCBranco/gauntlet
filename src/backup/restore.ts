// A split copy (format.ts, version 2) keeps its pictures outside its file.
// Before it is restored they are all found and read: in the backup folder
// (`gauntlet-images`) first, then in this browser's own storage (where an
// in-browser automatic backup's pictures still are). If even one is missing
// the restore is refused, before anything here has been changed: never half
// a whiteboard.

import { takeSnapshot } from "./client";
import { backupFolder, folderPictures } from "./folder";
import { IMAGES_DIR, MissingPictures, pictureSizes, withPictures, type BackupFile } from "./format";

/**
 * `file` ready for `restoreBackup`: a split copy with every picture read
 * into memory and put in its place; a complete (version 1) file as it is.
 * Throws an Error that says what is missing and where it was looked for.
 */
export async function loadPictures(file: BackupFile): Promise<BackupFile> {
  const sizes = pictureSizes(file);
  if (sizes.size === 0) return withPictures(file, new Map());
  const right = (name: string, blob: Blob) => sizes.get(name) === undefined || sizes.get(name) === blob.size;
  const found = new Map<string, Blob>();
  for (const [name, picture] of await folderPictures([...sizes.keys()])) if (right(name, picture)) found.set(name, picture);
  if (found.size < sizes.size) {
    // Still in this browser? (Its pictures get the same names.)
    const here = await takeSnapshot(new Date());
    for (const { name, blob } of here.images) if (sizes.has(name) && !found.has(name) && right(name, blob)) found.set(name, blob);
  }
  // Read now, all of them, while nothing has been touched: what is put back
  // must not depend on a file or a record the restore itself replaces.
  const read = new Map<string, Blob>();
  for (const [name, picture] of found) {
    try {
      read.set(name, new Blob([await picture.arrayBuffer()], { type: picture.type }));
    } catch {
      // Unreadable counts as missing.
    }
  }
  try {
    return withPictures(file, read);
  } catch (error) {
    if (!(error instanceof MissingPictures)) throw error;
    const folder = await backupFolder();
    const where = folder
      ? `They were looked for in “${folder.name}/${IMAGES_DIR}” and in this browser. Put the missing files back in that folder (your Google Drive may still be downloading them), then restore again.`
      : `This copy keeps its pictures as files in the folder “${IMAGES_DIR}” inside your backup folder. Choose that backup folder on this page first, then restore again.`;
    const names = error.missing.slice(0, 3).join(", ") + (error.missing.length > 3 ? ", …" : "");
    throw new Error(`${error.message} ${where} Missing: ${names}`);
  }
}
