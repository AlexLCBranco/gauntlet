# Code areas

Each part lives in its own folder; read only the one you work on.

| Folder | What | Entry |
|---|---|---|
| `whiteboard/` | The whiteboard app at `/whiteboard` (tldraw): Excalidraw's layout (toolbar, main menu with Clear page, zoom + undo/redo bottom left), shortcuts, first-visit defaults, the outline while dragging, undo skipping selection-only steps, wiring of the other areas | `Whiteboard.tsx` |
| `pages/` | Fixed pages: the sheet size, the camera (100% = the whole page in view, centred, dark bars when the window isn't 16:9; nothing scrolls at 100%), keeping shapes inside the sheet, the next/previous arrows, Present | `sheet.ts`, `camera.ts` (pure), `keepFilled.ts`, `PageArrows.tsx` |
| `style/` | The style panel (Excalidraw's, left under the menu) and the styles tldraw lacks, kept in a shape's `meta`: font sizes smaller than tldraw's, a background colour apart from the outline | `StylePanel.tsx`, `styleMeta.ts` (pure), `shapeUtils.ts` |
| `lasso/` | Lasso selection: the tool, the loop overlay, the loop geometry | `LassoTool.ts`, `loop.ts` (pure) |
| `canvas/`, `domain/` | The older iframe canvas ("stones") still on the home page `/`; see GAUNTLET-PLAN.md | `canvas/Canvas.tsx` |

Later phases add `boards/`, `maps/`, `connections/`.

Pure files (`sheet.ts`, `camera.ts`, `loop.ts`, `styleMeta.ts`) have unit tests next to them
(`*.test.ts`, vitest). The e2e tests are in `../e2e/`.
