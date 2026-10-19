# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step.

**Nothing is broken on the live site.** The home page (/) is untouched.

**tldraw key is a temporary evaluation key, expires Nov 1 2026; swap for
the permanent hobby key when it arrives.** Added 2026-10-18.
- Where it's stored: Vercel project `gauntlet-home` → Settings →
  Environment Variables → `VITE_TLDRAW_LICENSE_KEY` (Production and
  Preview). Not in the repo. `src/whiteboard/Whiteboard.tsx` reads it at
  build time (`import.meta.env.VITE_TLDRAW_LICENSE_KEY`).
- How to swap it: in that Vercel page, edit `VITE_TLDRAW_LICENSE_KEY` and
  paste the hobby key (both environments), then redeploy (Deployments → the
  latest Production one → Redeploy). Vite bakes the key into the build, so
  it only takes effect after a redeploy. Or from this folder:
  `vercel env rm VITE_TLDRAW_LICENSE_KEY production`, then
  `vercel env add VITE_TLDRAW_LICENSE_KEY production` (paste the key), same
  for `preview`, then `vercel redeploy https://gauntlet-home.vercel.app --target production`.
- Check: `BRIDGE_SITE=https://gauntlet-home.vercel.app npx playwright test e2e/whiteboard.e2e.ts`
  (the "license is accepted" test). The evaluation key shows no "made with
  tldraw" watermark; the hobby key will, and the watermark test then checks
  the page arrows don't cover it.
- Live was redeployed with the key from the same phase 1 build (no phase 2
  push): all 10 whiteboard e2e pass live.

