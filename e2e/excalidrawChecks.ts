import { expect, type Page } from "./test";

/**
 * Checks shared by excalidraw.e2e.ts (a made-up drawing) and
 * realexcalidraw.e2e.ts (the owner's): that what an Excalidraw paste or
 * import put on the whiteboard matches the Excalidraw elements it came
 * from. Read from the page (`window.editor` and the drawn DOM), never
 * changed.
 */

export type ExcElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontFamily?: number;
  containerId?: string | null;
  frameId?: string | null;
  groupIds?: string[];
  isDeleted?: boolean;
  textAlign?: string;
  fileId?: string;
};

export type Imported = {
  id: string;
  type: string;
  meta: Record<string, any>;
  props: Record<string, any>;
  rotation: number;
  /** The shape's bounds on the page (rotation included), and its origin. */
  page: { x: number; y: number; w: number; h: number; ox: number; oy: number };
};

export async function openWhiteboard(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Every imported shape (one with an Excalidraw id) on the current page. */
export const imported = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).editor;
    return e
      .getCurrentPageShapes()
      .filter((s: any) => s.meta.excalidrawId)
      .map((s: any) => {
        const b = e.getShapePageBounds(s.id);
        const o = e.getShapePageTransform(s.id).applyToPoint({ x: 0, y: 0 });
        return { id: s.id, type: s.type, meta: s.meta, props: s.props, rotation: s.rotation, page: { x: b.x, y: b.y, w: b.w, h: b.h, ox: o.x, oy: o.y } };
      });
  }) as Promise<Imported[]>;

const hex = (c?: string) => {
  if (!c || c === "transparent") return undefined;
  let v = c.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v;
};
const FONT = (f?: number) => (f === 1 || f === 5 ? "tldraw_draw" : f === 3 || f === 8 ? "tldraw_mono" : "tldraw_sans");
const channels = (c: string) => (c.startsWith("#") ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number));
/** Two colours ("#rrggbb" or "rgb(...)") within a few units per channel. */
export const near = (a: string | null | undefined, b: string, tol = 3) => !!a && channels(a).length === 3 && channels(a).every((v, i) => Math.abs(v - channels(b)[i]) <= tol);

/** What Excalidraw's dark mode draws for each stored colour: the stored
    colour through the browser's own "invert(93%) hue-rotate(180deg)"
    (Excalidraw's DARK_THEME_FILTER), read back from a canvas. Independent
    of the app's own port of it. */
