# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step.

## NOW (2026-10-19): Linkkit v0.0.106 (`19b4672`): an explicit zoom sticks; stale names reported

1. Stale linked name, CORRECTED. My earlier HANDOFF wording ("Party" "linked
   to a board renamed since") was wrong: in the owner's backup the board is
   still "Party" (boardkit:registry and the stored map name agree); what
   changed is a CARD (Wm1QQoPvlq: stored "Snacks", board now "i changed this
   it was SNACKS again"). Card/list names: every reader goes through
   `openLinked` (Linkkit persistMap.ts:716), so all show the live names.
   A renamed BOARD does go stale (checked with a throwaway unit test, not
   kept: open map "Relocate"; registry, boardLinks, stored copy "Move?";
   nothing written). Readers showing the STORED name: Linkkit map list /
   "All maps" / "Find a map" (MapSwitcher.tsx:89 `s.maps` from
   `loadRegistry` persistMap.ts:93; `switchMap` mapStore.ts:1642 keeps the
   old list entry; search mapMenu.ts:29), registry repair persistMap.ts:117,
   "Map from a Boardkit board…" "Linked to 'X'" (persistMap.ts:560 ->
   bridge.ts:829-830), gauntlet canvas widget name (Canvas.tsx:386), Overview
   (Overview.tsx:95), Add widget list (AddStone.tsx:24,33) via
   sources.ts:35, Boardkit delete-board dialog (Boardkit linkedMap.ts:69-73
   -> BoardSwitcher.tsx:183-184). Showing the LIVE name: Linkkit header
   (MapSwitcher.tsx:88), chip (BoardLink.tsx:116), export
   (mapStore.ts:607 -> loadMap), automatic backup (autoBackup.ts:176), copy
   image (useCopyImage.ts:16), Export menu PNG/SVG/Mermaid
   (ExportMenu.tsx:31,42,65), frames (mapStore.ts:653). Raw copies (stale +
   board record, re-derived on open): gauntlet /backup/ file; its summary
   only counts (format.ts:186). Proposed, NOT built (owner decides): those
   readers take a linked map's name from boardkit:registry, read-only, in
   Linkkit (loadRegistry result in memory, boardLinks, switchMap upsert),
   gauntlet sources.ts and Boardkit findLinkedMap. Opening still writes
   nothing.
2. Explicit zoom sticks (owner): a pill zoom is stored for the map, 100%
   included, and that map is never fitted again; never-zoomed maps keep the
   fit; stored only on the click. viewStore `zoomChosen` removed (the entry
   now says it). fitview e2e: fitted map -> pill 100% -> reload -> 100%, all
   other linkkit:* keys unchanged (failed on v0.0.105: reopened at 29%).
   bracket.e2e.ts workaround kept: that test never uses the pill before its
   reload, so a saved bracket still opens fitted.
3. Confirmed done in v0.0.104 (`1a89a0b`): header e2e with a box selected,
   Tips toggle (`e2e/tips.e2e.ts`, 2 tests).
Standing rule (owner): never pipe test commands through tail/head/grep
without pipefail; capture the real exit code.
Results (real exit codes): unit 964 pass, build + lint exit 0 (2 old
warnings); local `node scripts/local-e2e.mjs` exit 0: gauntlet 72 pass
(incl. 5 real-data) + Linkkit 19 pass. Live (exit 0 each): Linkkit 19
pass; gauntlet 67 pass, 5 skipped (real data: local only).

## Earlier (2026-10-19): Linkkit fit to view on open (v0.0.105, `dfa2412`, LIVE)

Owner's OK (2026-10-19) on the proposal below: a saved map with no zoom of
its own opens fitted to the window (never above 100%, down to 10%) and
scrolled to its boxes; the fit is for the visit only (viewStore `fits`),
never in `linkkit:zoom` or the map; the pill wins (stores the map's own
zoom; a map set with the pill, even to 100%, isn't refitted that visit).
Decided while building: fits once per opening (no refit on resize or
edit); maps made this visit (new, duplicate, template, board, restore)
show at 100% where names are typed (`savedBeforeThisVisit`, mapStore);
the page is `data-ready` only after the fit, so a frame's remembered
scroll (`gauntlet:scroll`) is applied after it and wins. A map put back to
100% has no `linkkit:zoom` entry, so it is fitted again next visit.
Tests: `zoom.test.ts`, `viewStore.test.ts`, `e2e/fitview.e2e.ts` (on;
failed on v0.0.104); `bracket.e2e.ts` pin test resets to 100% after its
reload (a saved bracket now opens fitted). Results: unit 964 pass, build +
lint clean (2 old warnings); local `node scripts/local-e2e.mjs` gauntlet
72 pass (incl. 5 real-data: opening each of the owner's 18 maps still
changes no byte) + Linkkit 19 pass. Live: Linkkit 19 pass; gauntlet 67
pass, 5 skipped (real data: local only).

## Earlier (2026-10-19): Linkkit v0.0.104, four asks

Linkkit `1a89a0b`, LIVE. Owner's 4 asks:
1. Fit to view on open: (then) NOT BUILT, WAITING; now built, above. View state is already
   persisted: each map's zoom in `linkkit:zoom` (Linkkit
   `src/store/viewStore.ts`, `{ "<map id>": 1.5 }`, written only by the
   zoom pill, 100% = no entry), the align spot for all maps in
   `linkkit:align` (choosing one MOVES boxes, an undo step), and a
   frame's scroll in gauntlet's `gauntlet:scroll` (`src/canvas/storage.ts`,
   restored by `stone:scroll-to`). The owner said to report this before
   changing anything. Also: the pill's minimum is 50%, too little for a
   wide map at 481 px. Proposal given: a session-only fit zoom (never
   written to `linkkit:zoom`), used when the map has no remembered zoom,
   below 50% if needed; the pill (and a remembered zoom) wins. Test
   written: Linkkit `e2e/fitview.e2e.ts` (19-box tree, reload at 957x910
   and 481x910, every box inside the canvas, stored map byte-identical);
   fails on v0.0.104 (11 of 19 off screen at 957x910); `test.fixme` until
   the fix.
2. Stale linked name: INVESTIGATED, nothing changed. The real case
   ("Party", map ZX4KCqADxR) is a CARD: stored box "Snacks", board card now
   "i changed this it was SNACKS again". Stored box names are read only
   through `openLinked` (persistMap.ts:716), so display, export
   (`mapsForExport`, mapStore.ts:607), automatic backup (autoBackup.ts:176),
   frames and other tabs all get the board's names. Only a map's OWN name
   could lag (board renamed in Boardkit; not the case in the owner's data):
   read raw by Linkkit's map list/search (`loadRegistry`, mapStore.ts:624),
   `boardLinks` (persistMap.ts:546, "Linked to 'X'" in "Map from a Boardkit
   board…") and gauntlet `src/domain/sources.ts:35` (widget names, Add
   stone list, Overview). Owner decides.
3. Header test: `e2e/header.e2e.ts` also runs a tree with a box selected
   ("+" enabled), 481-1400 px. Passes local + live.
4. Tips: the hint under Linkkit's header is behind a "Tips" toggle, open
   from 700 px, closed below; the user's choice (`linkkit:ui-prefs`,
   `{ "tips": "open"|"closed" }`) wins, try/catch, never map data. Linkkit
   `e2e/tips.e2e.ts` (2 tests, incl. storage blocked).
Results: Linkkit unit 958 pass, build + lint clean (2 old lint warnings).
Local `node scripts/local-e2e.mjs`: gauntlet 71 pass + 1 FAILED
(`fullpage.e2e.ts:314`, a Boardkit board widget not visible in 5 s; passed
13/13 on rerun: flaky under load), incl. the 5 real-data tests; Linkkit 18
pass, 1 skipped (fitview). Live: Linkkit 18 pass, 1 skipped; gauntlet 67 pass, 5 skipped (real
data: local only).

## Earlier (2026-10-19): Linkkit opening is read-only (Linkkit v0.0.102)

Owner's task: opening a map in Linkkit must never change or save box
positions; bracket layout deterministic; window size never changes saved
positions (a smaller window shows part of the map, as on the whiteboard).
Fixed in Linkkit (its repo, `main`). Causes found (all three wrote on
open, all three fixed):
1. `MapCanvas` laid every saved bracket out again once per open
   (`refitBracket`), page size from the window. Now a bracket is laid out
   again only after an edit while it is open (a name, a result, rounds
   hidden/shown), and always in the same room (`layoutRoom`: the content's
   own size, top-left), so positions and page are the same in any window.
2. The "keep a grown box on the page" effect treated every box as
   "resized" the first time it was measured after opening, so any box past
   the window's edge was pulled in and saved (14 of the owner's 18 maps at
   half width; kqdHATDCm4 at 1366x768). Now only boxes the user changed or
   added (`resizedByEdit`).
3. A map linked to a board saved the board's newer names on open
   ("Party": "Snacks" renamed in Boardkit). Now it shows them and stores
   them with the next edit's save.
Also: Linkkit now runs on previews of this site (`isPreviewAddress`, as
Boardkit), with its automatic folder backups off there.
Tests: real data `e2e/realdata.e2e.ts` "opening each Linkkit map at
WxH changes no stored map, not one byte" (3 sizes; every map opened in
Linkkit and in a frame, the bracket "Untitled" reopened 4 more times;
failed on the old Linkkit at every size). Linkkit `e2e/readonly.e2e.ts`
(throwaway bracket + tree, reload/reopen at 3 sizes, bracket re-laid out
at half width = the wide layout; failed on the old code). Unit:
Linkkit `page.test.ts`, `persistLinked.test.ts`, `address.test.ts`.
LIVE (Linkkit a03ad3a, gauntlet a93e50d). Results: local `node scripts/local-e2e.mjs` gauntlet 72 + Linkkit 15 pass (incl. 5 real-data); live: gauntlet 67 pass / 5 skipped (real data: local only), Linkkit 15 pass; phase-2 preview: readonly.e2e passes, and backup.e2e x2 + canvas "add stones" (the 3 that could not run on previews) now pass there.
FIXED (Linkkit v0.0.103, `029d2bf`, LIVE): at 957 px Linkkit's "+" covered
"Switch map". Cause: the header was one non-wrapping row needing ~1064 px;
below that the map switcher shrank to 0 px and its chevron overflowed
under "+" (greyed out = opacity 0.5 = painted on top), and the right-hand
buttons ran off the window. The header now wraps. New Linkkit
`e2e/header.e2e.ts` (every header button on screen and clickable, "Switch
map" opens, 481-1400 px; failed on the old live build), and
`readonly.e2e.ts` no longer widens the window to clean up. Live: Linkkit
e2e 16/16 pass.

## Earlier (2026-10-19): phase 2 is LIVE (owner's OK, 2026-10-19)

LIVE: Boardkit `main` fast-forwarded to `whiteboard` (`1a9f283`, v0.0.97,
deployed); gauntlet `main` = `phase-2` merged (`f38e496`, deployed).
`npx playwright test` against gauntlet-home.vercel.app: 67 pass, 4
skipped (real data: local only). NEXT: the owner's next round (below);
Linkkit position findings (Real-data check) are the owner's call. Branches
`phase-2` and Boardkit `whiteboard` stay (not deleted).

### How it got here: phase 2 go-live round

Owner (2026-10-19): phase 2 passed the hand test; `fullscreen-page` kept,
with fixes. This round, in order: (1) fullscreen fixes, merge into
`phase-2`, delete the branch, test with the owner's real backup; (2) no
board background on the whiteboard; (3) go-live prep, then STOP before
merging anything into `main` of either repo. All done; nothing merged into
any `main`. Preview: https://gauntlet-home-git-phase-2-alexlcbrancos-projects.vercel.app/whiteboard/

NAMING (owner): things placed on the whiteboard (Boardkit boards, Linkkit
maps, ...) are "widgets", not "stones", in comments, docs and here. Done
in comments/docs; identifiers, the home page's UI text ("+ Add stone") and
the embed protocol's message names (`stone:ready`, ...) keep their names.

### 1. Fullscreen, Excalidraw-style — DONE, in `phase-2` (merge `c08c514`; branch `fullscreen-page` deleted, local and GitHub)
- The page (`pageBox`, `src/pages/camera.ts` `pageForWindow`,
  `keepFilled.ts`) is at least the window's size at 100% and as big as its
  content. A smaller window (e.g. snapped to half the screen) keeps the
  zoom and the content's size and place on screen (tldraw keeps the camera
  on a resize); you pan (hand tool, wheel, Space+drag) to the rest, and
  panning stops at the page's edges. As big or bigger window: the page
  fills it, no bars. Resizing never changes the zoom or moves content.
  Zoom out stops where the page still covers the window (`coverZoom`, only
  below 100% on a page bigger than the window both ways). A page opens at
  100%, top-left. 100% = one page unit per screen pixel (the label is
  `zoom x 100`, no longer relative to a "fill" zoom).