**Branches (2026-10-18, owner's instruction):**
- `main` = the live site (a push deploys it): phase 1 + its fixes only.
- `phase-2` = all phase 2 work. Push it often (`git push origin phase-2`)
  so nothing exists only on one computer. Vercel only makes a Preview for
  it. NEVER push phase 2 to `main` until the owner says it may go live.
- `phase-2` has every phase 1 fix (merged from `main` 2026-10-18). If a
  phase 1 fix lands on `main` later, merge `main` into `phase-2` again.

## Current phase: 2 (Boardkit as a live object), on branch `phase-2` — DONE 2026-10-19, waiting for the owner's hand test

Phase 2 started 2026-10-18. Owner chose: the board object reads and writes
Boardkit's own record (PROJECT.md, DECISIONS: three phase 2 entries). Code
is in `src/boards/` (see `src/README.md`). All on branch `phase-2` (pushed);
the live site has phase 1 only.

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
   - Before the pause `node scripts/local-e2e.mjs` passed in full (18 here
     + 14 Linkkit).
   - NO push to `main` (owner, 2026-10-18): phase 2 stays on `phase-2`.
7. DONE (2026-10-18) — Merge `main` (phase 1 fixes + the two
   re-test decisions) into `phase-2`:
   - DONE: conflicts resolved (HANDOFF.md, PROJECT.md, src/README.md,
     e2e/whiteboard.e2e.ts: kept both sides; Whiteboard.tsx:
     `shapeUtils = [...styleShapeUtils, BoardShapeUtil]`).
   - After the merge `tsc -b` clean, `npm test` 77 pass, whiteboard +
     boards e2e 24 pass against the dev server (boards.e2e needed no
     change). Committed and pushed to `phase-2`.
8. DONE — Finish phase 2 against PROJECT.md section 6 ("resize from
   the corners, edit cards in place, my existing boards move over"), fix
   the known gaps below that block real use, then tell the owner what to
   try by hand (PROJECT.md rule 3) and STOP.
   - DONE: the Board button is now a toolbar tool (`boardToolItem` +
     `BoardPicker` in `src/boards/AddBoard.tsx`), after Frame. It had sat
     on its own row under the toolbar after the merge, over the style
     panel, and went off-screen in narrow windows. The toolbar shows as
     many tools as fit (`src/whiteboard/toolbarFit.ts`), the rest in its
     overflow menu (Board then is `tools.more.board`). e2e "the Board
     button is on the toolbar's row at any window width".
   - DONE: a board shows Boardkit's card looks, so it reads like the
     screenshot the owner pastes today: number formats (roman, letters,
     #, 01) and emphasis (badge, ring, bold, muted), highlights (ring,
     outline, dashed, double, bar, pulse), check circles in lists with
     checks, keep / maybe / cut badges, cut cards and cut lists faded.
     `src/boards/looks.ts` (pure, `looks.test.ts`), drawn in
     `BoardView.tsx`, `boards.css`. Display only (checks can't be
     clicked on the whiteboard yet). e2e "a board looks as in Boardkit".
   - DONE: speed check, e2e "a big board (8 lists, 240 cards) stays
     smooth": dragging it and zooming, median frame 16.7 ms (60 fps),
     95th percentile 33 ms, no long tasks (dev server, headless Edge).
   - DONE 2026-10-19: full `node scripts/local-e2e.mjs` passed (30 here +
     14 Linkkit), `npm test` 88 pass, build clean, `npm audit` 0.
     Vercel built the `phase-2` Preview (success). The Preview sits
     behind Vercel's login and is its own origin, so it has none of the
     owner's boards (they live in gauntlet-home.vercel.app's browser
     storage); a board made at <preview>/boardkit/ shows there.
   - Reported to the owner what to try by hand (2026-10-19). WAIT.
9. OPEN, the owner decides — (a) phase 2 goes live (`phase-2` into
   `main`) only on the owner's word; (b) DECISIONS says the whiteboard
   takes over the home page / "at the latest when boards move over in
   phase 2": asked the owner, no answer yet.

### Bugs found by the e2e and fixed (phase 2)
- Escape in a card's text field also ended editing the board: tldraw
  listens for keys natively on its container, before React. The field now
  stops keys natively and reads Enter/Escape itself.
- Escape after a text field or the x button went away did nothing: focus
  fell to the page body, out of tldraw's reach. Fields hand focus back,
  board buttons don't take focus, and Escape on the body ends editing.

### Known gaps (phase 2)
- Picking single cards with lasso/box select is deferred to phase 4
  (DECISIONS).
- Background images and thots aren't drawn (DECISIONS).

## Phase 1 (done, live on `main`)

### Phase 1 fixes from the owner's hand test (2026-10-18) — ALL DONE, LIVE

The owner tested phase 1 by hand on the live site. Fix ALL of these before
continuing phase 2. Tick each off here as it's fixed; add automatic tests
where possible.

KEEP: the yellow, and tldraw's colours in general (prettier than Excalidraw's).

- [x] 1. Font size: text can't be made smaller. Add sizes smaller than the
      current smallest.
- [x] 2. The colour/style menu doesn't go away. It should close when nothing
      is selected or on a click elsewhere, like Excalidraw.
- [x] 3. The page loads zoomed to 79% with empty space around it. On load the
      page must fill the window exactly; that is "100%".