export const excalidrawDarkInBrowser = (page: Page, colors: string[]) =>
  page.evaluate((colors) => {
    const out: Record<string, string> = {};
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    for (const col of colors) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.filter = "invert(93%) hue-rotate(180deg)";
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      out[col] = `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    }
    return out;
  }, colors);

/** What each shape looks like on screen: its fill and outline, its text's
    font, size and colour, whether that text sits inside the shape, and
    whether its picture has loaded. */
const drawn = (page: Page, ids: string[]) =>
  page.evaluate((ids) => {
    const out: Record<string, any> = {};
    for (const id of ids) {
      const el = document.querySelector(`[data-shape-id="${id}"]`) as HTMLElement | null;
      if (!el) {
        out[id] = null;
        continue;
      }
      const paths = [...el.querySelectorAll("path")];
      const text = el.querySelector(".tl-rich-text") as HTMLElement | null;
      const img = el.querySelector("img") as HTMLImageElement | null;
      const box = el.getBoundingClientRect();
      // The text's own lines (its spans), not its full-width wrapper.
      const range = document.createRange();
      if (text) range.selectNodeContents(text);
      const t = text ? range.getBoundingClientRect() : null;
      out[id] = {
        fills: paths.map((p) => p.getAttribute("fill")).filter((f) => f && f !== "none"),
        // A dashed or dotted outline sets its colour on the group round its paths.
        strokes: [...el.querySelectorAll("[stroke]")].map((p) => p.getAttribute("stroke")).filter((f) => f && f !== "none"),
        font: text ? getComputedStyle(text).fontFamily : null,
        fontSize: text ? parseFloat(getComputedStyle(text).fontSize) : null,
        color: text ? getComputedStyle(text).color : null,
        textInside: t ? t.left >= box.left - 1 && t.right <= box.right + 1 && t.top >= box.top - 1 && t.bottom <= box.bottom + 1 : null,
        loading: !!el.querySelector(".tl-image-container-loading"),
        picture: img ? img.complete && img.naturalWidth > 0 : null,
        // Any CSS filter between the picture and the canvas.
        filtered: (() => {
          for (let n: HTMLElement | null = img; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).filter !== "none") return true;
          return false;
        })(),
      };
    }
    return out;
  }, ids);

/** Checks every non-deleted Excalidraw element against what was imported. */
export async function checkImported(page: Page, elements: ExcElement[], shapes: Imported[], opts: { growTolerance?: number } = {}) {
  const live = elements.filter((e) => !e.isDeleted);
  const labels = new Map(live.filter((e) => e.type === "text" && e.containerId).map((e) => [e.containerId!, e]));
  const own = live.filter((e) => !(e.type === "text" && e.containerId && live.some((c) => c.id === e.containerId)));
  const byExc = new Map(shapes.map((s) => [s.meta.excalidrawId as string, s]));
  for (const e of own) expect(byExc.has(e.id), `${e.type} ${e.id} is on the whiteboard`).toBe(true);
  expect(shapes).toHaveLength(own.length);

  // Everything moved by the same amount (the landing place).
  const ref = own.find((e) => ["rectangle", "ellipse", "diamond", "image"].includes(e.type) && !e.angle && !e.frameId)!;
  const r = byExc.get(ref.id)!;
  const d = { x: r.page.x - ref.x, y: r.page.y - ref.y };

  await expect.poll(async () => Object.values(await drawn(page, shapes.filter((s) => s.type === "image").map((s) => s.id))).every((v) => v && !v.loading && v.picture), { message: "every picture has loaded", timeout: 10_000 }).toBe(true);
  const look = await drawn(page, shapes.map((s) => s.id));
  // In dark mode Excalidraw draws its stored colours through its dark
  // filter; the whiteboard does the same for imported colours.
  const dark = await page.evaluate(() => (window as any).editor.user.getIsDarkMode());
  const stored = [...new Set(live.flatMap((e) => [hex(e.strokeColor), hex(e.backgroundColor)]).filter((c): c is string => !!c))];
  const darkOf = dark ? await excalidrawDarkInBrowser(page, stored) : {};
  const shown = (c: string) => (dark ? darkOf[c] : c);

  for (const e of own) {
    const s = byExc.get(e.id)!;
    const name = `${e.type} ${e.id}`;
    const v = look[s.id];
    expect(v, `${name} is drawn`).not.toBeNull();
    const center = { x: e.x + e.width / 2 + d.x, y: e.y + e.height / 2 + d.y };
    if (["rectangle", "ellipse", "diamond", "image", "frame", "embeddable", "iframe"].includes(e.type)) {
      expect(s.page.x + s.page.w / 2, `${name} centre x`).toBeCloseTo(center.x, 0);
      expect(s.page.y + s.page.h / 2, `${name} centre y`).toBeCloseTo(center.y, 0);
      expect(s.props.w, `${name} width`).toBeCloseTo(e.width, 1);
      expect(s.props.h, `${name} height`).toBeCloseTo(e.height, 1);
      expect(s.rotation, `${name} rotation`).toBeCloseTo(e.angle ?? 0, 3);
    }
    if (e.type === "text") {
      const align = e.textAlign ?? "left";
      const left = s.page.ox;
      const want = align === "left" ? e.x + d.x : align === "right" ? e.x + e.width + d.x : e.x + e.width / 2 + d.x;
      const got = align === "left" ? left : align === "right" ? left + s.props.w : left + s.props.w / 2;
      if (!e.angle) {
        expect(got, `${name} ${align} edge`).toBeCloseTo(want, 0);
        expect(s.page.oy, `${name} top`).toBeCloseTo(e.y + d.y, 0);
      }
      expect(s.props.w, `${name} at least as wide as in Excalidraw`).toBeGreaterThanOrEqual(e.width - 0.5);
      expect(v.font, `${name} font`).toContain(FONT(e.fontFamily));
      expect(v.fontSize, `${name} font size`).toBeCloseTo(e.fontSize!, 1);
      if (hex(e.strokeColor)) expect(near(v.color, shown(hex(e.strokeColor)!)), `${name} colour ${v.color} vs ${shown(hex(e.strokeColor)!)}`).toBe(true);
    }
    if (["arrow", "line", "freedraw"].includes(e.type) && !e.angle) {
      expect(s.page.ox, `${name} x`).toBeCloseTo(e.x + d.x - (e.frameId ? 0 : 0), 0);
      expect(s.page.oy, `${name} y`).toBeCloseTo(e.y + d.y, 0);
    }
    // Colours: exactly Excalidraw's as drawn in this mode (a few units for rounding).
    if (["rectangle", "ellipse", "diamond"].includes(e.type)) {
      if (hex(e.strokeColor)) expect(v.strokes.some((c: string) => near(c, shown(hex(e.strokeColor)!))), `${name} outline ${v.strokes} vs ${shown(hex(e.strokeColor)!)}`).toBe(true);
      if (hex(e.backgroundColor)) expect(v.fills.some((c: string) => near(c, shown(hex(e.backgroundColor)!))), `${name} fill ${v.fills} vs ${shown(hex(e.backgroundColor)!)}`).toBe(true);
      else expect(v.fills, `${name} no fill`).toEqual([]);
      const t = labels.get(e.id);
      if (t) {
        expect(v.font, `${name} label font`).toContain(FONT(t.fontFamily));
        expect(v.fontSize, `${name} label font size`).toBeCloseTo(t.fontSize!, 1);
        if (hex(t.strokeColor)) expect(near(v.color, shown(hex(t.strokeColor)!)), `${name} label colour ${v.color} vs ${shown(hex(t.strokeColor)!)}`).toBe(true);
        expect(v.textInside, `${name}: its text sits inside it`).toBe(true);
        expect(s.props.growY ?? 0, `${name}: the box didn't have to grow for its text`).toBeLessThanOrEqual(opts.growTolerance ?? 0);
      }
    }
    if (e.type === "image") {
      expect(v.picture, `${name} shows its picture`).toBe(true);
      expect(v.filtered, `${name}: its picture is never recoloured`).toBe(false);
    }
  }
}