- Edge wall (`src/pages/edgeWall.ts`): while dragging, the dragged item
  (shape, picture, board widget, multi-selection) stops at the page's edge
  and slides along it; a resize handle stops at the edge (free resize:
  the handle is held at the edge; locked aspect, e.g. a board or picture:
  the furthest size that fits); a line's end and a pen stroke stop at it
  while drawing. tldraw has no hook for this: the select tool's Translating
  and Resizing states are wrapped on the editor's instances, inside
  tldraw's "ignore changes" block. `keepInside.ts` still pulls back
  anything else (paste, arrow-key nudge) after the pointer is up.
- Tests: `e2e/fullpage.e2e.ts` (13): no bars at 1915x910/1366x768; empty
  page follows the window, zoom kept on every resize; 1915x910 -> half
  width -> quarter: zoom 100%, content not moved/resized, still at the same
  screen place, wheel/Space+drag/hand pan reach every edge and stop there,
  back to full size = the original camera exactly; old 1920x1080 content
  at 5 window sizes; two tabs; dragging past each of the four edges at
  1915x910 and at half width (inside the page at every step, reaches the
  edge, slides, no jump on the drop), a multi-selection (keeps its shape),
  a picture and a board widget, resizing (rectangle on 3 handles, board,
  multi-selection), drawing a rectangle/pen stroke/line past the edge.
  Unit: `camera.test.ts`.
