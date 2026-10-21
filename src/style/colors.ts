// Fixed and custom colours: exact colours kept in a shape's `meta` as hex
// (`strokeHex`, `fillHex`, `textHex`), drawn the same in dark and light mode
// (tldraw's own colours change with the mode: its "black" is white in dark
// mode). tldraw's own colours keep working as before; a shape without these
// keys looks exactly as tldraw draws it. Pure, no tldraw; tested in
// colors.test.ts.

/** The dark colours tldraw lacks, after Excalidraw's darkest shades. */
export const FIXED_COLORS: readonly { id: string; label: string; hex: string }[] = [
  { id: "true-black", label: "Black", hex: "#000000" },
  { id: "dark-grey", label: "Dark grey", hex: "#343a40" },
  { id: "dark-red", label: "Dark red", hex: "#8a1c1c" },
  { id: "brown", label: "Brown", hex: "#7a3e0e" },
  { id: "olive", label: "Olive", hex: "#5f5a0a" },
  { id: "dark-green", label: "Dark green", hex: "#1b5e20" },
  { id: "dark-blue", label: "Dark blue", hex: "#0b2a6f" },
  { id: "dark-purple", label: "Dark purple", hex: "#4a1d7a" },
];

export type ColorKey = "strokeHex" | "fillHex" | "textHex";

/** "#abc", "abc", "#AABBCC" -> "#aabbcc"; anything else -> null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let v = value.trim().toLowerCase();
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/** The exact colour a shape's meta holds under `key`, or null. */
export function metaHex(meta: Record<string, unknown> | undefined, key: ColorKey): string | null {
  return normalizeHex(meta?.[key]);
}

/** A hex colour at an opacity (0-1), as #rrggbbaa. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${hex}${a.toString(16).padStart(2, "0")}`;
}

/** The recent custom colours after using `hex`: newest first, no repeats,
    at most `max`. */
export function pushRecent(recent: readonly string[], hex: string, max = 5): string[] {
  const h = normalizeHex(hex);
  const clean = recent.map(normalizeHex).filter((c): c is string => c !== null);
  if (!h) return clean.slice(0, max);
  return [h, ...clean.filter((c) => c !== h)].slice(0, max);
}

// Colour area maths (hue 0-360, saturation and value 0-1).

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const n = normalizeHex(hex) ?? "#000000";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}