/** Excalidraw's dark mode (hand-test round item 1, owner 2026-10-21): in
    dark mode an imported white box is drawn as Excalidraw's dark mode draws
    it, its blue text stays blue, pictures are never recoloured; light mode
    shows the stored colours. Then checks every element in both modes, and
    leaves the whiteboard in dark mode. */
export async function checkBothModes(page: Page, elements: ExcElement[]) {
  const live = elements.filter((e) => !e.isDeleted);
  const white = live.find((e) => ["rectangle", "ellipse", "diamond"].includes(e.type) && hex(e.backgroundColor) === "#ffffff");
  const blue = live.find((e) => e.type === "text" && /^#1971c2$/i.test(e.strokeColor ?? ""));
  const shapes = await imported(page);
  const byExc = new Map(shapes.map((s) => [s.meta.excalidrawId as string, s]));
  const setMode = (mode: "dark" | "light") => page.evaluate((m) => (window as any).editor.user.updateUserPreferences({ colorScheme: m }), mode);

  await setMode("dark");
  const darkWhite = (await excalidrawDarkInBrowser(page, ["#ffffff"]))["#ffffff"];
  if (white) {
    const id = byExc.get(white.id)!.id;
    await expect.poll(async () => (await drawn(page, [id]))[id].fills, { message: "a white-filled box is drawn as Excalidraw's dark mode draws it" }).toEqual(expect.arrayContaining([expect.stringMatching(/^#/)]));
    const fills: string[] = (await drawn(page, [id]))[id].fills;
    expect(fills.some((c) => near(c, darkWhite)), `white box fill ${fills} vs ${darkWhite}`).toBe(true);
    expect(fills.some((c) => near(c, "#ffffff", 30)), "not white any more").toBe(false);
  }
  if (blue) {
    const id = byExc.get(blue.containerId ?? blue.id)!.id;
    const [r, g, b] = channels((await drawn(page, [id]))[id].color);
    expect(b > r && b > g, `blue text stays blue (rgb ${r} ${g} ${b})`).toBe(true);
  }
  await checkImported(page, elements, shapes);

  await setMode("light");
  if (white) {
    const id = byExc.get(white.id)!.id;
    await expect.poll(async () => (await drawn(page, [id]))[id].fills.some((c: string) => near(c, "#ffffff")), { message: "light mode: the stored white" }).toBe(true);
  }
  await checkImported(page, elements, shapes);
  await setMode("dark");
}
