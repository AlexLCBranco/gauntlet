# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step.

## NOW (2026-10-19): parity + backup DONE on `phase-2` — WAITING for the owner's re-test

Status: every item below is done and pushed to `phase-2` (NOT live). Preview
for the re-test: https://gauntlet-home-git-phase-2-alexlcbrancos-projects.vercel.app/whiteboard/
(Backups page: same address, `/backups/`). Tests: `node scripts/local-e2e.mjs`
51 + Linkkit 14 pass; `npm test` 68 pass; on the preview 45 pass, 3 can't
run there (see "Preview limits"). NEXT: wait for the owner. Do not go live,
do not start phase 3.

Preview limits (not bugs of this build): /boardkit on a preview is the LIVE
Boardkit (main, v0.0.95), and Linkkit shows its "moved" notice on previews,
so (a) parity "C11: a card dropped on the top edge ... Boardkit itself too"
fails its Boardkit-itself half there, and (b) the two backup e2e that make
a Linkkit map can't run there. All pass locally.

BOARDKIT CRASH FIX: LIVE (owner, 2026-10-19). Boardkit `main` `7815ec7`,
v0.0.96: the top-edge drop fix (c4af6dc + 1e3a413) AND the drag-save fix
(5d8d004 + 0108856: a card moved into another list and dropped there was
shown moved but never saved), which that drop also needs to land. Crash
on live before the fix: the whole Boardkit page went blank; nothing was
lost but that one move (saves run 400 ms after each edit, outside React;
a reload showed everything, the card back in its old list). Parity
"C11: a card dropped on the top edge ... Boardkit itself too" now passes
on the phase-2 preview against the live Boardkit. Boardkit's `whiteboard`
branch has the same changes; merge Boardkit `main` into it before its own
merge (conflicts in DragContext.tsx/package.json: keep whiteboard's, v0.0.96+).
Boardkit `npm audit`: 7 high, all in the shadcn CLI (dev tool), fix is a
major upgrade (shadcn 1.0): owner to decide.

SPEED CHECK: `e2e/perf.e2e.ts`, Playwright project "perf", the teardown
of the main suite (runs after every other e2e, also when some failed, one
worker; a filtered run also runs it). Limits in whole screen refreshes
with half a refresh of margin (median <= 2, p95 <= 4 refreshes): it had
failed alone too, the old limits sat on refresh steps. 10/10 isolated
runs pass. Note: Boardkit's real components are heavier than the old
copy (zoom p95 3 refreshes, was 2).

BACKUP: LIVE on `main` since 2026-10-19 (owner shipped it on its own, via
branch `backup-live`; 28 e2e pass live), see main's HANDOFF.md. `main` already had a /backup/ page (a side
session, live): automatic backups were added to THAT page, same file
format. When `main` is merged into `phase-2`: drop phase-2's own
`src/backup/` version (snapshot.ts, store.ts, BackupsPage.tsx,
/backups/, e2e/backup.e2e.ts) and take main's; also its links.

Vercel now installs with `npm ci` (vercel.json): with plain `npm install`
it kept a cached Boardkit (every pin says 0.0.95), so the preview ran old
Boardkit code and still crashed.

Backup and go-live: the backup only runs where the new build runs, so the
owner's REAL data (gauntlet-home.vercel.app) gets backed up only once this
build (or the backup part alone) is on `main`. Owner to choose: ship the
backup alone to main first, or with phase 2 after the hand test.

### The owner's request (2026-10-19)

Owner's message (summary): the whiteboard board is a stripped-down copy.
Rule from now on: FULL PARITY WITH BOARDKIT'S BOARDS, except Boardkit's
app-level toolbar (undo/redo, zoom, search, shortcuts dialog, copy board,
download board) — those stay off the board; any the whiteboard lacks go in
"Whiteboard-level ideas" below. Specific failures: (1) a card disappears
while dragged to another list; (2) Enter on an empty composer must add a
blank card at once; (3) card buttons ▤ ○ → missing; (4) list header count,
‹, ▤, ⧉, ○, × missing. Also: write the full control inventory here, make
every item work, an automatic test per control, say why if something can't
work. Then the backup of the real Boardkit + Linkkit data (automatic,
simple restore, restore tested automatically). Work on `phase-2` only, do
NOT go live, update the preview link, then STOP and tell the owner.

