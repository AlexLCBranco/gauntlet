# Code areas

Each part lives in its own folder; read only the one you work on.

| Folder | What | Entry |
|---|---|---|
| `whiteboard/` | The whiteboard app at `/whiteboard` (tldraw): Excalidraw's layout (toolbar, main menu with Clear page, zoom + undo/redo bottom left), shortcuts, first-visit defaults, the outline while dragging, undo skipping selection-only steps, wiring of the other areas | `Whiteboard.tsx` |
| `pages/` | Pages, as in Excalidraw but bounded: the page is at least the window's size at 100% (no bars) and as big as what's on it; a smaller window keeps the zoom and shows part of the page, you pan to the rest, up to its edges (100% = one page unit per screen pixel). The edges are a wall during drags and resizes (`edgeWall.ts`); anything else past them is pulled back after (`keepInside.ts`). The next/previous arrows, Present | `camera.ts` (pure), `keepFilled.ts`, `edgeWall.ts`, `sheet.ts`, `PageArrows.tsx` |
| `style/` | The style panel (Excalidraw's, left under the menu) and the styles tldraw lacks, kept in a shape's `meta`: font sizes smaller than tldraw's, a background colour apart from the outline | `StylePanel.tsx`, `styleMeta.ts` (pure), `shapeUtils.ts` |
| `lasso/` | Lasso selection: the tool, the loop overlay, the loop geometry | `LassoTool.ts`, `loop.ts` (pure) |
| `boards/` | Boardkit boards as whiteboard widgets (phase 2): the tldraw shape (scaled like a picture, its box follows the content), editing in place, the toolbar's Board picker (an existing board, or "+ New board": a new Boardkit board, its name typed in place in `BoardName.tsx`). The board itself is drawn and edited by Boardkit's own code (npm dependency `boardkit`, its `src/app/whiteboard/`; every import goes through `boardkit.ts`) | `BoardShape.tsx`, `boardkit.ts`, `AddBoard.tsx`, `fit.ts` (pure) |
| `backup/` | The backup page at `/backup/`: one file with all of this site's browser storage (every localStorage key, every IndexedDB database: Boardkit's board background pictures, the whiteboard with its pictures), and a restore from it that first downloads what is there. Automatic backups of the same kind kept in the browser (on opening `/`, `/whiteboard/`, `/backup/`, every 10 min), within a storage budget, with a warning when one can't be kept | `BackupPage.tsx`, `format.ts` (pure), `storage.ts`, `auto.ts`, `policy.ts` (pure) |
| `canvas/`, `domain/` | The older iframe canvas (its widgets, called "stones" in its code) still on the home page `/`; see GAUNTLET-PLAN.md | `canvas/Canvas.tsx` |

Later phases add `maps/`, `connections/`.

Pure files (`backup/format.ts`, `backup/policy.ts`, `sheet.ts`, `camera.ts`, `loop.ts`, `styleMeta.ts`, `fit.ts`) have unit tests next to them
(`*.test.ts`, vitest). The e2e tests are in `../e2e/`.
