import { b64Vecs } from "@tldraw/tlschema";
import { describe, expect, it } from "vitest";

import sample from "../../../e2e/fixtures/excalidraw-sample.excalidraw?raw";

import { bendThrough, convertExcalidraw, cornerRadius, fontKind, parseExcalidraw, type ExcData, type ExcElement, type Plan } from "./convert";

const fixture = parseExcalidraw(sample)!;

function convert(data: ExcData, measure?: Parameters<typeof convertExcalidraw>[1]["measure"]): Plan {
  let n = 0;
  return convertExcalidraw(data, { newId: (kind, id) => `${kind}:${id}#${n++}`, measure });
}
const byExc = (plan: Plan, id: string) => plan.shapes.find((s) => s.meta.excalidrawId === id)!;

const el = (o: Partial<ExcElement> & { id: string; type: string }): ExcElement => ({ x: 0, y: 0, width: 100, height: 50, ...o });

describe("parseExcalidraw", () => {
  it("reads a .excalidraw file and Excalidraw's clipboard, as text or object; nothing else", () => {
    expect(parseExcalidraw(JSON.stringify({ type: "excalidraw", elements: [] }))).toEqual({ elements: [], files: null });
    expect(parseExcalidraw({ type: "excalidraw/clipboard", elements: [], files: {} })).toEqual({ elements: [], files: {} });
    expect(parseExcalidraw("not json")).toBeNull();
    expect(parseExcalidraw({ type: "tldraw", elements: [] })).toBeNull();
    expect(parseExcalidraw({ type: "excalidraw" })).toBeNull();
  });
});