Approach chosen (why: a copy will always drift; Boardkit's board is ~5,000
lines of UI + a 1,100-line store with merge/recovery logic): the whiteboard
runs **Boardkit's own code** — its `ListColumn`, `CardItem`, drag context,
menus, store — imported as an npm git dependency from the Boardkit repo
(branch `whiteboard`, pinned commit; NOT Boardkit's `main`, so the live
Boardkit is untouched until go-live). Boardkit changes needed (on its
`whiteboard` branch): selectors read the store from a React context
(default: Boardkit's own store, so Boardkit itself is unchanged), and a way
to open a given board in the store at runtime (embed mode, which already
exists for one board per page). The board being edited uses Boardkit's real
store; the others are drawn by the same components from read-only stores.
`src/boards/record.ts`, `store.ts`, `looks.ts`, `BoardView.tsx` (the copy)
are replaced.

### Parity work — status

DONE (on `phase-2` + Boardkit branch `whiteboard`, pinned in package.json
as a codeload tarball URL — npm git deps resolve to git+ssh, which Vercel
can't fetch):
- The whiteboard board is Boardkit's own code (`src/boards/boardkit.ts`,
  `BoardShape.tsx`; Boardkit `src/app/whiteboard/`). Old copy deleted.
- Owner's 4 problems fixed: card follows the pointer while dragged (overlay
  drawn at page top level, scaled; sortable transforms divided by scale),
  Enter on empty composer adds blank card, card buttons ▤ ○ → ×, header
  count ‹ ▤ ⧉ ○ × all present (Boardkit's own components).
- List resize/auto-fit correct at any zoom (`boardScale`).
- Boardkit bug found and fixed (also affects LIVE Boardkit, fix only on the
  `whiteboard` branch so far): a card dragged into another list and dropped
  without a final reorder (e.g. into an empty list) was shown moved but
  never saved. Test `store/dragSave.test.ts` (failed before the fix).
- Events: inside the board being edited, pointer/key events are marked
  handled for tldraw (not stopped), right-click stays Boardkit's.
- `e2e/parity.e2e.ts`: 15 tests; 11 pass on the dev server.

DONE 2026-10-19 (second session), was "HALF-DONE / BROKEN":
1. Clicks on Boardkit's menus, panels, dialogs and selection bar did
   nothing / ended editing. Real cause (the old guess, tldraw's
   `handleBlurOnPointerDown`, only runs with `?tldraw_preserve_focus`):
   those are React portals, and React sends their events up the React
   tree through the board into tldraw's canvas handlers; tldraw took
   pointer capture on its canvas, so the menu item never got its click.
   Fix: `portalEventsHandled` in `BoardShape.tsx` marks pointer/click/
   touch events coming from outside the board's DOM as handled, so
   tldraw's canvas skips them. NOT stopPropagation: React's also stops
   the native event at React's root, which broke Boardkit's document
   listeners (Escape in the customise panel, the drop of a dragged card).
   Also: Escape that closes a Boardkit menu/panel no longer ends editing
   (`boardkitOverlayOpen`).
2. Esc during a pointer drag: Boardkit marks the lifted copy
   `data-boardkit-lifted` (Boardkit `f5a650d`), `boardkitDragging()` checks it.
3. Parity test 1 hovers the card before "Customise card".
4. `e2e/boards.e2e.ts` uses Boardkit's DOM (`[data-boardkit-board]`,
   `section[data-list-id]`, `article[data-card-id]`) and waits for saves.
5. NEW BUG FOUND by (4) and fixed: dropping a card on the top edge of
   another list's first card crashed the board ("Error", React #185): the
   card flipped between the two lists on every render (nearest-centre
   collision; on the scaled board moved cards measure off by the scale).
   Boardkit `c4af6dc` (branch `whiteboard`, pinned): with a pointer, a card
   crosses only into the list whose column the pointer is in. Changes
   Boardkit itself too (on merge to its `main`: bump its version). Test:
   parity "C11: a card dropped on the top edge ..." (whiteboard AND
   Boardkit itself; failed on the old code).
