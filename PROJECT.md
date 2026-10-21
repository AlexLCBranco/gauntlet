INSTRUCTIONS FOR EVERY SESSION (read first)
1. PROJECT.md (this document) is the plan. Every session starts by reading
   PROJECT.md, then HANDOFF.md.
2. Build ONE PHASE at a time (see section 6). Do not start the next phase
   or anything else, even if it looks easy or related.
3. When a phase is done and its automatic tests pass, STOP. Tell me in
   plain words (I'm not a developer):
   - what was built,
   - what I should try by hand to check how it feels,
   - anything that didn't work or that you had to change from this plan.
   Then wait for me to say "go to phase N".
4. Follow the HANDOFF RULES (section 7) in every session.

GAUNTLET HOME — WHAT I WANT

The idea: the home page IS the app. It's a whiteboard with live widgets.
Boardkit (lists + cards) and Linkkit (boxes + arrows maps) are not websites
shown on the whiteboard; they are kinds of objects you place on it, like
Excalidraw's rectangle tool. Today I can only bring them into Excalidraw as
screenshots. That's the problem this solves.

0. Foundation
   - Build on the tldraw SDK (tldraw.dev), not Excalidraw's code and not
     from scratch. Reason: boards and maps must be real canvas objects that
     scale, stay editable, and take arrows to single cards. tldraw is built
     for custom objects; Excalidraw treats outside things as embedded windows.
   - License: free in development. For the live site, use the free hobby
     license (non-commercial, keeps the "made with tldraw" watermark).
     If this ever becomes a paid product, it needs a commercial license.
   - I'm used to Excalidraw. Make it FEEL like Excalidraw: same kind of
     toolbar, same keyboard shortcuts where possible, same simple look.
   - Write automatic tests for everything that can be tested automatically.
     I only want to check by hand how it feels.

1. Floor: everything Excalidraw does
   Drawing, shapes, arrows, text, selecting, smooth zoom and pan.
   - LASSO selection is required from day one: draw a free loop around
     things to select them, in addition to the normal box drag-select.
     If tldraw doesn't have it built in, build it in phase 1. Adding it
     later has been a pain every time.
   - Lasso and box selection must work on everything, including cards
     inside boards and boxes inside maps.

2. Pages
   - Not infinite. In Excalidraw you get a default page and can scroll up
     and down forever. In the gauntlet a page is BOUNDED: at 100% it is at
     least the window's size and it grows only with what is on it; you
     can't scroll or drag anything past its edges (DECISIONS 2026-10-19).
   - If I want more space, I go to a new page. Two arrow buttons in the
     bottom-right corner: previous page and next page.
   - Pressing "next" on the last page creates a new empty page.
   - Each page is its own sheet. Nothing sits across two pages.
   - Each page is a unit: I can name it, jump to it and reorder it (from
     the page list that "2 / 4" opens). No present mode (DECISIONS
     2026-10-20).

3. Boards and maps on the whiteboard
   - Think "LIVE SCREENSHOT": a board or map sits on the page like a pasted
     image, but everything inside it is real and editable.
   - I resize it like an image by dragging its corners; the whole thing
     scales up or down, content included.
   - I edit the content right there: add, rename, move, and delete cards
     and boxes without opening anything.
   - It's part of the drawing, not a window. No frame with its own
     scrollbar, nothing hidden inside. It zooms with everything else.
   - A board and its synced map are ONE object that flips between list view
     and map view. I can split it to show both side by side when I want.

4. Cards can go anywhere
   - Drag a card into another board, into a map (it becomes a box), or loose
     onto the whiteboard (like a sticky note), and back again.
   - Dragging MOVES the card. Holding a key while dragging makes a copy.
   - If a card leaves a board that's synced with a map, it leaves the map too.

5. Better than Excalidraw (all required)
   a. Notes stick to things: a note attached to a card follows it when it moves.
   b. Arrows connect to anything (a single card inside a board, a single box
      inside a map) and stay attached when things move.
   c. Templates: build a layout once (e.g. a game + tv tag + notes box) and
      stamp it out many times, or for each new page.
   d. Snap and align into clean columns and grids, no hand-nudging.
   e. Live data instead of screenshots (schedules, scores, injury reports).
   f. Agent: paste a screenshot and it becomes real cards on the page.

6. Build order (each phase must be usable on a real page before the next)
   Phase 1 — The floor: whiteboard, drawing tools, box select + lasso,
             zoom and pan, fixed pages, next/previous arrows.
             Test: I can rebuild my 20/10 betting page by hand in it.
   Phase 2 — Boardkit as a live object: resize from the corners, edit cards
             in place. My existing boards move over from gauntlet-home.
   Phase 3 — Linkkit as a live object, plus the synced board/map object
             that flips and splits.
   Phase 2.5 — Polish round: docs/PHASE-2.5.md, a fixed list. When it's
             done, phase 3 starts.
   Speed session — after phase 3, a dedicated session with boards and maps
             together on a realistic page. Zoom's worst frames are 50-67 ms
             today; measure where the time goes before changing anything.
             No speed work before then.
   Phase 4 — Things connect: cards go anywhere, notes stick to cards,
             arrows attach to single cards and boxes (5a, 5b).
             Owner's decision (2026-10-20): cards become real whiteboard
             objects: directly clickable, draggable, selectable by box and
             lasso, with no double-click to enter a board first. A board
             works like a frame: a named container, moved and resized as a
             whole by its title bar or by selecting it. No interim "two
             clicks" mode is to be built.
   Phase 5 — Speed: templates and snap/align (5c, 5d).
   Phase 6 — Outside world: live data and the screenshot agent (5e, 5f).
             Each is its own project; don't start before phases 1–5 are solid.

7. HANDOFF RULES (I switch between Claude and other agents when I run out
   of credits; a session can be cut off at ANY moment without warning)
   - ONE agent works on this repo at a time. Never two at once.
   - PROJECT.md is the single source of truth. Read it fully before
     touching anything, then read HANDOFF.md.
   - Keep a file called HANDOFF.md and update it AFTER EVERY STEP, not
     just at the end, because the session may stop mid-task. It contains:
       * current phase and what's done in it,
       * what's half-done and exactly where it stopped,
       * what's broken or known to be wrong,
       * the next concrete step,
       * any decision made that changes this plan, and why.
   - Work in small steps. Save each step with a clear description as soon
     as it works, so a cut-off never loses more than the current step and
     a bad change can be undone alone.
   - HANDOFF.md never exceeds 100 lines. When a task is done, move its
     entry to docs/HISTORY.md. Open items, broken things, deadlines and the
     next step never leave HANDOFF while still true. If 100 lines is truly
     too tight, say so in the report instead of going over.
   - Keep a DECISIONS section in PROJECT.md. Any change to the plan gets
     written there; never change the plan silently.
   - Any decision the owner makes goes into DECISIONS in the same commit as
     the code, never only into HANDOFF.
   - Phase 2.5 = docs/PHASE-2.5.md, a fixed list. When it's done, phase 3
     starts. During a phase, a new ask from the owner is done right away
     only if it blocks daily use (data loss, something broken or
     unusable); anything else goes to the IDEAS section at the end of
     PROJECT.md, and the agent tells the owner so instead of building it.
   - Before saving a step, run the automatic tests. If something is left
     broken, say so at the top of HANDOFF.md.
   - Code must be organized so each part (whiteboard, pages, boards, maps,
     connections) lives in its own clearly named area, and a new agent
     can understand one part without reading everything.

How I use it: a page holds items (like a game) each with my notes next to
them, packed densely in columns, plus my lists. Everything should feel fast
and fluid; that matters more than features.

DECISIONS

Changes to the plan, newest last. Each says what and why.

- (replaced by 2026-10-20, the whiteboard IS the gauntlet) 2026-10-18 — During phase 1 the whiteboard lives at /whiteboard, not the
  home page. The home page (/) still shows the older iframe canvas
  ("stones"): it holds the owner's current layout and Linkkit's e2e tests
  use it. The whiteboard takes over / when it can replace it (to decide
  with the owner, at the latest when boards move over in phase 2). The
  older canvas is documented in GAUNTLET-PLAN.md and in git history
  (PROJECT.md before 2026-10-18).
- 2026-10-18 — The live site needs the owner's free tldraw hobby license
  key. Without one, tldraw hides the editor on the live site after 5 s (it
  works on localhost without a key). The key goes into the build as
  VITE_TLDRAW_LICENSE_KEY.
- (replaced by 2026-10-19, page size) 2026-10-18 — tldraw 5.5.2. Page size: one 1920 x 1080 sheet per page
  (16:9, so a page is also a slide). You can zoom in, not out past the
  whole sheet, and can't pan past its edges.
- 2026-10-18 — tldraw has no lasso, so phase 1 adds one (key W, toolbar
  button next to Select). It selects what is wholly inside the loop. Box
  select was also set to "wholly inside", as in Excalidraw. Excalidraw's
  number keys 1-0 pick the tools in Excalidraw's order; D is the diamond
  and P the pen (tldraw uses D for the pen).
- (replaced by 2026-10-20, page controls) 2026-10-18 — "Present as a slide" (section 2) is done in phase 1, since
  it belongs to pages: full screen, read-only, arrow keys go page to page.
  Naming, jumping to and reordering pages use tldraw's own page menu (top
  left).