- [x] 4. No "start from scratch". Add "clear page" to the main menu (like
      Excalidraw's "Reset the canvas"), with a confirmation before it wipes
      anything.
- [x] 5. Copy Excalidraw's layout: main menu top-left, tool toolbar
      top-center, zoom + undo/redo bottom-left, page arrows bottom-right.
- [x] 6. Make the style panel (appears on selection: colours, stroke, fill,
      font…) look and work like Excalidraw's.
- [x] 7. At 100% you can still pan and see empty space outside the page.
      Seeing anything outside the page must be impossible. Panning is only
      allowed when zoomed in, and only within the page's edges.
- [x] 8. While dragging things, Excalidraw shows a rectangle outline around
      what's moving. Add it.
- [x] 9. Shapes with text: only the outline can be coloured. Need the
      BACKGROUND (fill) colour and the TEXT colour inside, set separately.
- [x] 10. CHECK (owner unsure): dragging may feel less smooth than
      Excalidraw. Compare; fix if there's a real difference, tell the owner
      if there isn't.
      RESULT: no measurable difference. `scripts/drag-feel.mjs` (40 shapes,
      a 2 s drag) on the new build, the old live site and excalidraw.com:
      all a steady 60 fps (median 16.7 ms a frame, worst under 18 ms), no
      long tasks, and the dragged shape keeps up with the pointer every
      frame. A felt difference may come from the missing outline mid-drag
      (fixed, item 8) or from unfilled shapes only being grabbable by their
      outline unless selected (as in Excalidraw). The owner re-checks by
      hand.

How 1–9 were done (branch `phase-1-fixes`; e2e "fix N" tests in
`e2e/whiteboard.e2e.ts`, each failing on the old live site):
- 1, 6, 9, 2: `src/style/`. Our own style panel (Excalidraw's look, left
  under the menu) replaces tldraw's. Font sizes XXS 10 / XS 14 / S 18 / M 24
  / L 36 / XL 44 px, kept in `meta.fontStep` apart from the stroke width.
  Background colour kept in `meta.fillColor` (tldraw fills with the outline
  colour); text colour is tldraw's own `labelColor`. Shown only while
  something is selected.
- 3, 7: `src/pages/camera.ts`, `keepFilled.ts`. 100% = the page fills the
  window edge to edge (no padding); never zoomed out past it; the view
  never leaves the page. `fillWindow` replaces tldraw's `resetZoom`, which
  toggled to its own 100% when already there.
- 4: `src/whiteboard/MainMenu.tsx`: "Clear page" at the top of the main
  menu, with a Cancel / Clear page dialog. Only the current page; Ctrl+Z
  brings it back.
- 5: `Whiteboard.tsx` components: tldraw's top-left undo row and actions
  menu and top-right style panel removed; `ZoomUndo.tsx` bottom left; the
  toolbar pinned to the window's centre; page arrows in the bottom-right
  corner (above the watermark when there is one).
- 8: `src/whiteboard/DragOutline.tsx`.

### Owner's two decisions after the re-test (2026-10-18) — DONE, LIVE

- [x] Non-16:9 windows: show the WHOLE page with dark bars at the sides; at
      100% no scrolling at all. `camera.ts` (`fillZoom` = min of the two
      ratios), Whiteboard.tsx camera `fit-max` + tldraw's `contain`
      (centres the axis where the page is narrower). e2e "in a window that
      isn't 16:9 ..." (1400x900, 900x900, 1800x700).
- [x] One Ctrl+Z undoes a shape just drawn, even after Escape. Cause:
      tldraw's Select tool marks "clearing selection" (Escape) and
      "selecting none" (click on empty space) as their own undo steps, so the
      first Ctrl+Z only re-selected the shape. Fix:
      `src/whiteboard/undoSkipsSelection.ts`: undo/redo carry on past steps
      that change nothing on the page. Ctrl+Y also redoes (Excalidraw on
      Windows). e2e "one Ctrl+Z undoes a shape just drawn ..." (failed on the
      old code).
- Before the push `node scripts/local-e2e.mjs` passed (22 here + 14
  Linkkit), `npm test` passes. Pushed to `main` (`7943a14`); after the
  deploy all 19 whiteboard e2e passed live.

### Phase 1 basics

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
- Nothing half-done.

### Known wrong / open
- tldraw license: temporary evaluation key until 2026-11-01 (see top). The
  hobby key must replace it before then, or live /whiteboard disappears
  after 5 s again.
- If the window is 0 x 0 (seen in an embedded browser pane), the whiteboard
  crashes with "camera.x: Expected a number, got NaN".
- Old PROJECT.md content (how the iframe canvas works) is now only in git
  history (`git show 28662b9:PROJECT.md`) and GAUNTLET-PLAN.md.

### Next concrete step
- Phase 2 is done on `phase-2`; wait for the owner's hand test and the
  two decisions in phase 2's step 9. Do not start phase 3.
- Swap in the hobby key when it arrives, before 2026-11-01 (see top).
