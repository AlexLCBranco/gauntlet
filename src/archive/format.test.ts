import { describe, expect, it } from "vitest";

import { ARCHIVE_FORMAT, ARCHIVE_VERSION, archiveFileName, archiveName, archivePageName, archiveProblem, dayMonth } from "./format";

const ok = {
  format: ARCHIVE_FORMAT,
  version: ARCHIVE_VERSION,
  savedAt: "2026-11-17T15:00:00Z",
  site: "https://gauntlet-home.vercel.app",
  page: "Page 1",
  content: { shapes: [], assets: [], rootShapeIds: [], schema: {} },
  boards: { b1: { name: "Daily", board: { lists: {} } } },
  maps: {},
  slates: { live: { schedule: { meta: {} }, odds: {}, notes: {} } },
};

describe("GT-10: the archive file", () => {
  it("a well-formed file opens", () => {
    expect(archiveProblem(ok)).toBeNull();
  });
  it("anything else says why, in plain words", () => {
    expect(archiveProblem({ format: "gauntlet-backup", version: 1 })).toMatch(/not a board file/);
    expect(archiveProblem({ ...ok, version: 2 })).toMatch(/newer gauntlet/);
    expect(archiveProblem({ ...ok, content: { shapes: [] } })).toMatch(/damaged/);
    expect(archiveProblem({ ...ok, boards: { b: { name: 1 } } })).toMatch(/a board/);
    expect(archiveProblem({ ...ok, slates: { x: { schedule: null, odds: {}, notes: {} } } })).toMatch(/a Slate/);
    for (const junk of [null, 1, "x", []]) expect(archiveProblem(junk)).toMatch(/not a board file/);
  });
  it("names: day/month in São Paulo, archive copies and pages, a safe file name", () => {
    expect(dayMonth("2026-11-05T02:55:00Z")).toBe("4/11"); // 23:55 on the 4th there
    expect(archiveName("Daily", "2026-11-04T15:00:00Z")).toBe("Daily (archive 4/11)");
    expect(archiveName("Daily (archive 4/11)", "2026-11-09T15:00:00Z")).toBe("Daily (archive 9/11)"); // saved again: not doubled
    expect(archivePageName("Page 1")).toBe("Page 1 (archive)");
    expect(archivePageName("Page 1 (archive)")).toBe("Page 1 (archive)");
    expect(archiveFileName("Lakers: 4/11?", "2026-11-05T02:55:00Z")).toBe("gauntlet-board-Lakers- 4-11--2026-11-04.json");
    expect(archiveFileName("  ", "2026-11-17T15:00:00Z")).toBe("gauntlet-board-board-2026-11-17.json");
  });
});