- 2026-10-18 — Phase 2: a board on the whiteboard IS the Boardkit board
  (owner's choice). The whiteboard object reads and writes the same
  `boardkit:board:<id>` record /boardkit uses (same origin, merged by
  `rev`), so an edit shows in both, a linked Linkkit map keeps following,
  and Boardkit's folder backups keep covering it. "Moving my boards over"
  therefore means placing them; nothing is copied, and /boardkit keeps
  working. Deletes go to Boardkit's own trash.
- 2026-10-18 — Phase 2: lasso and box select pick a whole board. Picking
  single cards inside a board comes with phase 4, when cards become
  things that move anywhere (section 1 asks for it; it needs the same work).
- (backgrounds part replaced by 2026-10-19, no board background; undo part
  replaced by 2026-10-20, one undo for the page)
  2026-10-18 — Phase 2, how a board behaves. It is drawn at its natural
  size (Boardkit's list widths, every card shown, no scrollbar) and scaled
  as a whole: dragging a corner sets the scale, aspect kept. Its box follows
  the content (more cards, taller board) but never past the sheet: a board
  that would overflow shrinks to fit. Double-click (or Enter) edits it in
  place: click a title to rename, drag a card to move it, x deletes it into
  Boardkit's trash, "+ Add a card" adds (Enter keeps adding). Escape or a
  click outside ends editing. While editing, Ctrl+Z / Ctrl+Shift+Z undo and
  redo that board's card edits; outside, Ctrl+Z is the whiteboard's (moves,
  resizes). Boardkit's pregame/postgame thots stay hidden, as Boardkit shows
  them by default; background images aren't drawn (colour backgrounds are).
  A full trash refuses a delete instead of forgetting the oldest card.
- 2026-10-18 — tldraw key is a temporary evaluation key, expires Nov 1
  2026; swap for the permanent hobby key when it arrives. It is stored only
  in Vercel (project `gauntlet-home` → Settings → Environment Variables →
  `VITE_TLDRAW_LICENSE_KEY`, Production and Preview), not in the code, so
  swapping is one change: edit that value, then redeploy (Vite bakes it
  into the build). Steps are in HANDOFF.md. The evaluation key shows no
  "made with tldraw" watermark; the hobby key will.
- (replaced by 2026-10-19, page size) 2026-10-18 — Owner's phase 1 fix list (HANDOFF.md). "100%" is the page
  filling the window edge to edge, and nothing outside the page ever
  shows. A window that isn't 16:9 can't show the whole page at once
  without showing outside it, so the page fills the window and its other
  axis runs past: at 100% it pans along that one axis only, up to the
  page's edge. (Present on a 16:9 screen shows the whole page.)
- 2026-10-18 — The style panel is our own, after Excalidraw's (left under
  the main menu), shown only while something is selected (owner: "close
  when nothing is selected"; Excalidraw also shows it while a drawing tool
  is on). Styles tldraw lacks are kept in each shape's `meta`: font size
  apart from stroke width (two sizes smaller than tldraw's smallest) and a
  background colour apart from the outline.
- (replaced by 2026-10-19, page size) 2026-10-18 — Replaces the "100%" part of the fix-list entry above
  (owner's decision after the re-test): "100%" shows the WHOLE page,
  centred; a window that isn't 16:9 gets dark bars at the sides (or top
  and bottom). At 100% nothing scrolls, on any screen. Zoomed in, you pan
  only up to the page's edges (along an axis where the page is still
  narrower than the window it stays centred).
- 2026-10-18 — Undo and redo skip steps that only change the selection, as
  in Excalidraw: one Ctrl+Z undoes a shape just drawn, even after Escape
  (tldraw made deselecting its own undo step). Ctrl+Y also redoes.
- 2026-10-19 — Owner: phase 2 goes live only after (1) the owner has
  tested it by hand AND (2) the owner's real Boardkit and Linkkit data on
  gauntlet-home.vercel.app has a backup the owner can restore. The backup
  is set up before anything goes live.
- (replaced by 2026-10-20, the whiteboard IS the gauntlet) 2026-10-19 — Owner: the old home page (/) stays for now; revisit
  replacing it with the whiteboard after phase 3.
- 2026-10-19 — Page size (owner, phase 2 go-live round, after the
  `fullscreen-page` hand test; was only in HANDOFF). The page is at least
  the window's size at 100% and grows with its content; no bars. A smaller
  window (e.g. snapped to half the screen) keeps the zoom and the content's
  size and place, shows part of the page, and you pan to the rest, up to
  its edges. Zoom out only while the page still covers the window. 100% =
  one page unit per screen pixel. Why: Excalidraw-like fullscreen; the
  dark bars wasted the screen and a resize must never move or rescale
  content.
- 2026-10-19 — Edge wall (was only in HANDOFF). While dragging or
  resizing, the item stops at the page's edge and slides along it (a
  resize handle stops there; a line end or pen stroke too, while drawing).
  Anything else past an edge (paste, nudge) is pulled back after. Why:
  the page is bounded, and pulling things back only after the drop made
  them jump.
