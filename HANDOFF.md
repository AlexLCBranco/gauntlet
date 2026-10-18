# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step.

**Nothing is broken on the live site.** The home page (/) is untouched.

## Current phase: 2 (Boardkit as a live object), IN PROGRESS (paused by the owner)

Phase 2 started 2026-10-18. Owner chose: the board object reads and writes
Boardkit's own record (PROJECT.md, DECISIONS: three phase 2 entries). Code
is in `src/boards/` (see `src/README.md`). **Committed locally, NOT pushed**:
the live site still has phase 1 only.

### Phase 2 plan (the task list), with status
1. DONE — Read PROJECT.md/HANDOFF.md, ask the owner where board data lives
   (answer: stays shared with Boardkit).
2. DONE — Pure board record ops + unit tests: `src/boards/record.ts`
   (read Boardkit's `boardkit:board:<id>` v2 record, rename card/list, add,
   move, trash, undo changes, card numbers; keeps every unknown field,
   rev + 1 per write), `record.test.ts` (18 tests).
3. DONE — Store: `src/boards/store.ts` (localStorage + `storage` events,
   edits, per-board undo/redo), `store.test.ts` (5 tests).
4. DONE — tldraw board shape + in-place editing: `BoardShape.tsx` (shape
   `boardkit-board`, props boardId/w/h/scale, aspect-locked corner resize
   scales the whole board, box follows content, never past the sheet:
   `fit.ts` + `fit.test.ts`), `BoardView.tsx` (draws lists/cards in
   Boardkit's dark look; double-click/Enter to edit: click title renames,
   drag moves a card, x trashes, "+ Add a card"; Ctrl+Z/Ctrl+Shift+Z while
   editing undo card edits), `boards.css`.
5. DONE — Board picker on the toolbar: `AddBoard.tsx` (button "Board"
   right of the toolbar, lists `boardkit:registry`, places the board in
   the middle of the current page, selected). Wired in
   `src/whiteboard/Whiteboard.tsx` (`shapeUtils`).
6. IN PROGRESS — e2e, build, push, HANDOFF:
   - DONE: `e2e/boards.e2e.ts` (5 tests: place board, corner scale + undo,
     rename/add/move/delete + undo/redo + Boardkit shows it, Boardkit's
     edits show live + deleted board notice, box select + lasso). All 5
     passed against the dev server:
     `BRIDGE_SITE=http://localhost:<port> npx playwright test e2e/boards.e2e.ts`.
     `npm test` passes (66 unit + proxy tests), `tsc -b` clean.
   - NOT DONE: full pre-push run `node scripts/local-e2e.mjs` (every e2e
     here + Linkkit's). It was started when the owner paused the work; its
     result was not recorded. Run it again.
   - NOT DONE: push to main, then re-run the e2e live.
   - NOT DONE: tell the owner what to try by hand (PROJECT.md rule 3).

### Bugs found by the e2e and fixed (phase 2)
- Escape in a card's text field also ended editing the board: tldraw
  listens for keys natively on its container, before React. The field now
  stops keys natively and reads Enter/Escape itself.
- Escape after a text field or the x button went away did nothing: focus
  fell to the page body, out of tldraw's reach. Fields hand focus back,
  board buttons don't take focus, and Escape on the body ends editing.

### Known gaps (phase 2)
- At narrow windows (about 1000 px and less) the toolbar overflows and the
  Board button is pushed off-screen.
- Picking single cards with lasso/box select is deferred to phase 4
  (DECISIONS).
- Background images and thots aren't drawn (DECISIONS).

## Phase 1 (done)

The whiteboard is a tldraw app at /whiteboard (see DECISIONS). Code areas
are listed in `src/README.md`: `src/whiteboard/`, `src/pages/`,
`src/lasso/`.

### Done
- tldraw 5.5.2. PROJECT.md replaced by the owner's new plan.
- Lasso (W), fixed 1920x1080 sheet with camera limits, shapes kept inside
  the sheet, page arrows (next on the last page makes one) + PageUp/Down,
  Present, toolbar on top, Excalidraw keys (1-0, D diamond, P pen), dark.
- Unit tests (`npm test`) and e2e `e2e/whiteboard.e2e.ts` (9 tests) pass
  against the dev server:
  `BRIDGE_SITE=http://localhost:5180 npx playwright test e2e/whiteboard.e2e.ts`
  (start it with `npm run dev`).
- Bugs found by the e2e and fixed: tldraw's "number = nth toolbar button"
  overrode Excalidraw's number keys (turned off); Escape mid-lasso cleared
  the selection instead of restoring it.

- Every e2e passed before the push (`node scripts/local-e2e.mjs`: 12 here,
  14 Linkkit). Pushed to main (`005168d`), live at
  gauntlet-home.vercel.app/whiteboard/ (/whiteboard redirects there).

### Half-done / where it stopped
- See phase 2's plan above (step 6).

### Known wrong / open
- **Live /whiteboard disappears after 5 s**: no tldraw license key yet
  (console: "No tldraw license key provided!"). The owner applied for the
  free hobby key on 2026-10-18; tldraw reviews it and replies by email
  (within a week). Not needed to build phase 2. When it arrives, the owner
  pastes it to the agent (commit it
  as `VITE_TLDRAW_LICENSE_KEY=...` in `.env.production`; the key ships to
  every browser anyway, so it isn't a secret) or sets it as a Vercel env
  var. Until then, the live e2e "watermark" test fails (11/12 pass live);
  localhost works without a key.
- Old PROJECT.md content (how the iframe canvas works) is now only in git
  history (`git show 28662b9:PROJECT.md`) and GAUNTLET-PLAN.md.

### Next concrete step
- Phase 2 step 6: run `node scripts/local-e2e.mjs`; if all pass, push to
  main, re-run e2e live, then report to the owner and wait.
- Add the tldraw license key when it arrives (see above).
