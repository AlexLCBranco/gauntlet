import {
  AssetRecordType,
  createShapeId,
  getFontFamily,
  type Editor,
  type TLAsset,
  type TLShapeId,
  type TLShapePartial,
  type VecLike,
} from "tldraw";

import { pageBox, sizePage } from "../../pages/keepFilled";
import { SHEET } from "../../pages/sheet";
import { convertExcalidraw, parseExcalidraw, type ExcData, type ExcFile, type Measure } from "./convert";

/** What an import did, for the notice (ImportNotice.tsx). */
export interface ImportResult {
  source: "paste" | "file";
  count: number;
  notConverted: string[];
}

/** The notice listens for this (window event, detail: ImportResult). */
export const IMPORT_EVENT = "gauntlet:excalidraw-import";

async function fileOf(f: ExcFile, name: string): Promise<File> {
  const blob = await (await fetch(f.dataURL)).blob();
  return new File([blob], name, { type: f.mimeType || blob.type });
}

/** Where pasted content goes: the pointer when it's over the whiteboard,
    else the middle of the view. */
function landingPoint(editor: Editor): VecLike {
  const view = editor.getViewportPageBounds();
  const p = editor.inputs.getCurrentPagePoint();
  return view.containsPoint(p) ? p : view.center;
}

/**
 * Puts an Excalidraw drawing (a pasted clipboard or an opened .excalidraw
 * file) on the current page with our own converter (convert.ts): centred
 * on `point` (else the pointer or the view), kept inside the page (a
 * drawing bigger than the page grows it), as one undo step, selected.
 * Pictures are stored as whiteboard assets before anything is drawn, so
 * they show at once.
 */
export async function importExcalidraw(editor: Editor, data: ExcData, source: ImportResult["source"], point?: VecLike): Promise<ImportResult> {
  // Pictures first: each file the drawing uses becomes a whiteboard asset.
  const used = new Set(data.elements.filter((e) => !e.isDeleted && e.type === "image" && e.fileId).map((e) => e.fileId!));
  const ready = new Map<string, TLAsset>();
  const failed: string[] = [];
  for (const fileId of used) {
    const f = data.files?.[fileId];
    if (!f?.dataURL) continue;
    const assetId = AssetRecordType.createId();
    try {
      const asset = await editor.getAssetForExternalContent({ type: "file", file: await fileOf(f, fileId), assetId });
      if (asset) ready.set(fileId, { ...asset, id: assetId } as TLAsset);
      else failed.push(fileId);
    } catch {
      failed.push(fileId);
    }
  }
  const files = Object.fromEntries(Object.entries(data.files ?? {}).filter(([id]) => ready.has(id)));

  const theme = editor.getCurrentTheme();
  const measure: Measure = (text, { font, fontPx, lineHeight }) =>
    editor.textMeasure.measureText(text, {
      fontFamily: getFontFamily(theme, font),
      fontSize: fontPx,
      lineHeight,
      fontWeight: "normal",
      fontStyle: "normal",
      maxWidth: null,
      padding: "0px",
    });
  const plan = convertExcalidraw(
    { elements: data.elements, files },
    {
      newId: (kind, excId) => (kind === "asset" ? ready.get(excId)!.id : createShapeId()),
      measure,
    },
  );
  for (const f of failed) plan.notConverted.push(`picture ${f}: couldn't be read, shown as a placeholder`);

  // Centre it on the landing point, then keep it inside the page; a
  // drawing bigger than the page starts at its top or left edge and the
  // page grows to hold it.
  const at = point ?? landingPoint(editor);
  const page = pageBox.get() ?? SHEET;
  const b = plan.bounds;
  const fit = (want: number, size: number, min: number, room: number) => (size >= room ? min : Math.max(min, Math.min(want, min + room - size)));
  const dx = fit(at.x - b.w / 2, b.w, page.x, page.w) - b.x;
  const dy = fit(at.y - b.h / 2, b.h, page.y, page.h) - b.y;

  const pageId = editor.getCurrentPageId();
  const shapes = plan.shapes.map(
    (s) =>
      ({
        id: s.id as TLShapeId,
        type: s.type,
        parentId: (s.parentId as TLShapeId) ?? pageId,
        x: s.parentId ? s.x : s.x + dx,
        y: s.parentId ? s.y : s.y + dy,
        rotation: s.rotation,
        opacity: s.opacity,
        ...(s.isLocked ? { isLocked: true } : {}),
        props: { ...editor.getShapeUtil(s.type).getDefaultProps(), ...s.props },
        meta: s.meta,
      }) as TLShapePartial,
  );
  const bindingDefaults = editor.getBindingUtil("arrow").getDefaultProps();
  const roots = new Set(plan.shapes.filter((s) => !s.parentId).map((s) => s.id));

  editor.markHistoryStoppingPoint("import excalidraw");
  editor.run(() => {
    const assets = plan.assets.map((a) => [...ready.values()].find((r) => r.id === a.assetId)!).filter(Boolean);
    if (assets.length > 0) editor.createAssets(assets as TLAsset[]);
    editor.createShapes(shapes);
    if (plan.bindings.length > 0) {
      editor.createBindings(
        plan.bindings.map((bd) => ({
          type: "arrow" as const,
          fromId: bd.fromId as TLShapeId,
          toId: bd.toId as TLShapeId,
          props: { ...bindingDefaults, terminal: bd.terminal, normalizedAnchor: bd.normalizedAnchor, isPrecise: true, isExact: false },
        })),
      );
    }
    for (const g of plan.groups) {
      editor.groupShapes(g.children as TLShapeId[], { groupId: g.id as TLShapeId, select: false });
      for (const c of g.children) roots.delete(c);
      roots.add(g.id);
    }
    editor.select(...([...roots].filter((id) => editor.getShape(id as TLShapeId)) as TLShapeId[]));
  });
  // The page holds it before anything pulls shapes inside.
  sizePage(editor);

  const result: ImportResult = { source, count: plan.count, notConverted: plan.notConverted };
  window.dispatchEvent(new CustomEvent(IMPORT_EVENT, { detail: result }));
  return result;
}