- 2026-10-19 — Naming (owner; was only in HANDOFF): things placed on the
  whiteboard (boards, maps, ...) are "widgets", not "stones", in
  comments, docs and reports. Why: "stones" was the old iframe canvas's
  word.
- 2026-10-19 — Boards on the whiteboard show no board background (owner;
  was only in HANDOFF): no panel, colour or picture behind the lists; a
  background set in Boardkit shows only in /boardkit. Why: a board should
  sit on the whiteboard like part of the drawing.
- 2026-10-19 — Vercel previews open without a Vercel login (owner's
  request, so the owner can test without the terminal): project
  `gauntlet-home` → Deployment Protection → Vercel Authentication is off
  (`vercel project protection disable gauntlet-home --sso`). Production
  was already public. To turn it back on:
  `vercel project protection enable gauntlet-home --sso`. Boardkit
  (v0.0.95) runs on these previews, without automatic folder backups, so
  a preview's test boards never reach the real backup folder.
- 2026-10-19 — The backup the owner asked for (entry above) is one page,
  gauntlet-home.vercel.app/backup/, not each app's own export. "Save a
  backup" downloads ONE file with everything this site keeps in the
  browser: every localStorage key (Boardkit, Linkkit, the home page) and
  every IndexedDB database (Boardkit's background pictures, the
  whiteboard's pages). Why: the owner needs one file and one restore for
  both apps; a copy of the storage itself also keeps what the apps'
  exports leave out (Boardkit's trash, a Linkkit map linked to a board,
  settings) and needs no change when an app adds a key. "Restore from a
  backup file…" puts the browser back exactly as in the file, after
  downloading a copy of what is there now (so a restore can be undone);
  only a picked backup folder can't go in a file, and a restore leaves it
  as it is. Boardkit's and Linkkit's own exports and folder backups stay
  as they are.
- 2026-10-19 — Owner: automatic backups go live on their own, before
  phase 2. They are added to the /backup/ page (same file format), not a
  second page: on opening the home page, the whiteboard or /backup/, and
  every 10 min, the same backup "Save a backup" downloads is kept in this
  browser (IndexedDB `gauntlet-auto-backups`) if anything changed; the
  page lists them with "Restore this" and "Download". Kept: newest 30 +
  one a day for 90 days, within a budget: backups use at most 20% of the
  site's storage quota, and none is kept if the site would then use more
  than 60% of it, so Boardkit's pictures and the whiteboard always have
  room. A backup that can't be kept shows a warning on the page (and on
  /backup/). They live in the same browser storage as the data: clearing
  the browser's data loses them too; only a saved file protects against
  that.
