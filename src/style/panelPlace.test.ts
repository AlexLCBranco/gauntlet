import { describe, expect, it } from "vitest";

import { readPlace } from "./panelPlace";

describe("the style panel's place", () => {
  it("defaults to the left, open; reads what was stored; ignores junk", () => {
    expect(readPlace(null)).toEqual({ side: "left", collapsed: false });
    expect(readPlace('{"side":"right","collapsed":true}')).toEqual({ side: "right", collapsed: true });
    expect(readPlace('{"side":"up","collapsed":"yes"}')).toEqual({ side: "left", collapsed: false });
    expect(readPlace("{oops")).toEqual({ side: "left", collapsed: false });
  });
});
