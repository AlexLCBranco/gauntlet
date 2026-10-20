/**
 * What can go on the canvas: every Boardkit board and every Linkkit map,
 * read straight from the apps' own storage (same origin). Read only: the
 * canvas never writes an app's keys.
 */
import type { App } from "./layout";

export type Source = { app: App; id: string; name: string; linked: boolean };

type Get = (key: string) => string | null;

const parse = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const entries = (list: unknown): { id: string; name: string }[] =>
  Array.isArray(list)
    ? list
        .filter((e): e is { id: string; name?: unknown } => typeof e?.id === "string")
        .map((e) => ({ id: e.id, name: typeof e.name === "string" && e.name.trim() ? e.name : "Untitled" }))
    : [];

/** Boardkit's boards (`boardkit:registry`), in its order. */
export const boards = (get: Get): Source[] =>
  entries((parse(get("boardkit:registry")) as { boards?: unknown })?.boards).map((b) => ({ app: "boardkit", ...b, linked: false }));

/** Linkkit's maps (`linkkit:registry`), all of them; `linked` when the map's
    record names a Boardkit board (`map.linkedBoard`). A linked map is named
    after its board, and a board renamed in Boardkit is renamed only in
    Boardkit's list: Linkkit's own list keeps the old name until the map is
    next edited there. So a linked map takes its board's name from
    `boardkit:registry`, as Linkkit shows it. */
export const maps = (get: Get): Source[] => {
  // Only real names: a blank one leaves Linkkit's.
  const listed = (parse(get("boardkit:registry")) as { boards?: unknown })?.boards;
  const boardNames = new Map(
    (Array.isArray(listed) ? listed : [])
      .filter((b): b is { id: string; name: string } => typeof b?.id === "string" && typeof b.name === "string" && b.name.trim() !== "")
      .map((b) => [b.id, b.name]),
  );
  return entries((parse(get("linkkit:registry")) as { maps?: unknown })?.maps).map((m) => {
    const record = parse(get(`linkkit:map:${m.id}`)) as { map?: { linkedBoard?: unknown } } | null;
    const board = record?.map?.linkedBoard;
    if (typeof board !== "string") return { app: "linkkit", ...m, linked: false };
    return { app: "linkkit", ...m, name: boardNames.get(board) ?? m.name, linked: true };
  });
};

export const sources = (get: Get): Source[] => [...boards(get), ...maps(get)];

/** True for a storage key whose change can alter `sources`. */
export const affectsSources = (key: string | null) =>
  key === null || key === "boardkit:registry" || key === "linkkit:registry" || key.startsWith("linkkit:map:");