- (undo part replaced by 2026-10-20, empty new boards) 2026-10-20 — "+ New board" in the whiteboard's Board picker makes a real
  Boardkit board through Boardkit's own code (`createWhiteboardBoard`):
  empty, as Boardkit's own "+ New board" makes one, named "Untitled"
  (owner's wording; Boardkit's own dialog suggests "Untitled board N" but
  lets two boards share a name, so two untitled boards are both
  "Untitled"). Undo takes the widget off the whiteboard and leaves the
  board in Boardkit's list, as deleting a board widget does: Boardkit has
  no board trash, and deleting a board there is permanent. Redo puts the
  same board back. Such boards are deleted at /boardkit if unwanted.
- 2026-10-20 — Widgets inserted from the Board menu go in the middle of the
  current view. Picking an existing board used the page's middle, which a
  zoomed-in view may not show; now it is placed as "+ New board" is (same
  code): in the view's middle, kept inside the page, selected.
- 2026-10-20 — Automatic backups are also written to a folder the owner
  picks on /backup/ (File System Access), same file, same keep rule (30
  newest + 1/day for 90 days); only gauntlet-auto-*.json files are ever
  deleted. A banner on / and /whiteboard/ shows when no folder is picked
  or the browser needs permission again (Reconnect button). Why:
  in-browser backups die with the browser's data.