/** True for a file that holds an Excalidraw drawing (by name or type). */
export function isExcalidrawFile(file: File): boolean {
  return /\.excalidraw(\.json)?$/i.test(file.name) || file.type === "application/vnd.excalidraw+json";
}

/** Reads and imports a .excalidraw file. Throws with a readable message if
    it isn't one. */
export async function importExcalidrawFile(editor: Editor, file: File, point?: VecLike): Promise<ImportResult> {
  const data = parseExcalidraw(await file.text());
  if (!data) throw new Error(`"${file.name}" is not an Excalidraw drawing`);
  return importExcalidraw(editor, data, "file", point);
}

/** Pastes of Excalidraw content and drops of .excalidraw files go through
    our import instead of tldraw's own converter (which loses fonts, sizes,
    exact colours and pictures). Other files go to tldraw's handler as
    before. */
export function ourExcalidrawImport(editor: Editor) {
  editor.registerExternalContentHandler("excalidraw", async ({ content, point }) => {
    const data = parseExcalidraw(content);
    if (data) await importExcalidraw(editor, data, "paste", point);
  });
  // tldraw's own files handler (internal, kept to hand other files back to).
  const handlers = (editor as unknown as { externalContentHandlers: Record<string, ((c: unknown) => Promise<void>) | null> }).externalContentHandlers;
  const tldrawFiles = handlers.files;
  editor.registerExternalContentHandler("files", async (content) => {
    const ours = content.files.filter(isExcalidrawFile);
    const rest = content.files.filter((f) => !isExcalidrawFile(f));
    for (const f of ours) {
      try {
        await importExcalidrawFile(editor, f, content.point);
      } catch (err) {
        window.dispatchEvent(new CustomEvent(IMPORT_EVENT, { detail: { source: "file", count: 0, notConverted: [(err as Error).message] } }));
      }
    }
    if (rest.length > 0 && tldrawFiles) await tldrawFiles({ ...content, files: rest });
  });
}

