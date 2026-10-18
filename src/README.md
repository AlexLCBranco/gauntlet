# Code areas

Each part lives in its own folder; read only the one you work on.

| Folder | What | Entry |
|---|---|---|
| `whiteboard/` | The whiteboard app at `/whiteboard` (tldraw): toolbar, shortcuts, first-visit defaults, wiring of the other areas | `Whiteboard.tsx` |
| `pages/` | Fixed pages: the sheet size, camera limits' bounds, keeping shapes inside the sheet, the next/previous arrows, Present | `sheet.ts` (pure), `PageArrows.tsx` |
| `lasso/` | Lasso selection: the tool, the loop overlay, the loop geometry | `LassoTool.ts`, `loop.ts` (pure) |
| `boards/` | Boardkit boards as whiteboard objects (phase 2): the tldraw shape, drawing the board, editing it in place, the toolbar's Board picker. Reads and writes Boardkit's own `boardkit:board:<id>` record | `BoardShape.tsx`, `BoardView.tsx`, `record.ts` (pure), `store.ts`, `fit.ts` (pure) |
| `canvas/`, `domain/` | The older iframe canvas ("stones") still on the home page `/`; see GAUNTLET-PLAN.md | `canvas/Canvas.tsx` |

Later phases add `maps/`, `connections/`.

Pure files (`sheet.ts`, `loop.ts`, `record.ts`, `fit.ts`; `store.ts` with a storage stand-in) have unit tests next to them
(`*.test.ts`, vitest). The e2e tests are in `../e2e/`.
