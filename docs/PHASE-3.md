# PHASE 3 — LINKKIT MAPS ON THE WHITEBOARD (owner, 2026-10-21)

First: save this whole message as docs/PHASE-3.md and tick items off there as you go. Read PROJECT.md and HANDOFF.md as usual. Phase 2.5 must be finished (its last two hand-test fixes included); if it isn't, finish it first. One agent in the repo at a time. Testing per CLAUDE.md. Commit after each step. When phase 3 is done and its tests pass, STOP and report (PROJECT.md rule 3); do not start phase 4.

- [x] Add these owner decisions to PROJECT.md DECISIONS (2026-10-21) at the start:
  - A map on the whiteboard behaves like a board does now ("live screenshot"): scaled from the corners as a whole, double-click (or Enter) to edit in place, Escape or a click outside ends editing. In phase 4, boards and maps both become frames with real objects together.
  - A board that has a linked Linkkit map is ONE widget with a small "List | Map | Both" switch next to its name label, shown on hover or selection (like the label). "Both" shows list and map side by side inside the same widget, moved and scaled as one.
  - A map always fits its widget: no zoom or scrolling inside it; you make it bigger or smaller by scaling the widget. Linkkit's own zoom controls are hidden on the whiteboard.

- [x] 0. First, small: unskip the Ctrl+D + close-tab test in unsaved.e2e.ts. Suspected cause (unconfirmed): in a freshly opened tab the key press arrives before the whiteboard has keyboard focus. Try clicking/focusing the whiteboard before Ctrl+D (or duplicating through the editor if the key press itself isn't what's being tested). Keep it only if it passes reliably; if not, leave it skipped and say so.

- [x] 1. Linkkit as a whiteboard widget, the same way Boardkit is:
  - [x] In the Linkkit repo (~/linkkit, its GitHub repo), add a whiteboard entry (like Boardkit's src/app/whiteboard/): the map drawn and edited by Linkkit's own components, with no app chrome (no header, map switcher, zoom pill, tips, export menu). Push Linkkit main; gauntlet imports it as a pinned git dependency like Boardkit, every import through one file (src/maps/linkkit.ts).
  - [x] gauntlet src/maps/: the tldraw shape ("linkkit-map"), reading and writing Linkkit's own stored map (same origin, as boards do with Boardkit's record), so an edit shows in /linkkit too and vice versa, live. Nothing copied.
  - [x] Natural size = the map's content; scaled as a whole, aspect kept; box follows the content but never past the page (same rules as boards: fit.ts). Edge wall, lasso and box select (whole map) work as for boards.
  - [x] Editing in place: everything Linkkit's map editing does (add, rename, move, delete boxes, arrows), deletes into Linkkit's own trash if it has one.
  - [x] IMPORTANT, known pitfall: opening or showing a map must never rewrite its stored data (see HISTORY: autosave on map switch, bracket maps re-laid out to the window). On the whiteboard, a bracket map lays out to its widget's natural size, not the window, and showing it writes nothing.
- [x] 2. Toolbar: a "Map" button next to "Board", same picker style: "+ New map" first (creates a real Linkkit map through Linkkit's own code, name typed in place, empty-map cleanup on undo/delete as boards do), then the existing maps. Placed in the middle of the view, inside the page, selected, one undo step.
- [x] 3. Linked board + map = one widget:
  - [x] A board widget whose board has a linked Linkkit map shows the "List | Map | Both" switch next to its name label (hover/selection only). A board without a linked map shows no switch. A map placed on its own (not via its board) has no switch.
  - [x] "Map" shows the linked map, "Both" shows list and map side by side, inside the same widget box, scaled as one. The choice is stored on the widget (per widget, survives reload).
  - [x] Edits in either view show in the other at once (they already sync between Boardkit and Linkkit).
- [x] 4. One undo covers map edits too: extend the page's undo order (phase 2.5 item 22) so Ctrl+Z / Ctrl+Y and the undo buttons undo the most recent action on the page, whether whiteboard, board or map.
- [x] 5. Failed saves: if Linkkit tracks failed writes like Boardkit's useSaveHealth, show the same whiteboard banner for map saves; if it doesn't, add that tracking to Linkkit (its standalone app shows its notice too) and wire it in.
- [ ] 6. Tests:
  - [ ] e2e (new e2e/maps.e2e.ts): place an existing map; new map; corner scale + undo; edit in place (add/rename/move/delete box and arrow) and see it in /linkkit; an edit in /linkkit shows on the whiteboard live; box select + lasso; edge wall; the switch (List/Map/Both, stored per widget, survives reload); one undo across a whiteboard move, a card edit and a map edit, in exact order; failed-save banner; a bracket map shown at several window sizes changes no stored byte.
  - [ ] realdata.e2e.ts: place each of the owner's 19 maps as a widget (and flip each linked board to Map and Both): no byte of linkkit:* or boardkit:* changes.
  - [ ] perf.e2e.ts: a big map (about 150 boxes) on the whiteboard: same drag and zoom limits as the big board.
- [ ] 7. src/README.md: add the maps/ row. Update the Board/Map picker docs.

- [ ] END: full local suite once, push both repos, deploy, live once. Report in a few lines: what's done, anything not done and why, decisions you had to make, and what I should try by hand (feel only: placing and scaling a map, editing it in place, the List | Map | Both switch, one undo).