- Linkkit maps aren't on the whiteboard yet (phase 3); the wall is generic
  shape code, so they'll get it too.

### Real-data check — DONE (owner's backup, read at run time)
`e2e/realdata.e2e.ts` restores the owner's backup file
(C:\Users\alexc\Downloads\gauntlet-backup-2026-10-19-1606.json, read from
that path at run time; never copied, committed or uploaded) through the
`/backup/` page's "Restore from a backup file…" in a fresh local browser,
then checks: the whiteboard (2 pages, 22 shapes incl. 4 pictures) at
1915x910, half width and 1366x768: every shape's position, size and
props unchanged, pictures load, 100%, no bars, the page covers every
shape, panning reaches the far corner, the edge wall on a real shape
(Ctrl+Z puts it back); all 11 Boardkit boards in Boardkit and as
whiteboard widgets with every list and card (collapsed lists counted from
their strip), records unchanged, the 1 background picture kept; all 18
Linkkit maps open without one byte of stored data changing (see NOW).
Skipped when the file
isn't there or the site isn't localhost. Run:
`node scripts/local-e2e.mjs gauntlet e2e/realdata.e2e.ts`.
FINDINGS (FIXED 2026-10-19, see NOW): opening a map in Linkkit saved
position changes. (a) A bracket map is laid out again on every open (its
`refitBracket`: positions and page size follow the window); the owner's
"Untitled" bracket (u6GU4wE337, 15 boxes) moves every box even in a window
the size it was saved in. (b) At 1366x768 one box of the tree map
kqdHATDCm4 moves (y 774 -> 732). Nothing is lost. Also seen, expected: a
map linked to a board takes box names from the board ("Snacks" -> the
board's newer title).

### 2. Board background on the whiteboard — DONE (Boardkit `6fb82fd`, whiteboard branch)
Boardkit `src/app/whiteboard/WhiteboardBoard.tsx`: no `BoardBackdrop`, no
panel colour; the lists, the board title (gauntlet's `.gb-name`) and
"+ Add a list" sit on the whiteboard's own background; a background set in
Boardkit is ignored there; standalone Boardkit unchanged. The board is
still selected/moved/resized as before (tldraw's hit area is the whole
box). e2e in `e2e/boards.e2e.ts`: "no panel behind the lists ..." (failed
on the old code: board background rgb(20,22,27)), "the board is selected
and moved by pressing the empty space between its lists", "standalone
Boardkit still shows a board's background".

### 3. Go-live prep — DONE, WAITING for the owner's OK
- `main` merged into `phase-2` (`3da2016`): phase-2's own `/backups/` page
  (`snapshot.ts`, `store.ts`, `BackupsPage.tsx`, `backups/`, its e2e) is
  gone; the live `/backup/` page and its automatic backups are taken as
  they are live (same database `gauntlet-auto-backups`, so backups kept
  before are still listed). The whiteboard's main menu "Backups" opens
  `/backup/`; the home page keeps its live "Backup" link. e2e
  `auto-backup.e2e.ts` "the whiteboard keeps backups by itself too, its
  Backups menu item opens /backup/, and backups kept before are still
  listed there".
- Boardkit: local folder back on `whiteboard`; Boardkit `main` merged into
  it, v0.0.97 (`1a9f283`), pushed. It contains `main`, so merging it into
  Boardkit `main` is a fast-forward. Boardkit build + 201 unit tests pass.
  gauntlet pins `1a9f283` (package.json, codeload tarball).
- Go-live steps, ONLY on the owner's OK: (1) Boardkit:
  `git checkout main && git merge --ff-only whiteboard && git push` (live
  Boardkit v0.0.97); (2) gauntlet: `git checkout main && git merge
  phase-2 && git push` (live site); (3) run the whole e2e against
  gauntlet-home.vercel.app; (4) tell the owner.
- Test results: (2026-10-19, after the last merge and pin) `npm test` 80 unit + 5
  proxy pass, build + lint clean; `node scripts/local-e2e.mjs` 71 + Linkkit
  14 pass (incl. the 4 real-data tests). On the phase-2 preview 63 pass, 4
  skipped (real data: local only), 3 can't run there (backup.e2e x2 and
  canvas "add stones": they make a Linkkit map; the known preview limit),
  1 failed and was fixed (`6493a08`: the picture/board drag test pressed the
  wrong widget where the two overlapped; now passes on the preview and
  locally). Boardkit: build, 201 unit pass; `npm audit` 7 high (shadcn CLI,
  left as is).

### Questions the owner asked (answered 2026-10-19)
- "Card images" in the backup report: wrong. Boardkit cards have no
  pictures. The pictures in Boardkit's IndexedDB (`boardImage:<id>`) are
  BOARD BACKGROUND pictures (the owner has 1, on the board "example"). The
  words came from phase-2's old `snapshot.ts` (now deleted); README and the
  backup page now say "background pictures". The backup also keeps the
  whiteboard's own pictures (tldraw's IndexedDB).