describe("the sample drawing (e2e/fixtures/excalidraw-sample.excalidraw)", () => {
  const plan = convert(fixture);

  it("converts every element: bound texts become labels, deleted ones are skipped, the embed is a placeholder", () => {
    const ids = plan.shapes.map((s) => s.meta.excalidrawId).sort();
    const want = fixture.elements.filter((e) => !e.isDeleted && !(e.type === "text" && e.containerId)).map((e) => e.id).sort();
    expect(ids).toEqual(want);
    expect(plan.count).toBe(want.length);
    expect(plan.notConverted).toEqual(["embeddable (embed-1): can't be shown on the whiteboard, placeholder with its link"]);
    const embed = byExc(plan, "embed-1");
    expect(embed.type).toBe("geo");
    expect(embed.meta.placeholder).toBe("embeddable");
    expect(JSON.stringify(embed.props.richText)).toContain("https://example.com/video");
  });

  it("keeps position, size, exact colours, stroke width and style, roundness of rectangles", () => {
    const dark = byExc(plan, "rect-dark");
    expect([dark.x, dark.y, dark.props.w, dark.props.h]).toEqual([100, 100, 240, 100]);
    expect(dark.meta).toMatchObject({ strokeHex: "#1971c2", fillHex: "#343a40", textHex: "#ffffff", strokePx: 2, roundPx: 25 });
    expect(dark.props).toMatchObject({ geo: "rectangle", fill: "fill", dash: "solid", align: "middle", verticalAlign: "middle", font: "sans" });
    const white = byExc(plan, "rect-white");
    expect(white.meta).toMatchObject({ strokeHex: "#1971c2", fillHex: "#ffffff", strokePx: 1, roundPx: 0, fontPx: 16, lineHeight: 1.25, labelPad: 5 });
    expect(white.props).toMatchObject({ dash: "dashed", align: "start", verticalAlign: "start" });
    const ellipse = byExc(plan, "ellipse");
    expect(ellipse.props).toMatchObject({ geo: "ellipse", dash: "dotted" });
    expect(ellipse.meta).toMatchObject({ strokePx: 4, strokeHex: "#2f9e44", fillHex: "#b2f2bb" });
    const diamond = byExc(plan, "diamond");
    expect(diamond.props.fill).toBe("none");
    expect(diamond.meta.fillHex).toBeUndefined();
    expect(diamond.opacity).toBe(0.5);
  });

  it("bound text becomes the container's label with its exact text, font size and alignment", () => {
    const dark = byExc(plan, "rect-dark");
    expect(JSON.stringify(dark.props.richText)).toBe(
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Dark box with" }] }, { type: "paragraph", content: [{ type: "text", text: "white text" }] }] }),
    );
    expect(dark.meta.fontPx).toBe(16);
  });

  it("rotates about the element's centre, as Excalidraw does", () => {
    const r = byExc(plan, "rotated");
    const a = Math.PI / 6;
    const c = { x: 520 + 60, y: 300 + 30 };
    // tldraw's origin, rotated about itself, puts the centre back where it was.
    const centre = { x: r.x + 60 * Math.cos(a) - 30 * Math.sin(a), y: r.y + 60 * Math.sin(a) + 30 * Math.cos(a) };
    expect(r.rotation).toBeCloseTo(a);
    expect(centre.x).toBeCloseTo(c.x);
    expect(centre.y).toBeCloseTo(c.y);
  });

  it("arrows keep their ends, curve through the middle point, heads, label and bindings", () => {
    const a = byExc(plan, "arrow-1");
    expect(a.type).toBe("arrow");
    expect([a.x, a.y]).toEqual([340, 150]);
    expect(a.props).toMatchObject({ kind: "arc", start: { x: 0, y: 0 }, end: { x: 160, y: 10 }, arrowheadStart: "none", arrowheadEnd: "triangle" });
    expect(a.props.bend).toBeCloseTo(bendThrough({ x: 0, y: 0 }, { x: 80, y: -20 }, { x: 160, y: 10 }));
    expect(JSON.stringify(a.props.richText)).toContain("next");
    const targets = plan.bindings.filter((b) => b.fromId === a.id).map((b) => [b.terminal, plan.shapes.find((s) => s.id === b.toId)!.meta.excalidrawId]);
    expect(targets).toEqual([
      ["start", "rect-dark"],
      ["end", "rect-white"],
    ]);
    // The start sits on the dark box's right edge, halfway down.
    const start = plan.bindings.find((b) => b.fromId === a.id && b.terminal === "start")!;
    expect(start.normalizedAnchor.x).toBe(1);
    expect(start.normalizedAnchor.y).toBeCloseTo(0.5);
  });

  it("lines and freehand keep every point", () => {
    const line = byExc(plan, "line-1");
    expect(Object.values(line.props.points as Record<string, { x: number; y: number }>).map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [150, 40],
      [300, 0],
    ]);
    const draw = byExc(plan, "draw-1");
    const seg = (draw.props.segments as { path: string }[])[0];
    expect(b64Vecs.decodePoints(seg.path).map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [0, 0],
      [20, 30],
      [50, 10],
      [80, 45],
      [100, 20],
    ]);
  });

  it("fonts: hand-drawn -> draw, code -> mono, every other -> sans; exact sizes; alignment", () => {
    expect(byExc(plan, "text-nunito").props).toMatchObject({ font: "sans", textAlign: "start", autoSize: false, w: 220 });
    expect(byExc(plan, "text-nunito").meta).toMatchObject({ fontPx: 16, lineHeight: 1.25, strokeHex: "#1e1e1e" });
    expect(byExc(plan, "text-hand").props.font).toBe("draw");
    expect(byExc(plan, "text-hand").meta.fontPx).toBe(28);
    expect(byExc(plan, "text-code").props.font).toBe("mono");
    expect(byExc(plan, "text-helv").props).toMatchObject({ font: "sans", textAlign: "end" });
    expect(byExc(plan, "text-helv").meta.fontPx).toBe(24.8);
    for (const [family, kind] of [[1, "draw"], [5, "draw"], [3, "mono"], [8, "mono"], [2, "sans"], [6, "sans"], [7, "sans"], [9, "sans"], [10, "sans"], [undefined, "sans"]] as const) {
      expect(fontKind(family)).toBe(kind);
    }
  });

  it("pictures: one asset per file, the element's size, Excalidraw's crop as tldraw's", () => {
    expect(plan.assets.map((a) => a.fileId)).toEqual(["file-1"]);
    const cropped = byExc(plan, "image-1");
    expect(cropped.props).toMatchObject({ w: 80, h: 80, assetId: plan.assets[0].assetId, crop: { topLeft: { x: 0.5, y: 0 }, bottomRight: { x: 1, y: 1 } } });
    const whole = byExc(plan, "image-2");
    expect(whole.props).toMatchObject({ w: 160, h: 80, assetId: plan.assets[0].assetId, crop: null });
  });

  it("frames keep their children inside (positions relative to the frame); groups keep theirs together", () => {
    const frame = byExc(plan, "frame-1");
    expect(frame.type).toBe("frame");
    expect(frame.props).toMatchObject({ w: 300, h: 220, name: "My frame" });
    const inside = byExc(plan, "in-frame-1");
    expect(inside.parentId).toBe(frame.id);
    expect([inside.x, inside.y]).toEqual([20, 40]);
    // Frames come first, so their children can be put in them.
    expect(plan.shapes.findIndex((s) => s.id === frame.id)).toBeLessThan(plan.shapes.findIndex((s) => s.id === inside.id));
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].children.sort()).toEqual([byExc(plan, "group-a").id, byExc(plan, "group-b").id].sort());
  });

  it("bounds cover everything", () => {
    expect(plan.bounds.x).toBeCloseTo(100);
    expect(plan.bounds.y).toBeCloseTo(100);
    expect(plan.bounds.x + plan.bounds.w).toBeCloseTo(1300);
  });
});

