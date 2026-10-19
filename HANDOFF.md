# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step.

**Previews open without a Vercel login (2026-10-19, owner's request).**
Phase 2 preview for the owner's hand test: https://gauntlet-home-git-phase-2-alexlcbrancos-projects.vercel.app/whiteboard/
(it follows the latest push to `phase-2`). Vercel Authentication is off for
project `gauntlet-home`; turn back on with
`vercel project protection enable gauntlet-home --sso`. A preview is its own
address: it has none of the owner's real boards; Boardkit runs there
(v0.0.95, with automatic backups off) so test boards can be made at
<preview>/boardkit/. Linkkit still shows its "moved" notice on previews
(not needed for phase 2).

**Before phase 2 goes live (owner, 2026-10-19), BOTH:** (1) the owner has
tested it by hand; (2) the owner's real Boardkit AND Linkkit data on
gauntlet-home.vercel.app has a backup the owner can restore. Set up that
backup first. The old home page (/) stays; revisit after phase 3.
- BUILT 2026-10-19 (a side session; PROJECT.md DECISIONS): the backup
  page gauntlet-home.vercel.app/backup/ (`src/backup/`). "Save a backup"
  = one file with ALL of this site's browser storage (every localStorage
  key + every IndexedDB database: Boardkit's pictures, the whiteboard's
  pages); "Restore from a backup file…" puts it back after downloading
  what's there. Not phase 2 work, so it is on `main`. Tests: unit
  `src/backup/format.test.ts` (10), e2e `e2e/backup.e2e.ts` (3: restore
  into an empty browser = byte-for-byte the same and the apps open it;
  restore over changed data + undo with the safety copy; a wrong file is
  refused). The e2e fail if the restore skips IndexedDB (checked).
  LIVE on `main` (`5881bfd`): backup + whiteboard + canvas e2e, 25 pass
  against gauntlet-home.vercel.app. `main` is now ahead of `phase-2`:
  merge `main` into `phase-2` (only `src/backup/`, `backup/`, e2e, docs,
  `vite.config.ts` input, `vercel.json` redirect; expect conflicts only in
  HANDOFF.md/PROJECT.md/src/README.md/vite.config.ts: keep both sides).
- WAITING FOR THE OWNER: they save their real backup (steps below; only
  they can, their data lives only in their browser). Once they say it's
  saved, condition (2) is met.
- Owner's steps, one at a time: (1) open
  gauntlet-home.vercel.app/backup/ in the browser you normally use;
  (2) click "Save a backup" (the grey line should list your boards and
  maps); (3) move the downloaded `gauntlet-backup-….json` from Downloads
  to OneDrive. Optional proof it restores, without touching the real
  data: (4) open an InPrivate window (Ctrl+Shift+N) at
  gauntlet-home.vercel.app/backup/; (5) "Restore from a backup file…",
  pick the file, "Replace with this backup"; (6) open /boardkit/ and
  /linkkit/ in that same InPrivate window: your boards and maps are
  there. Closing the InPrivate window forgets it all.

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
- `main` = the live site (a push deploys it): phase 1 only, plus the
  phase 1 fixes below, worked on as branch `phase-1-fixes` and pushed to
  `main` when done.
- `phase-2` = all phase 2 work (unfinished, paused). Vercel only makes a
  Preview for it, never the live site. Never push phase 2 to `main` until
  the owner says it may go live. It does NOT have the phase 1 fixes yet:
  merging `main` into it is the first step when phase 2 resumes (see
  "Next concrete step").

## Phase 1 fixes from the owner's hand test (2026-10-18) — ALL DONE, LIVE

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

That's the whole list (1–10). Fix them on top of the live phase 1 version
(branch off `origin/main`, not `phase-2`), deploy phase 1 only to the live
site, then stop and tell the owner what to re-test.


## Owner's two decisions after the re-test (2026-10-18) — DONE, LIVE

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
- Next: phase 2 resumes on branch `phase-2` (owner, 2026-10-18): merge
  `main` into it, then continue phase 2. Phase 2 never goes to `main`.

## Current phase: 1 (the floor): fixes 1–10 live, waiting for the owner's re-test; phase 2 paused on branch `phase-2`

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
- Fixes 1–10 are live (pushed to `main` 2026-10-18, `0121e3b`). Before the
  push `node scripts/local-e2e.mjs` passed (21 here + 14 Linkkit); after
  it every e2e passed live (21). The owner re-tests by hand; wait.
- When the owner says phase 2 continues: merge `main` into `phase-2`.
  Expect conflicts in HANDOFF.md, PROJECT.md, `src/whiteboard/Whiteboard.tsx`
  (phase 2 adds `shapeUtils` and the Board button: combine with
  `src/style/shapeUtils.ts` and the new components) and
  `e2e/whiteboard.e2e.ts`. Then update `e2e/boards.e2e.ts` for the new
  camera (100% = page fills the window; tests use a 16:9 window) and the
  style panel over the top-left of the page, and run every e2e.