- Is "100%" accurate? Yes now: 100% = one page unit per screen pixel
  (`zoomPercent(zoom) = round(zoom x 100)`). Before, 100% meant "the page
  fills the window", which on a page bigger than the window was really a
  zoomed-out view.

### NEXT ROUND — recorded, NOT started (owner, 2026-10-19)
- Create widgets from inside the whiteboard: the insert menu gets "New
  board" and "New map" next to adding existing ones, so the owner never
  has to leave the whiteboard to make one.
- Boardkit: cards can have images (not in Boardkit today, not even on its
  site). Build it in Boardkit itself, so it works on the site and inside
  the whiteboard.
- Boardkit `npm audit` (7 high, in the shadcn CLI): leave as is; revisit
  only if we add new shadcn components.

Preview limits (not bugs of this build): /boardkit and /linkkit on a
preview are the LIVE Boardkit and Linkkit (each one's `main`); Linkkit
runs on previews since v0.0.102 (it showed its "moved" notice before, so
tests that make a Linkkit map couldn't run there); the real-data test runs
only locally.


## Earlier (2026-10-19): parity + backup on `phase-2` — hand test PASSED (owner)

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
(DONE 2026-10-19: merged, v0.0.97, see NOW 3.) Boardkit `npm audit`: 7
high, all in the shadcn CLI (dev tool); owner: leave as is (NEXT ROUND).

SPEED CHECK: `e2e/perf.e2e.ts`, Playwright project "perf", the teardown
of the main suite (runs after every other e2e, also when some failed, one
worker; a filtered run also runs it). Limits in whole screen refreshes
with half a refresh of margin (median <= 2, p95 <= 4 refreshes): it had
failed alone too, the old limits sat on refresh steps. 10/10 isolated
runs pass. Note: Boardkit's real components are heavier than the old
copy (zoom p95 3 refreshes, was 2).

BACKUP: phase-2 now uses main's live /backup/ page (see NOW, 3).

Vercel now installs with `npm ci` (vercel.json): with plain `npm install`
it kept a cached Boardkit (every pin says 0.0.95), so the preview ran old
Boardkit code and still crashed.


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
| B5 | Background colour / image | `BoardBackdrop` | NOT on the whiteboard (owner, 2026-10-19): no panel or background behind the lists there; Boardkit itself still shows it |
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
- W4 (dropped, owner 2026-10-19) Board backgrounds aren't shown on the
  whiteboard at all; set and seen in /boardkit only.
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

## Current phase: 2 (Boardkit as a live object), on branch `phase-2` — DONE 2026-10-19, hand test PASSED (owner), go-live prepared (see NOW)

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
