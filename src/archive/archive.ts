import { PageRecordType, type Editor, type TLAsset, type TLContent, type TLShape, type TLShapePartial } from "tldraw";

import { readWhiteboardBoard, writeWhiteboardBoard } from "../boards/boardkit";
import { BOARD_TYPE } from "../boards/BoardShape";
import { CARD_TYPE } from "../cards/CardShape";
import { registryChanged } from "../boards/registry";
import { linkedMaps, readWhiteboardMap, writeWhiteboardMap } from "../maps/linkkit";
import { mapListChanged } from "../maps/mapList";
import { MAP_TYPE } from "../maps/MapShape";
import { SLATE_TYPE } from "../slate/SlateShape";
import { placingLive } from "../widgets/copies";
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, archiveFileName, archiveName, archivePageName, archiveProblem, frozenMark, type ArchiveFile, type Frozen, type SlateBundle } from "./format";
import { getBundle, newBundleKey, putBundle } from "./store";

// GT-10: "Save board to file" and "Open board file…" (format.ts says what
// the file holds and why). Saving reads each widget's data as it is now;
// opening writes frozen copies (Boardkit and Linkkit list them as
// "Name (archive d/m)") and the Slate bundles (store.ts), then adds the page.

const NOTES_KEY = "ck:notes:v1";
const SCHEDULE_URL = "/calendar/data/schedule.json";
const ODDS_URL = "/calendar/api/odds";

export const frozenOf = (s: TLShape): Frozen | undefined => frozenMark(s.meta);

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/** Every picture inside the file (data: addresses): the page's own store and web pictures alike, so the file stands alone. */
async function inlinePictures(editor: Editor, assets: readonly TLAsset[]): Promise<TLAsset[]> {
  return Promise.all(
    assets.map(async (a) => {
      const src = (a.props as { src?: string | null }).src;
      if (!src || src.startsWith("data:")) return a;
      try {
        const url = /^https?:/.test(src) ? src : ((await editor.resolveAssetUrl(a.id, { shouldResolveToOriginal: true })) ?? src);
        const blob = await (await fetch(url)).blob();
        return { ...a, props: { ...a.props, src: await blobToDataUrl(blob) } } as TLAsset;
      } catch {
        return a; // a web picture that can't be read here keeps its address
      }
    }),
  );
}

type RawSchedule = { leagueSchedule?: { gameDates?: { games?: { gameId: string; gameDateEst?: string }[] }[] } };
/** The game ids of `dates` in a schedule snapshot. */
function gameIdsOn(schedule: unknown, dates: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>();
  for (const d of (schedule as RawSchedule)?.leagueSchedule?.gameDates ?? []) for (const g of d.games ?? []) if (dates.has(String(g.gameDateEst).slice(0, 10))) ids.add(g.gameId);
  return ids;
}

/** The live Slates' bundle: the schedule served now, each shown night's odds (with ESPN's finals) and notes. */
async function liveBundle(dates: ReadonlySet<string>): Promise<SlateBundle> {
  const schedule = (await (await fetch(SCHEDULE_URL)).json()) as unknown;
  const odds: Record<string, unknown> = {};
  await Promise.all(
    [...dates].map(async (date) => {
      try {
        const r = await fetch(`${ODDS_URL}?date=${date}`);
        if (r.ok) odds[date] = await r.json();
      } catch {
        // no odds that night: the frozen cards keep their empty odds column
      }
    }),
  );
  let all: Record<string, unknown> = {};
  try {
    all = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "{}") as Record<string, unknown>;
  } catch {
    all = {};
  }
  const ids = gameIdsOn(schedule, dates);
  const notes = Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)));
  return { schedule, odds, notes };
}

