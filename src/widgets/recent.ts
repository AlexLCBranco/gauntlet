// The widget picker's "most recently used first" (WidgetPicker.tsx): the
// last 30 widgets placed, newest first, kept in this browser (so backups
// carry it).

export type WidgetKey = string;
const KEY = "gauntlet:widget-recent";
const MAX = 30;

function read(): WidgetKey[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** `key` was just placed. */
export function useWidget(key: WidgetKey): void {
  const next = [key, ...read().filter((k) => k !== key)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full: the order just isn't remembered.
  }
}

/** Each recently used widget's place (0 = the newest). */
export function recentRank(): Map<WidgetKey, number> {
  return new Map(read().map((k, i) => [k, i]));
}
