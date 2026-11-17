import * as React from "react";
import * as ReactDOM from "react-dom";
import * as jsxRuntime from "react/jsx-runtime";

import type * as Pinned from "./calendarkit";
import { manifestKey, SLATEKIT_API, usableManifest, type Manifest } from "./manifest";
import "./calendarkit.css";

// GT-5: calendarkit's Slate, loaded at run time. The Slate widget draws its
// cards with calendarkit's own code. That code now comes from calendarkit's
// site (/calendar/slatekit/, its manifest naming the files and the kit's API
// version), so a new card design there reaches the whiteboard with
// calendarkit's deploy, with no new pin here; and while the whiteboard is
// open, a newer kit is picked up (checked every few minutes and when the tab
// comes back) and the widgets redraw with it. The kit uses this page's React
// (`globalThis.__calendarkitHost`): its cards are part of the whiteboard's
// own React tree.
//
// The pinned copy (package.json, ./calendarkit.ts) stays as the fallback:
// no manifest, a kit of another API version, or a failed load, and the
// widget draws with the pinned copy as before. Either way a page without a
// Slate loads none of it.
//
// The kit's stylesheet goes FIRST in <head>, before the whiteboard's, so the
// whiteboard's own overrides (./calendarkit.css) win as they always did.

export { SLATEKIT_API } from "./manifest";
export const MANIFEST_URL = "/calendar/slatekit/manifest.json";
/** How often an open whiteboard looks for a newer kit and a newer schedule (calendarkit's SCHEDULE_CHECK_MS). */
export const KIT_CHECK_MS = 5 * 60_000;

export type KitModule = typeof Pinned;
export interface Kit extends KitModule {
  /** "live": calendarkit's current kit from its site; "pinned": this build's own copy. */
  readonly kitSource: "live" | "pinned";
  /** The kit's calendarkit version ("1.76.0"), or "pinned". */
  readonly kitVersion: string;
  /** What identifies this kit: a different one means the widgets draw again from scratch. */
  readonly kitKey: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __calendarkitHost: { react: typeof React; reactDom: typeof ReactDOM; jsxRuntime: typeof jsxRuntime; api: number } | undefined;
}

let current: Kit | null = null;
let loading: Promise<Kit> | null = null;
const subs = new Set<() => void>();
const set = (k: Kit) => {
  current = k;
  subs.forEach((f) => f());
};

export const getKit = () => current;
export function subscribeKit(fn: () => void) {
  subs.add(fn);
  return () => void subs.delete(fn);
}

/** The manifest when it is one this code can use, else null. */
async function readManifest(): Promise<Manifest | null> {
  try {
    const r = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (!r.ok) return null;
    return usableManifest(await r.json());
  } catch {
    return null;
  }
}

const keyOf = manifestKey;

/** A stylesheet first in <head>; resolves once it has loaded (or failed: the cards then have no styles, as offline). */
function firstStyle(make: () => HTMLLinkElement | HTMLStyleElement): Promise<HTMLElement> {
  const el = make();
  el.dataset.slatekit = "";
  return new Promise((resolve) => {
    if (el instanceof HTMLLinkElement) {
      el.onload = el.onerror = () => resolve(el);
      document.head.prepend(el);
    } else {
      document.head.prepend(el);
      resolve(el);
    }
  });
}
let style: HTMLElement | null = null;
const swapStyle = (next: HTMLElement) => {
  style?.remove();
  style = next;
};

async function loadLive(m: Manifest): Promise<Kit> {
  globalThis.__calendarkitHost = { react: React, reactDom: ReactDOM, jsxRuntime, api: SLATEKIT_API };
  const mod = (await import(/* @vite-ignore */ m.js)) as KitModule & { SLATEKIT_API?: number };
  if (mod.SLATEKIT_API !== SLATEKIT_API || typeof mod.SlateCopy !== "function") throw new Error("slatekit: not the expected kit");
  const css = m.css;
  if (css)
    swapStyle(
      await firstStyle(() => {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = css;
        return l;
      }),
    );
  return { ...mod, kitSource: "live", kitVersion: m.version, kitKey: keyOf(m) };
}

async function loadPinned(): Promise<Kit> {
  const [mod, css] = await Promise.all([import("./calendarkit"), import("./calendarkitCss")]);
  swapStyle(
    await firstStyle(() => {
      const s = document.createElement("style");
      s.textContent = css.default;
      return s;
    }),
  );
  return { ...mod, kitSource: "pinned", kitVersion: "pinned", kitKey: "pinned" };
}

/** The kit, loaded once per page: calendarkit's current one, else the pinned copy. */
export function kitReady(): Promise<Kit> {
  if (current) return Promise.resolve(current);
  loading ??= (async () => {
    const m = await readManifest();
    let k: Kit;
    try {
      if (!m) throw new Error("slatekit: no usable manifest");
      k = await loadLive(m);
    } catch (error) {
      if (m) console.warn("Gauntlet: calendarkit's Slate kit didn't load; using the pinned copy", error);
      k = await loadPinned();
    }
    set(k);
    return k;
  })();
  return loading;
}

/** Looks for a newer kit now: a different one is loaded and the widgets redraw with it. A failure keeps the one shown. */
export async function checkKit(): Promise<void> {
  const k = current;
  if (!k) return;
  const m = await readManifest();
  if (!m || keyOf(m) === k.kitKey) return;
  try {
    set(await loadLive(m));
  } catch (error) {
    console.warn("Gauntlet: a newer Slate kit didn't load; keeping the one shown", error);
  }
}
