# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step.

**Nothing is broken on the live site.** The home page (/) is untouched.

**Branches (2026-10-18, owner's instruction):** all current work, including
unfinished phase 2, is on the GitHub branch **`phase-2`**. Work there and
push there (`git push origin phase-2`). Do NOT push to `main` — a push to
`main` deploys the live site, which must stay on phase 1 until the owner
has tested it by hand and says phase 2 may go live. `origin/main` is phase
1 only. (Local `main` has the same commits as `phase-2`; don't push it.)
Vercel builds a Preview (not the live site) for each `phase-2` push.

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

## Phase 1 fixes from the owner's hand test (2026-10-18) — DO THESE BEFORE PHASE 2

The owner tested phase 1 by hand on the live site. Fix ALL of these before
continuing phase 2. Tick each off here as it's fixed; add automatic tests
where possible.

KEEP: the yellow, and tldraw's colours in general (prettier than Excalidraw's).

- [ ] 1. Font size: text can't be made smaller. Add sizes smaller than the
      current smallest.
- [ ] 2. The colour/style menu doesn't go away. It should close when nothing
      is selected or on a click elsewhere, like Excalidraw.
- [ ] 3. The page loads zoomed to 79% with empty space around it. On load the
      page must fill the window exactly; that is "100%".
- [ ] 4. No "start from scratch". Add "clear page" to the main menu (like
      Excalidraw's "Reset the canvas"), with a confirmation before it wipes
      anything.
- [ ] 5. Copy Excalidraw's layout: main menu top-left, tool toolbar
      top-center, zoom + undo/redo bottom-left, page arrows bottom-right.
- [ ] 6. Make the style panel (appears on selection: colours, stroke, fill,
      font…) look and work like Excalidraw's.
- [ ] 7. At 100% you can still pan and see empty space outside the page.
      Seeing anything outside the page must be impossible. Panning is only
      allowed when zoomed in, and only within the page's edges.
- [ ] 8. While dragging things, Excalidraw shows a rectangle outline around
      what's moving. Add it.
- [ ] 9. Shapes with text: only the outline can be coloured. Need the
      BACKGROUND (fill) colour and the TEXT colour inside, set separately.
- [ ] 10. CHECK (owner unsure): dragging may feel less smooth than
      Excalidraw. Compare; fix if there's a real difference, tell the owner
      if there isn't.

That's the whole list (1–10). Fix them on top of the live phase 1 version
(branch off `origin/main`, not `phase-2`), deploy phase 1 only to the live
site, then stop and tell the owner what to re-test.

Phase 2 status at the pause: `node scripts/local-e2e.mjs` passed in full
(18 here + 14 Linkkit) on 2026-10-18; `npm test` passes. Not yet reported
to the owner.

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
   - DONE 2026-10-18: full pre-push run `node scripts/local-e2e.mjs` (every e2e
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
- tldraw license: a temporary evaluation key is live until 2026-11-01 (see
  the top of this file). The owner applied for the free hobby key on
  2026-10-18; it comes by email and must replace the evaluation key before
  Nov 1, or live /whiteboard disappears after 5 s again.
- If the window is 0 x 0 (seen in an embedded browser pane), the whiteboard
  crashes with "camera.x: Expected a number, got NaN". Not fixed yet.
- Old PROJECT.md content (how the iframe canvas works) is now only in git
  history (`git show 28662b9:PROJECT.md`) and GAUNTLET-PLAN.md.

### Next concrete step
- Phase 2 step 6: run `node scripts/local-e2e.mjs`; if all pass, push to
  main, re-run e2e live, then report to the owner and wait.
- First the owner tests phase 1 by hand on the live site (asked 2026-10-18).
- Swap in the hobby key when it arrives, before 2026-11-01 (see top).
