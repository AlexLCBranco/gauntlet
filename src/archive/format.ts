// Pure, no DOM, no tldraw; tested in format.test.ts.
//
// GT-10 (owner, 2026-11-16 / 17): a board kept as a file. "Save board to
// file" writes the CURRENT PAGE (one page = one day's board, owner's choice)
// to one JSON file: the page's tldraw content, every picture inside it, and
// a frozen copy of every widget's data at save time, so opening it later
// never pulls today's data:
// - a board widget: its Boardkit board (and the Linkkit map linked to it);
// - a map widget: its Linkkit map;
// - a Slate: the schedule snapshot it was drawn from, that night's odds and
//   ESPN finals, and the night's notes (one bundle per snapshot);
// - a web embed: its link (it is in the shape already).
// "Open board file…" adds it as a NEW PAGE; its widgets are frozen copies
// (Boardkit and Linkkit list theirs as "Name (archive d/m)"), edited there
// only; a widget's "Go live" points it back at the live data.

export const ARCHIVE_FORMAT = "gauntlet-archive";
export const ARCHIVE_VERSION = 1;

/** On a frozen widget (shape meta `frozen`): where its data came from. */
export interface Frozen {
  /** The widget's kind. */
  readonly kind: "board" | "map" | "slate";
  /** When the file was saved (ISO). */
  readonly savedAt: string;
  /** Board and map: the live board's or map's id at save time, for "Go live". */
  readonly liveId?: string;
  /** Slate: its bundle (archive store key: schedule, odds, notes). */
  readonly bundle?: string;
}

/** A Slate bundle: what a frozen Slate draws from. */
export interface SlateBundle {
  /** calendarkit's schedule snapshot as served (schedule.json). */
  readonly schedule: unknown;
  /** The odds answer (odds and finals) of each night shown, by date. */
  readonly odds: Readonly<Record<string, unknown>>;
  /** calendarkit's notes (`ck:notes:v1`) of those nights' games, by game id. */
  readonly notes: Readonly<Record<string, unknown>>;
}

export interface ArchiveFile {
  readonly format: typeof ARCHIVE_FORMAT;
  readonly version: typeof ARCHIVE_VERSION;
  /** When it was saved (ISO). */
  readonly savedAt: string;
  /** The address it was saved on. */
  readonly site: string;
  /** The page's name. */
  readonly page: string;
  /** tldraw content of the page (shapes, bindings, assets; every picture as a data: address). */
  readonly content: { readonly shapes: readonly unknown[]; readonly bindings?: readonly unknown[]; readonly assets: readonly unknown[]; readonly rootShapeIds: readonly string[]; readonly schema: unknown };
  /** Boardkit boards by the id the shapes name: their name and BoardState. */
  readonly boards: Readonly<Record<string, { readonly name: string; readonly board: unknown }>>;
  /** Linkkit maps by the id the shapes (or a board) name. */
  readonly maps: Readonly<Record<string, unknown>>;
  /** Slate bundles by key (a frozen Slate's `bundle`, "live" for Slates live at save time). */
  readonly slates: Readonly<Record<string, SlateBundle>>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Why a file is not an archive this code can open, or null when it is. */
export function archiveProblem(v: unknown): string | null {
  if (!isObj(v) || v.format !== ARCHIVE_FORMAT) return "This is not a board file saved by the gauntlet.";
  if (v.version !== ARCHIVE_VERSION) return "This board file was saved by a newer gauntlet.";
  const c = v.content;
  if (!isObj(c) || !Array.isArray(c.shapes) || !Array.isArray(c.assets) || !Array.isArray(c.rootShapeIds) || !isObj(c.schema)) return "This board file is damaged (no page content).";
  if (!isObj(v.boards) || !isObj(v.maps) || !isObj(v.slates)) return "This board file is damaged (no widget data).";
  for (const b of Object.values(v.boards)) if (!isObj(b) || typeof b.name !== "string" || !isObj(b.board)) return "This board file is damaged (a board).";
  for (const s of Object.values(v.slates)) if (!isObj(s) || !isObj(s.schedule) || !isObj(s.odds) || !isObj(s.notes)) return "This board file is damaged (a Slate).";
  return null;
}

/** "4/11": a date as the owner writes it (day/month), in the owner's zone. */
export function dayMonth(iso: string, timeZone = "America/Sao_Paulo"): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "numeric" }).formatToParts(Date.parse(iso));
  return `${Number(parts.find((p) => p.type === "day")!.value)}/${Number(parts.find((p) => p.type === "month")!.value)}`;
}

/** The name of a frozen copy in Boardkit or Linkkit: "Daily (archive 4/11)". */
export const archiveName = (name: string, savedAt: string) => `${name.replace(/ \(archive \d+\/\d+\)$/, "")} (archive ${dayMonth(savedAt)})`;

/** The name of the page an archive opens as: "Board 4/11 (archive)". */
export const archivePageName = (page: string) => `${page.replace(/ \(archive\)$/, "")} (archive)`;

/** The file's name: "gauntlet-board-Page 1-2026-11-17.json", safe on Windows. */
export function archiveFileName(page: string, savedAt: string, timeZone = "America/Sao_Paulo"): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.parse(savedAt));
  // Windows' forbidden characters and control characters become "-"
  const cleaned = [...page].map((c) => (c < " " || '\\/:*?"<>|'.includes(c) ? "-" : c)).join("");
  const safe = cleaned.replace(/\s+/g, " ").trim().slice(0, 60) || "board";
  return `gauntlet-board-${safe}-${day}.json`;
}

/** A shape's frozen mark (meta `frozen`), or undefined: a live widget. */
export function frozenMark(meta: unknown): Frozen | undefined {
  const f = (meta as { frozen?: Frozen | null } | undefined)?.frozen;
  return f && typeof f === "object" && typeof f.kind === "string" ? f : undefined;
}
