# Code areas

Each part lives in its own folder; read only the one you work on.

| Folder | What | Entry |
|---|---|---|
| `whiteboard/` | The whiteboard app at `/whiteboard` (tldraw): toolbar, shortcuts, first-visit defaults, wiring of the other areas | `Whiteboard.tsx` |
| `pages/` | Fixed pages: the sheet size, camera limits' bounds, keeping shapes inside the sheet, the next/previous arrows, Present | `sheet.ts` (pure), `PageArrows.tsx` |
| `lasso/` | Lasso selection: the tool, the loop overlay, the loop geometry | `LassoTool.ts`, `loop.ts` (pure) |
| `canvas/`, `domain/` | The older iframe canvas ("stones") still on the home page `/`; see GAUNTLET-PLAN.md | `canvas/Canvas.tsx` |

Later phases add `boards/`, `maps/`, `connections/`.

Pure files (`sheet.ts`, `loop.ts`) have unit tests next to them
(`*.test.ts`, vitest). The e2e tests are in `../e2e/`.
