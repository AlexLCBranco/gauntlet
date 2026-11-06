import { describe, expect, it } from "vitest";

import { caseOf, inCase, shownInCase } from "./textCase";

const doc = (...lines: string[]) => ({ type: "doc", content: lines.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t, marks: [{ type: "bold" }] }] })) }) as never;

describe("the case switcher (display only)", () => {
  it("shows every line in the case, marks kept, the typed text untouched", () => {
    const typed = doc("Lakers ML", "pts O 24.5");
    const up = inCase(typed, "upper") as any;
    expect(up.content.map((p: any) => p.content[0].text)).toEqual(["LAKERS ML", "PTS O 24.5"]);
    expect(up.content[0].content[0].marks).toEqual([{ type: "bold" }]);
    expect((inCase(typed, "lower") as any).content[0].content[0].text).toBe("lakers ml");
    expect((typed as any).content[0].content[0].text).toBe("Lakers ML");
    expect(inCase(typed, null)).toBe(typed);
  });
  it("reads only its own two values; typing shows the text as typed", () => {
    expect(caseOf({ textCase: "upper" })).toBe("upper");
    expect(caseOf({ textCase: "title" })).toBeNull();
    const s = { meta: { textCase: "upper" }, props: { richText: doc("Tv") } };
    expect((shownInCase(s).props.richText as any).content[0].content[0].text).toBe("TV");
    expect(shownInCase(s, true)).toBe(s);
  });
});
