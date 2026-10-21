import { expect, type Page } from "@playwright/test";

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
const rgb = (h: string) => `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ")})`;

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
      if (hex(e.strokeColor)) expect(v.color, `${name} colour`).toBe(rgb(hex(e.strokeColor)!));
    }
    if (["arrow", "line", "freedraw"].includes(e.type) && !e.angle) {
      expect(s.page.ox, `${name} x`).toBeCloseTo(e.x + d.x - (e.frameId ? 0 : 0), 0);
      expect(s.page.oy, `${name} y`).toBeCloseTo(e.y + d.y, 0);
    }
    // Colours: exactly Excalidraw's, as drawn.
    if (["rectangle", "ellipse", "diamond"].includes(e.type)) {
      if (hex(e.strokeColor)) expect(v.strokes, `${name} outline`).toContain(hex(e.strokeColor));
      if (hex(e.backgroundColor)) expect(v.fills, `${name} fill`).toContain(hex(e.backgroundColor));
      else expect(v.fills, `${name} no fill`).toEqual([]);
      const t = labels.get(e.id);
      if (t) {
        expect(v.font, `${name} label font`).toContain(FONT(t.fontFamily));
        expect(v.fontSize, `${name} label font size`).toBeCloseTo(t.fontSize!, 1);
        if (hex(t.strokeColor)) expect(v.color, `${name} label colour`).toBe(rgb(hex(t.strokeColor)!));
        expect(v.textInside, `${name}: its text sits inside it`).toBe(true);
        expect(s.props.growY ?? 0, `${name}: the box didn't have to grow for its text`).toBeLessThanOrEqual(opts.growTolerance ?? 0);
      }
    }
    if (e.type === "image") expect(v.picture, `${name} shows its picture`).toBe(true);
  }
}