describe("special cases", () => {
  it("a picture whose data isn't in the paste is a visible placeholder that says so", () => {
    const plan = convert({ elements: [el({ id: "img", type: "image", fileId: "nope" })], files: {} });
    expect(plan.assets).toEqual([]);
    expect(plan.shapes[0].type).toBe("geo");
    expect(plan.shapes[0].meta.placeholder).toBe("image");
    expect(JSON.stringify(plan.shapes[0].props.richText)).toContain("Picture not included in the paste");
    expect(plan.notConverted[0]).toContain("picture not included in the paste");
  });

  it("transparent stays transparent: no fill, no outline", () => {
    const plan = convert({ elements: [el({ id: "r", type: "rectangle", strokeColor: "transparent", backgroundColor: "transparent" })] });
    expect(plan.shapes[0].props.fill).toBe("none");
    expect(plan.shapes[0].meta.strokePx).toBe(0);
    expect(plan.shapes[0].meta.strokeHex).toBeUndefined();
  });

  it("fill styles: solid stays solid, hatching becomes tldraw's hatch; sketchy strokes stay sketchy", () => {
    const plan = convert({
      elements: [
        el({ id: "a", type: "rectangle", backgroundColor: "#ff0000", fillStyle: "solid", roughness: 0 }),
        el({ id: "b", type: "rectangle", backgroundColor: "#ff0000", fillStyle: "hachure", roughness: 1 }),
        el({ id: "c", type: "rectangle", backgroundColor: "#ff0000", fillStyle: "cross-hatch" }),
      ],
    });
    expect(plan.shapes.map((s) => [s.props.fill, s.props.dash])).toEqual([
      ["fill", "solid"],
      ["pattern", "draw"],
      ["pattern", "draw"],
    ]);
  });

  it("an arrow with many points, odd heads, or an unreadable colour is listed", () => {
    const plan = convert({
      elements: [
        el({ id: "a", type: "arrow", points: [[0, 0], [10, 10], [20, 0], [30, 10]], startArrowhead: "crowfoot_many", endArrowhead: "arrow", strokeColor: "red" }),
      ],
    });
    expect(plan.shapes[0].props.arrowheadStart).toBe("inverted");
    expect(plan.notConverted).toEqual([
      'arrow (a): stroke colour "red" not understood, left as tldraw\'s',
      "arrow (a): 4 points, drawn as one curve through its middle point",
      'arrow (a): arrowhead "crowfoot_many" shown as inverted',
    ]);
  });

  it("text wider in our font is widened so it breaks only where Excalidraw broke it; centred text stays centred", () => {
    const measure = () => ({ w: 140, h: 20 });
    const plan = convert({ elements: [el({ id: "t", type: "text", x: 100, width: 100, text: "hello there", textAlign: "center", fontSize: 16 })] }, measure);
    const t = plan.shapes[0];
    expect(t.props.w).toBe(141);
    expect(t.x + (t.props.w as number) / 2).toBeCloseTo(150);
  });

  it("a label wider in our font gets less padding, down to none, so its lines stay Excalidraw's", () => {
    const measure = () => ({ w: 236, h: 20 });
    const plan = convert(
      {
        elements: [
          el({ id: "r", type: "rectangle", width: 240, boundElements: [{ id: "t", type: "text" }] }),
          el({ id: "t", type: "text", text: "a label", containerId: "r", fontSize: 16 }),
        ],
      },
      measure,
    );
    expect(plan.shapes[0].meta.labelPad).toBe(1);
  });

  it("nested groups: the inner group first, then the outer one holding it", () => {
    const plan = convert({
      elements: [
        el({ id: "a", type: "rectangle", groupIds: ["in", "out"] }),
        el({ id: "b", type: "rectangle", groupIds: ["in", "out"] }),
        el({ id: "c", type: "rectangle", groupIds: ["out"] }),
      ],
    });
    expect(plan.groups).toHaveLength(2);
    const [inner, outer] = plan.groups;
    expect(inner.children).toHaveLength(2);
    expect(outer.children.sort()).toEqual([byExc(plan, "c").id, inner.id].sort());
  });

  it("Excalidraw's corner radius: a quarter of the short side up to 128 px, then 32 px", () => {
    expect(cornerRadius(el({ id: "r", type: "rectangle", width: 100, height: 40, roundness: { type: 3 } }))).toBe(10);
    expect(cornerRadius(el({ id: "r", type: "rectangle", width: 400, height: 200, roundness: { type: 3 } }))).toBe(32);
    expect(cornerRadius(el({ id: "r", type: "rectangle", width: 400, height: 200, roundness: null }))).toBe(0);
  });
});
