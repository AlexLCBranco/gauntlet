// Pure, no DOM; tested in manifest.test.ts. GT-5: which Slate kit manifest
// (calendarkit's /calendar/slatekit/manifest.json) the whiteboard may use.

/** The kit API this code is written for (calendarkit's src/slate/kit.ts). */
export const SLATEKIT_API = 1;

export interface Manifest {
  api: number;
  version: string;
  js: string;
  css: string | null;
}

/** calendarkit's own files only: same site, under /calendar/, no other host (code is run from here). */
const ours = (u: unknown): u is string => typeof u === "string" && /^\/calendar\/[\w./-]+(\?[\w=&.-]*)?$/.test(u) && !u.includes("..");

/** The manifest when this code can use it (its API, calendarkit's own files), else null. */
export function usableManifest(m: unknown): Manifest | null {
  if (!m || typeof m !== "object") return null;
  const { api, version, js, css } = m as Record<string, unknown>;
  if (api !== SLATEKIT_API || !ours(js)) return null;
  if (css != null && !ours(css)) return null;
  return { api, version: typeof version === "string" ? version : "?", js, css: (css as string | null | undefined) ?? null };
}

/** What identifies a kit: a different one means the widgets draw again. */
export const manifestKey = (m: Manifest) => `${m.js} ${m.css ?? ""}`;
