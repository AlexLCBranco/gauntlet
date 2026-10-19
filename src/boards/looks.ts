// How a Boardkit card looks, worked out from its record: Boardkit's
// number formats (`domain/numberStyle.ts`), highlights (`highlight.ts`),
// check marks (`check.ts`), keep / maybe / cut (`status.ts`), card kinds
// (`cardKinds.ts`). Display only, so the board on the whiteboard reads
// like the board in Boardkit. Pure; tested in looks.test.ts.

import type { Card, List } from "./record";

const HIGHLIGHT_STYLES = ["outline", "dashed", "double", "bar", "pulse"];
const EMPHASES = ["badge", "ring", "bold", "muted"];
const STATUSES = ["keep", "maybe", "cut"] as const;
export type Status = (typeof STATUSES)[number];

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
  [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];

/** A card number written in its list's format. */
export function formatNumber(n: number, format: unknown): string {
  switch (format) {
    case "padded":
      return String(n).padStart(2, "0");
    case "hash":
      return `#${n}`;
    case "roman": {
      let rest = n;
      let out = "";
      for (const [value, numeral] of ROMAN) for (; rest >= value; rest -= value) out += numeral;
      return out;
    }
    case "letters": {
      let rest = n;
      let out = "";
      while (rest > 0) {
        rest -= 1;
        out = String.fromCharCode(65 + (rest % 26)) + out;
        rest = Math.floor(rest / 26);
      }
      return out;
    }
    default:
      return String(n);
  }
}

/** Boardkit's card kinds: dividers have no highlight and no check. */
const kindOf = (card: Card) => (card.kind === "divider" || card.kind === "note" ? card.kind : "normal");

/** The card's highlight style (`data-highlight`), or undefined for none. */
export function highlightOf(card: Card): string | undefined {
  if (typeof card.highlight !== "string" || kindOf(card) === "divider") return undefined;
  return typeof card.highlightStyle === "string" && HIGHLIGHT_STYLES.includes(card.highlightStyle) ? card.highlightStyle : "ring";
}

/** The card number's emphasis (`data-number-emphasis`), or undefined. */
export function emphasisOf(card: Card): string | undefined {
  return typeof card.numberEmphasis === "string" && EMPHASES.includes(card.numberEmphasis) ? card.numberEmphasis : undefined;
}

/** A keep / maybe / cut decision, or undefined. */
export function statusOf(item: Card | List): Status | undefined {
  return STATUSES.find((s) => s === item.status);
}

/** A card looks cut when it or its list is cut. */
export function looksCut(card: Card, list: List): boolean {
  return statusOf(list) === "cut" || statusOf(card) === "cut";
}

/** The card's check circle: undefined when its list has no checks (or the
    card can't be checked), else its mark ("none" for an empty circle). */
export function checkOf(card: Card, list: List): "none" | "green" | "red" | undefined {
  if (list.hasChecks !== true || kindOf(card) !== "normal") return undefined;
  return card.check === "green" || card.check === "red" ? card.check : "none";
}