6. Dev tip: after `node scripts/sync-boardkit.mjs` restart the dev server
   (Vite doesn't pick up node_modules changes despite the watch setting).
   `local-e2e.mjs` joins its arguments into a shell line: use
   `file:line`, not `-g "a|b"`.

BACKUP: BUILT on `phase-2` (2026-10-19), NOT live. `src/backup/`
(README row), page `/backups/` (link on the home page toolbar and in the
whiteboard's main menu). Backs up every `boardkit:`/`linkkit:`/`gauntlet:`
localStorage key + Boardkit's and Linkkit's IndexedDB `kv` stores (images,
folder link) into IndexedDB `gauntlet-backups`: 3 s after opening `/`,
`/whiteboard/` or `/backups/` and every 10 min, only if changed; keeps the
newest 30 + one a day for 90 days. "Restore this" asks first, backs up the
current data ("Before a restore"), then writes the backup back (records
with a `rev` get rev above the current one so open tabs adopt them).
Download as a .json file / "Restore from a file" (images inline; the
folder link can't go in a file). It never creates the apps' databases.
Tests: `src/backup/snapshot.test.ts` (10), `e2e/backup.e2e.ts` (5: auto
backup on the home page, wipe, restore, Boardkit/Linkkit show it; file
round trip; rev; no stray databases; links). It only protects data on an
address where the new build runs: real data is protected once this is
live (owner's go-live condition (2)). Original plan was: gauntlet `src/backup/` — automatic
snapshots of every `boardkit:*`/`linkkit:*` localStorage key (and Boardkit's
image IndexedDB) into a separate IndexedDB on each load of / and /whiteboard
and every ~10 min while open (keep recent + one per day), a "Backups" page
listing them with one "Restore this" button (it first snapshots the current
state), download/restore from a file; e2e: seed, back up, wipe, restore,
compare. Note: the folder at OneDrive/Desktop/boardkit-backups has only one
file (2026-10-06): Boardkit's own folder auto-backup is not running for the
owner. Then update the preview link and STOP for the owner's re-test.

### Boardkit board inventory (source: Boardkit `whiteboard` branch, b80beb8)

Every control, menu, shortcut and gesture on Boardkit's boards, lists and
cards. "Kept" = on the whiteboard board (works, through Boardkit's own
code). Test column: the e2e in `e2e/parity.e2e.ts` that checks it.

**Board**
| # | Control | Where in Boardkit | Whiteboard |
|---|---|---|---|
| B1 | "+ Add a list" composer (Enter adds, blank allowed, keeps open) | `BoardCanvas` AddListSlot | kept |
| B2 | Drag a list by its header to reorder | `DragContext` | kept |
| B3 | Marquee: drag on empty board area selects cards (Shift adds), click empty clears | `useMarqueeSelection` | kept |
| B4 | Selection bar: count, Copy, Number emphasis, Highlight colour + style, ↺ reset, × let go | `SelectionBar` | kept |
| B5 | Background colour / image (shown) | `BoardBackdrop` | kept (shown; set in Boardkit's toolbar, see W-ideas) |
| B6 | Read-only board saved by a newer Boardkit | `inert` rail | kept |

**List header** (left to right)
| # | Control | Whiteboard |
|---|---|---|
| L1 | keep/maybe/cut status badge (set in Linkkit) | kept |
| L2 | list icon | kept |
| L3 | title: click to rename (blank allowed) | kept |
| L4 | card count (or number range when numbering continues) | kept |
| L5 | ‹ Collapse list (and click the strip to expand; strip is a drop target) | kept |
| L6 | ▤ thots for every card: hidden → pregame → postgame | kept |
| L7 | ⧉ Copy list as image | kept |
| L8 | ○ Customise list: colour (palette, custom picker, recent colours), icon, numbers format (plain/roman/letters/#/01/hidden), checks on/off, thots single/double, numbering restart/continue | kept |
| L9 | × Delete list (asks first; goes to trash) | kept |
| L10 | Right-click header (or strip): Collapse/Expand, Duplicate list, Continue numbering, Check circles, Just one thots box, Move/Copy list to another board, Delete list… (collapsed) | kept |
| L11 | Right edge: drag to resize (Alt every list, Shift match), double-click to fit (Alt all, Shift copy width) | kept |
| L12 | "+ Add a card" composer: Enter adds a card, **Enter on empty adds a blank card at once** and stays open | kept |
| L13 | "Paste N cards" / × cancel paste (after Copy) | kept |
| L14 | "List is full · 50 cards max" note | kept |

**Card**
| # | Control | Whiteboard |
|---|---|---|
| C1 | number (format + emphasis from list/card) | kept |
| C2 | check circle: click cycles marks | kept |
| C3 | keep/maybe/cut badge, cut cards faded | kept |
| C4 | title: click to rename; right-click selected text → Move to thots | kept |
| C5 | right-click card toggles its thots | kept |
| C6 | thots row: ▾ label hides, ⇄ flips pregame/postgame, text editable, links clickable | kept |
| C7 | → Move or copy card to another board (menu: board → list) | kept |
| C8 | ▤ show/hide thots | kept |
| C9 | ○ Customise card: colour, highlight colour + style, card type (normal/divider/note…), number emphasis | kept |
| C10 | × Delete card (to trash; asks when trash is full) | kept |
| C11 | Drag a card within / across lists, onto a collapsed strip; **the card follows the pointer the whole time**; Esc cancels | kept |

**Keyboard** (Boardkit's shortcut registry, while the board is edited)
| # | Keys | Whiteboard |
|---|---|---|
| K1 | Ctrl+Z / Ctrl+Shift+Z undo/redo board edits | kept |
| K2 | Ctrl+C copy selected cards, Ctrl+V paste into list under pointer | kept |
| K3 | Esc: clear selection, then copied cards (then, on the whiteboard, ends editing) | kept |
| K4 | Card: arrows move focus, N / Shift+N new card below/above, E or F2 rename, T thots, Delete to trash | kept |
| K5 | List header: ←/→ focus lists, ↓ first card, D duplicate, C collapse | kept |
| K6 | Space + arrows: keyboard drag (dnd-kit) | kept |

**Excluded (owner): Boardkit's app toolbar and header** — undo/redo
buttons, zoom (− 100% +), search (Ctrl+K), keyboard-shortcuts dialog (?),
copy board as image, download board (PNG/PDF); also the page header (board
switcher, theme switch, trash panel) and version badge.

### Whiteboard-level ideas (from the excluded Boardkit tools; for later, not built)
- W1 Search across every board/map on the whiteboard (Boardkit's Ctrl+K).
- W2 Download / copy a page (or selection) as PNG/PDF (Boardkit's copy and
  download buttons).
- W3 Keyboard-shortcuts help listing the whiteboard's and the boards' keys.
- W4 Board background (colour/image) is set from Boardkit's toolbar, which
  isn't on the whiteboard: set it in /boardkit for now, or add it to the
  whiteboard's style panel later.
- W5 Restoring deleted cards/lists (Boardkit's Trash panel, in its header):
  use /boardkit for now.

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
gauntlet-home.vercel.app has a backup the owner can restore. Backup BUILT
on `phase-2` (see NOW); it protects the real data once it runs on main. The old home page (/) stays; revisit after
phase 3.

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
9. DECIDED 2026-10-19 (PROJECT.md DECISIONS) — (a) goes live only after
   the owner's hand test AND a restorable backup of the real Boardkit +
   Linkkit data (to build next, before any go-live); (b) the home page
   stays until after phase 3.
10. DONE 2026-10-19 — Preview without login for the owner's hand test (see
   top). Boardkit needed a change: it showed "moved" on every address but
   gauntlet-home.vercel.app, so previews had no Boardkit. Boardkit
   v0.0.95 (`85fa689`, its repo): `isPreviewAddress` runs the app on
   `gauntlet-home-…-alexlcbrancos-projects.vercel.app`, automatic folder
   backups off there (unit tests). After it deployed, boards + whiteboard
   e2e passed on the preview (27, incl. the tldraw key); live still
   phase 1 (whiteboard + canvas e2e 22 pass live, no Board button).
11. NEXT — wait for the owner's hand test. Then the backup of the real
   data (decision (a)), then go-live only on the owner's word.

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
- Phase 2 is done on `phase-2`; wait for the owner's hand test (preview
  link at the top). Then the backup of the real data, then go-live only on
  the owner's word. Do not start phase 3.
- Swap in the hobby key when it arrives, before 2026-11-01 (see top).
