import type { TLRichText } from "tldraw";

// The case switcher (owner, Edges round item 7): Aa (as typed), AA (all
// caps), aa (all lowercase). A DISPLAY style, like the font size: kept in
// the shape's `meta.textCase`, the typed text (`props.richText`) never
// changes, so going back to Aa loses nothing. Drawn, measured and exported
// from a copy of the text in that case (shapeUtils.ts). Pure; tested in
// textCase.test.ts.

export type TextCase = "upper" | "lower";

export const caseOf = (meta: Record<string, unknown> | undefined): TextCase | null =>
  meta?.textCase === "upper" || meta?.textCase === "lower" ? meta.textCase : null;

type Node = { type?: string; text?: string; content?: Node[]; [k: string]: unknown };

function walk(node: Node, change: (s: string) => string): Node {
  const out: Node = { ...node };
  if (typeof node.text === "string") out.text = change(node.text);
  if (Array.isArray(node.content)) out.content = node.content.map((c) => walk(c, change));
  return out;
}

/** The rich text shown in case `c` (a new object; the original untouched). */
export function inCase(richText: TLRichText, c: TextCase | null): TLRichText {
  if (!c || !richText) return richText;
  const change = c === "upper" ? (s: string) => s.toLocaleUpperCase() : (s: string) => s.toLocaleLowerCase();
  return walk(richText as unknown as Node, change) as unknown as TLRichText;
}

/** A shape whose text is shown in its picked case (when it has one, and
    isn't being typed in: typing shows the text as typed). */
export function shownInCase<S extends { meta: Record<string, unknown>; props: object }>(shape: S, editing = false): S {
  const c = caseOf(shape.meta);
  const props = shape.props as { richText?: TLRichText };
  if (!c || editing || !props.richText) return shape;
  return { ...shape, props: { ...shape.props, richText: inCase(props.richText, c) } };
}