/** The current page as an archive file (format.ts). */
export async function archiveOfPage(editor: Editor, now = new Date()): Promise<ArchiveFile> {
  const savedAt = now.toISOString();
  const page = editor.getCurrentPage();
  const ids = [...editor.getCurrentPageShapeIds()];
  const content: TLContent = editor.getContentFromCurrentPage(ids) ?? { shapes: [], bindings: [], assets: [], rootShapeIds: [], schema: editor.store.schema.serialize() };
  const boards: Record<string, { name: string; board: unknown }> = {};
  const maps: Record<string, unknown> = {};
  const slates: Record<string, SlateBundle> = {};
  const links = linkedMaps();
  const liveDates = new Set<string>();
  const frozenAt = (s: TLShape, f: Omit<Frozen, "savedAt">) => ({ ...s, meta: { ...s.meta, frozen: { savedAt, ...f } } }) as TLShape;
  const keepMap = (id: string) => {
    if (maps[id]) return true;
    const m = readWhiteboardMap(id);
    if (m) maps[id] = m;
    return !!m;
  };
  const shapes: TLShape[] = [];
  for (const s of content.shapes) {
    // A card's object only mirrors what its board draws: made again there.
    if (s.type === CARD_TYPE) continue;
    const was = frozenOf(s);
    if (s.type === BOARD_TYPE) {
      const id = (s.props as { boardId: string }).boardId;
      const rec = boards[id] ? null : readWhiteboardBoard(id as never);
      if (rec) boards[id] = { name: rec.name, board: rec.board };
      if (links[id]) keepMap(links[id]);
      shapes.push(boards[id] ? frozenAt(s, { kind: "board", liveId: was?.liveId ?? id }) : s);
    } else if (s.type === MAP_TYPE) {
      const id = (s.props as { mapId: string }).mapId;
      shapes.push(keepMap(id) ? frozenAt(s, { kind: "map", liveId: was?.liveId ?? id }) : s);
    } else if (s.type === SLATE_TYPE) {
      if (was?.bundle) {
        const b = slates[was.bundle] ?? (await getBundle(was.bundle));
        if (b) {
          slates[was.bundle] = b;
          shapes.push(frozenAt(s, { kind: "slate", bundle: was.bundle }));
          continue;
        }
      }
      liveDates.add((s.props as { date: string }).date);
      shapes.push(frozenAt(s, { kind: "slate", bundle: "live" }));
    } else shapes.push(s);
  }
  if (liveDates.size) slates.live = await liveBundle(liveDates);
  const assets = await inlinePictures(editor, content.assets);
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    savedAt,
    site: location.origin,
    page: page.name,
    content: { ...content, shapes, assets } as ArchiveFile["content"],
    boards,
    maps,
    slates,
  };
}

/** Saves the current page to a file (a download: the browser asks where, or puts it in Downloads). Returns its name. */
export async function saveBoardToFile(editor: Editor): Promise<string> {
  const file = await archiveOfPage(editor);
  const name = archiveFileName(file.page, file.savedAt);
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.dataset.testid = "archive-download";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return name;
}

/** A new Linkkit map id (its own shape: 10 characters of nanoid's alphabet). */
function newMapId(): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => abc[n & 63]).join("");
}

/**
 * Opens an archive file as a new page, selected and shown: its widgets
 * frozen copies (never the live boards, maps or schedule). Throws with a
 * plain message when the file can't be opened.
 */
