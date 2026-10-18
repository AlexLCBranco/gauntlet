/**
 * The stone protocol (both apps' `domain/embed.ts`, gauntlet phase 3).
 * Frame → canvas: stone:ready, stone:status, stone:scroll, stone:flushed.
 * Canvas → frame: stone:flush, stone:scroll-to.
 */
import type { App } from "./layout";

export type Status = "ok" | "missing" | "deleted";

export type FromFrame =
  | { type: "stone:ready" | "stone:status"; app: App; id: string; status: Status }
  | { type: "stone:scroll"; app: App; id: string; x: number; y: number }
  | { type: "stone:flushed"; app: App; id: string; busy: boolean };

export type ToFrame = { type: "stone:flush" } | { type: "stone:scroll-to"; x: number; y: number };

const isApp = (v: unknown): v is App => v === "boardkit" || v === "linkkit";
const isStatus = (v: unknown): v is Status => v === "ok" || v === "missing" || v === "deleted";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A frame's message, or null for anything else. */
export function parseFromFrame(data: unknown): FromFrame | null {
  const m = data as Record<string, unknown> | null;
  if (!m || typeof m !== "object" || !isApp(m.app) || typeof m.id !== "string") return null;
  switch (m.type) {
    case "stone:ready":
    case "stone:status":
      return isStatus(m.status) ? { type: m.type, app: m.app, id: m.id, status: m.status } : null;
    case "stone:scroll":
      return isNum(m.x) && isNum(m.y) ? { type: m.type, app: m.app, id: m.id, x: m.x, y: m.y } : null;
    case "stone:flushed":
      return typeof m.busy === "boolean" ? { type: m.type, app: m.app, id: m.id, busy: m.busy } : null;
    default:
      return null;
  }
}

/** The address of a stone's frame. */
export const frameUrl = (app: App, itemId: string) => `/${app}/?embed=1&id=${encodeURIComponent(itemId)}`;
