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

// Excalidraw's dark mode. Excalidraw keeps the light-mode colours in its
// files and, in dark mode, draws each element's colour through
// "invert(93%) hue-rotate(180deg)" (pictures untouched). Ported exactly
// from Excalidraw's own applyDarkModeFilter (packages/common/src/colors.ts:
// cssInvert, then cssHueRotate's matrix, each step rounded as there), so an
// imported drawing looks in dark mode as it did in Excalidraw's.

const EXCALIDRAW_INVERT = 0.93;

function excalidrawHueRotate(red: number, green: number, blue: number, degrees: number): [number, number, number] {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ];
  const out = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
  return [out(r * m[0] + g * m[1] + b * m[2]), out(r * m[3] + g * m[4] + b * m[5]), out(r * m[6] + g * m[7] + b * m[8])];
}

/** The colour Excalidraw's dark mode draws for a stored (light-mode)
    "#rrggbb". */
export function excalidrawDark(hex: string): string {
  const n = normalizeHex(hex) ?? "#000000";
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(n.slice(i, i + 2), 16);
    return Math.round(Math.max(0, Math.min(255, v * (1 - EXCALIDRAW_INVERT) + (255 - v) * EXCALIDRAW_INVERT)));
  });
  return `#${excalidrawHueRotate(r, g, b, 180).map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** The colour a shape's meta holds under `key`, as drawn in `mode`. A
    colour that came from an Excalidraw import (the shape has
    `excalidrawId` and the key isn't in `ownHex`, the colours picked here
    since) follows Excalidraw's dark mode; every other exact colour is the
    same in both modes. */
export function shownHex(meta: Record<string, unknown> | undefined, key: ColorKey, mode: "dark" | "light"): string | null {
  const hex = metaHex(meta, key);
  if (!hex || mode !== "dark" || !meta?.excalidrawId) return hex;
  const own = Array.isArray(meta.ownHex) ? meta.ownHex : [];
  return own.includes(key) ? hex : excalidrawDark(hex);
}