export async function openBoardFile(editor: Editor, text: string): Promise<string> {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("This is not a board file saved by the gauntlet.");
  }
  const problem = archiveProblem(file);
  if (problem) throw new Error(problem);
  const a = file as ArchiveFile;

  // Frozen copies of the boards, then of the maps (a linked map follows its board's copy).
  const boardIds: Record<string, string> = {};
  for (const [id, { name, board }] of Object.entries(a.boards)) {
    const copy = writeWhiteboardBoard(archiveName(name, a.savedAt), board as never);
    if (!copy) throw new Error("Boardkit couldn't store this file's boards (the browser's storage may be full).");
    boardIds[id] = copy;
  }
  if (Object.keys(boardIds).length) registryChanged();
  const mapIds: Record<string, string> = {};
  for (const [id, raw] of Object.entries(a.maps)) {
    const m = raw as { name: string; linkedBoard?: string; nodes: Record<string, { name: string }> };
    const linked = m.linkedBoard ? boardIds[m.linkedBoard] : undefined;
    const boardName = m.linkedBoard ? a.boards[m.linkedBoard]?.name : undefined;
    // A linked tree's top box is its board's name (Linkkit's copy rule): the copy's is the board copy's.
    const root = m.linkedBoard && m.nodes[m.linkedBoard] ? m.linkedBoard : undefined;
    const nodes = linked && boardName && root ? { ...m.nodes, [root]: { ...m.nodes[root], name: archiveName(boardName, a.savedAt) } } : m.nodes;
    const copy = { ...m, id: newMapId(), name: linked && boardName ? archiveName(boardName, a.savedAt) : archiveName(m.name, a.savedAt), nodes, linkedBoard: linked };
    if (!writeWhiteboardMap(copy as never)) throw new Error("Linkkit couldn't store this file's maps (the browser's storage may be full).");
    mapIds[id] = copy.id;
  }
  if (Object.keys(mapIds).length) mapListChanged();
  const bundleKeys: Record<string, string> = {};
  for (const [key, bundle] of Object.entries(a.slates)) {
    bundleKeys[key] = newBundleKey();
    await putBundle(bundleKeys[key], bundle);
  }

  const shapes = (a.content.shapes as TLShape[]).map((s) => {
    const f = frozenOf(s);
    if (!f) return s;
    if (s.type === BOARD_TYPE && boardIds[(s.props as { boardId: string }).boardId]) return { ...s, props: { ...s.props, boardId: boardIds[(s.props as { boardId: string }).boardId] } } as TLShape;
    if (s.type === MAP_TYPE && mapIds[(s.props as { mapId: string }).mapId]) return { ...s, props: { ...s.props, mapId: mapIds[(s.props as { mapId: string }).mapId] } } as TLShape;
    if (s.type === SLATE_TYPE && f.bundle && bundleKeys[f.bundle]) return { ...s, meta: { ...s.meta, frozen: { ...f, bundle: bundleKeys[f.bundle] } } } as TLShape;
    return s;
  });

  const pageId = PageRecordType.createId();
  editor.run(() => {
    editor.createPage({ id: pageId, name: archivePageName(a.page) });
    editor.setCurrentPage(pageId);
    if (shapes.length) placingLive(() => editor.putContentOntoCurrentPage({ ...(a.content as unknown as TLContent), shapes }, { preservePosition: true, select: false }));
  });
  editor.zoomToFit({ animation: { duration: 0 } });
  return pageId;
}

/**
 * "Go live" on a frozen widget: it shows the live board, map or schedule
 * again (one undo step puts the frozen copy back). False when the live
 * board or map no longer exists.
 */
export function goLive(editor: Editor, id: TLShape["id"]): boolean {
  const s = editor.getShape(id);
  const f = s && frozenOf(s);
  if (!s || !f) return false;
  // tldraw merges a shape's meta on update: a key left out stays; null clears it
  const meta = { ...s.meta, frozen: null };
  let props: Record<string, unknown> | undefined;
  if (f.kind === "board") {
    if (!f.liveId || !readWhiteboardBoard(f.liveId as never)) return false;
    props = { boardId: f.liveId };
  } else if (f.kind === "map") {
    if (!f.liveId || !readWhiteboardMap(f.liveId)) return false;
    props = { mapId: f.liveId };
  }
  editor.markHistoryStoppingPoint("go live");
  editor.updateShape({ id, type: s.type, meta, ...(props ? { props } : {}) } as TLShapePartial);
  return true;
}

/** Whether "Go live" can work: the live board or map is still there (a Slate always can). */
export function canGoLive(s: TLShape): boolean {
  const f = frozenOf(s);
  if (!f) return false;
  if (f.kind === "board") return !!f.liveId && !!readWhiteboardBoard(f.liveId as never);
  if (f.kind === "map") return !!f.liveId && !!readWhiteboardMap(f.liveId);
  return true;
}
