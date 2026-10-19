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
     and down forever. In the gauntlet, that default page is FIXED in size:
     you can't scroll past its edges.
   - If I want more space, I go to a new page. Two arrow buttons in the
     bottom-right corner: previous page and next page.
   - Pressing "next" on the last page creates a new empty page.
   - Each page is its own sheet. Nothing sits across two pages.
   - Each page is a unit: I can name it, jump to it, reorder it, and
     present it as a slide.

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
   Phase 4 — Things connect: cards go anywhere, notes stick to cards,
             arrows attach to single cards and boxes (5a, 5b).
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
   - Keep a DECISIONS section in PROJECT.md. Any change to the plan gets
     written there; never change the plan silently.
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

- 2026-10-18 — During phase 1 the whiteboard lives at /whiteboard, not the
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
- 2026-10-18 — tldraw 5.5.2. Page size: one 1920 x 1080 sheet per page
  (16:9, so a page is also a slide). You can zoom in, not out past the
  whole sheet, and can't pan past its edges.
- 2026-10-18 — tldraw has no lasso, so phase 1 adds one (key W, toolbar
  button next to Select). It selects what is wholly inside the loop. Box
  select was also set to "wholly inside", as in Excalidraw. Excalidraw's
  number keys 1-0 pick the tools in Excalidraw's order; D is the diamond
  and P the pen (tldraw uses D for the pen).
- 2026-10-18 — "Present as a slide" (section 2) is done in phase 1, since
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
- 2026-10-18 — Phase 2, how a board behaves. It is drawn at its natural
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
- 2026-10-18 — Owner's phase 1 fix list (HANDOFF.md). "100%" is the page
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
- 2026-10-18 — Replaces the "100%" part of the fix-list entry above
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
- 2026-10-19 — Owner: the old home page (/) stays for now; revisit
  replacing it with the whiteboard after phase 3.
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