- 2026-10-20 — Page controls (owner, phase 2.5 item 13). Top left only the
  main menu (tldraw’s page menu is gone from there). Bottom right only
  "‹ 2 / 4 ›": the arrows and the position, never a page name.
  Clicking "2 / 4" opens tldraw’s own page list (jump, rename, reorder,
  duplicate, delete, add), just above it. The control sits on the
  watermark’s row, directly to its left (never over it: the hobby
  license needs it visible); with no watermark, in the corner. Present mode
  is removed entirely. Keys: ←/→ go to the previous/next page when
  nothing is selected and no text is edited (→ never makes a page); with
  a selection they nudge it. The on-screen › and PageDown on the last
  page still make a new page. Laser, sticky note and frame tools are gone
  too (toolbar, overflow menu, keys); such shapes already drawn stay.
  Zoom buttons and Ctrl+/Ctrl- go in 10% steps up to 800%.
- 2026-10-20 — The whiteboard IS the gauntlet: '/' is the whiteboard. The
  stones canvas was a failed attempt and is deleted; nothing is built on
  it. "/whiteboard" and "/whiteboard/" redirect to "/" (old links keep
  working); automatic backups start on "/". Deleted: src/canvas/,
  src/domain/, its e2e (canvas.e2e.ts), and in Linkkit the e2e that only
  tested Linkkit inside the canvas's frames (embed.e2e.ts, the "Add a
  stone" step of boardname.e2e.ts). Linkkit's embed mode itself
  (`?embed=1`) stays: the real-data and read-only tests still open maps
  that way. The old canvas's saved data (localStorage `gauntlet:canvas`,
  `gauntlet:scroll`) is left in place until the owner says to delete it.
- 2026-10-20 — Board widget polish (owner, phase 2.5 items 15-20), in
  Boardkit's whiteboard mode only; standalone /boardkit unchanged. Add
  buttons are found by fixed markers (`data-add`), never their text. "+ Add
  a list" is a slim "+" on the last list's right edge, shown while the
  pointer is over the board or it is selected; "+ Add a card" a slim "+"
  on a list's bottom edge, shown only on the list the pointer is over.
  Neither takes room: the widget's box hugs the lists. A board with no
  lists, and an empty list, keep the full buttons. A list header shows its
  title and count; its other controls only while the pointer is over that
  header. The header's x is gone: "⋯" opens the list's menu, with "Delete
  list…" (undo brings the list back). The board's name shows on hover or
  while selected (its room kept; in phase 4 it becomes the handle). Lists
  are as tall as their content. A press on a showing slim "+" starts
  editing and opens that field.
- 2026-10-20 — Failed board saves on the whiteboard are no longer silent
  (owner, item 21): Boardkit's own save health drives a banner on the
  whiteboard ("Board changes aren't being saved", "Try again") and the
  browser's "Leave site?" prompt while any board write fails.
- 2026-10-20 — One undo for the whole whiteboard page (owner, item 22):
  Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, the bottom-left buttons and the menu undo
  and redo the latest thing done on the page, a drawing change or a card
  edit, in order, whether or not a board is being edited (a text field
  being typed in keeps its own undo). tldraw and Boardkit keep their own
  histories; the page keeps the order (`src/whiteboard/pageUndo.ts`).
  Each board's history is kept while another board is edited. Edits made
  in /boardkit in another tab are not part of this page's history.
- 2026-10-20 — Empty new boards (owner, item 23; replaces the undo part of
  the "+ New board" entry): a board made with "+ New board" that is still
  empty (no lists, nothing in its trash, never renamed) is deleted from
  Boardkit too when its widget leaves the whiteboard (creation undone,
  widget deleted, page cleared), unless another widget still shows it or
  it is the last board in Boardkit's list (Boardkit never deletes its last
  board). Redo, or undoing the delete, puts the same board back, same id.
  A board with any content is never deleted this way: the widget goes,
  the board stays in Boardkit.
- 2026-10-21 — Owner: delete the old canvas's saved data. Opening the
  whiteboard removes localStorage `gauntlet:canvas` and `gauntlet:scroll`
  if present (`src/whiteboard/oldCanvasKeys.ts`). Backups made before
  still hold them.

IDEAS

Asks from the owner made during a phase that do not block daily use.
They wait here; the agent tells the owner instead of building them.

- (none yet)
