import { describe, expect, it } from "vitest";

import { manifestKey, usableManifest } from "./manifest";

const good = { api: 1, version: "1.76.0", js: "/calendar/slatekit/slatekit-Bsqj7KOP.js", css: "/calendar/slatekit/style-CRZ3Bvzc.css" };

describe("GT-5: the Slate kit manifest", () => {
  it("calendarkit's manifest of this API: used as it is", () => {
    expect(usableManifest(good)).toEqual(good);
    expect(usableManifest({ ...good, css: null })).toEqual({ ...good, css: null });
    expect(usableManifest({ ...good, js: `${good.js}?v=99` })?.js).toBe(`${good.js}?v=99`);
  });
  it("another API version: not used (the pinned copy is)", () => {
    expect(usableManifest({ ...good, api: 2 })).toBeNull();
    expect(usableManifest({ ...good, api: "1" })).toBeNull();
  });
  it("code from anywhere but calendarkit's own files is never run", () => {
    for (const js of ["https://evil.example/x.js", "//evil.example/x.js", "/other/x.js", "/calendar/../x.js", "javascript:alert(1)", "/calendar/x.js#a", 5, undefined])
      expect(usableManifest({ ...good, js }), String(js)).toBeNull();
    expect(usableManifest({ ...good, css: "https://evil.example/x.css" })).toBeNull();
  });
  it("junk: not used", () => {
    for (const m of [null, undefined, "x", 1, [], {}]) expect(usableManifest(m)).toBeNull();
  });
  it("a new file (code or stylesheet) is a new kit", () => {
    expect(manifestKey(good)).not.toBe(manifestKey({ ...good, css: "/calendar/slatekit/style-new.css" }));
    expect(manifestKey(good)).toBe(manifestKey({ ...good, version: "other" }));
  });
});
