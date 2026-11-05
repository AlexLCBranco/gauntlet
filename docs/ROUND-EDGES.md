# Edges round (owner, 2026-11-05)

The owner's request, word for word below. Owner-approved round, like the
links round; it does NOT start phase 4, the speed session or Slate step 3.
Tick items as they are done so a cut-off session can resume (details in
HANDOFF.md).

## Progress

- [x] 0. Slate widget: move the calendarkit pin to the latest commit
- [x] 1. Page edges and packed layouts
- [x] 2. Clearer saving
- [ ] 3. Adding any widget must be faster than a screenshot
- [ ] 4. Paste at the cursor
- [ ] 5. Style panel: collapse and left/right
- [ ] 6. Stamps tray v0
- [ ] 7. Case switcher in the style panel
- [ ] 8. Two-way sync as a rule for every widget
- [ ] 9. GIF / video / sound check (report only)
- [ ] FINISH: full suite, push, deploy, live run, docs
- [ ] REPORT

## The request

Project: gauntlet (whiteboard at gauntlet-home.vercel.app). NEW CHAT.

START
1. Read PROJECT.md fully (the plan + DECISIONS + IDEAS), then HANDOFF.md,
   then CLAUDE.md. Follow their rules: one agent at a time, HANDOFF.md
   after every step (100-line limit, finished work to docs/HISTORY.md),
   small saved steps, DECISIONS for any plan change, tests before every
   save, test-run frequency from CLAUDE.md.
2. Copy this whole request word for word into docs/ROUND-EDGES.md (as
   docs/TOOLBAR-REWORK.md was), with a checkbox per item, and tick items
   as they're done, so a cut-off session can resume.
3. This is an owner-approved round ("Edges round"), like the links round.
   It does NOT start phase 4, the speed session, or Slate step 3. The
   phase 3 hand test and my Slate step 2 report are still pending; leave
   them in HANDOFF.
4. Work the items IN THIS ORDER. If an item needs a decision from me or
   turns out impossible, write why in HANDOFF, skip it, and go on to the
   next one. Don't guess and don't stop the whole round.

I'm not a developer. I use only dark mode, on one Windows PC, in Chrome.
I attached a screenshot of a real page of mine (4 Nov): about 4 columns
packed edge to edge, flush against all 4 page edges, the top row right
under the toolbar, a Slate widget on the left, images on the right, text
lines at the bottom. That is how my pages normally look, so "near an edge"
and "touching another item" are the NORMAL case, not a corner case.

ITEMS

0. SLATE WIDGET: MOVE THE CALENDARKIT PIN TO THE LATEST COMMIT (first,
   because item 1's test page uses a Slate widget)
   The gauntlet pins calendarkit at v1.28.1 (e125a19). calendarkit is now
   v1.40.1+ (main). Since then its Slate got: tight cards in 3 columns
   (v1.33.0; I found the old cards horrible, too much dead space), ESPN
   moneyline odds (decimal), the season-series chip ("G2/4"), days with
   no games ("No games"), team links inside calendarkit only.
   - Read calendarkit's PROJECT.md: "## Using Slate in the gauntlet",
     "### Round 14" (odds, v1.33.0/1) and the handoffs after round 10, so
     you know what changed in src/slate/.
   - Move the pin (as scripts/sync-calendarkit.mjs and the Boardkit/
     Linkkit pins do) to the latest calendarkit main commit, and say which.
   - Odds: the Slate fetches /calendar/api/odds (same origin; the
     gauntlet's /calendar/:path+ rewrite should already pass it to
     calendarkit's Vercel function). Confirm the widget shows odds on
     localhost/live; with no odds (failure, or vite preview) it shows none
     and nothing breaks. One request per date shown, not per widget.
   - Notes: calendarkit's notes format `ck:notes:v1` must still read and
     write the same; confirm with a test (notes typed in /calendar show in
     the widget and the existing ones survive the pin move).
   - Update the Slate step 2 tests to the new cards (the pixel compare
     against calendarkit's copy of the same night, at the new reference
     commit). Keep the perf checks (no timers/requests at rest; one
     schedule fetch for many widgets; calendarkit's code not loaded on a
     page without a Slate) and report the numbers vs step 2's.
   - Team links and the ↗ icon inside the widget are Slate step 3: do NOT
     build them here; teams stay plain text in the widget.
   TESTS: above; each must fail on the old pin where that makes sense.

1. PAGE EDGES AND PACKED LAYOUTS (top priority; this blocks daily use)
   Root cause (confirmed by me for resize): the page fills the window, so
   an item flush against the page edge has its border on the screen's
   last pixel; the outer half of the grab zone is off screen. Find the
   exact cause of each part below before changing anything.
   a. Resize: I resize by grabbing an image's border. Borders and corners
      on or near (within a few px) the page edge can't be grabbed. Fix: a
      border/corner on or near the page edge gets its full grab zone
      INSIDE the item, with the resize cursor showing there. Corner
      handles at screen corners likewise move inward. The edge wall stays
      (things still can't leave the page while dragging).
   b. Nothing covers the page's edge strip where a selected item's handles
      are: the toolbar at the top, the page arrows (‹ N/M ›) and the
      "Made with tldraw" badge at the bottom right, the zoom/undo at the
      bottom left. Move them out of the way of the selection (or keep
      them off the edge). Check the tldraw hobby license for what's
      allowed with the badge; don't assume either way, report what it says.
   c. Where two items touch, the SELECTED item's handles always win over
      the neighbour. Handles get a grab area big enough to hit at any
      zoom, also on small images.
   d. Box select and lasso: items flush against an edge can't be
      selected. Fix: while dragging a selection box or lasso, if the
      pointer is within a few px of the page edge, the selection counts
      as reaching past that edge, so flush items count as enclosed.
   e. A packed page has no empty spot to start a box. Add a held key that
      starts a selection box even when pressing on an item. Pick a key
      tldraw doesn't already use; tell me which one and show it in the
      toolbar tooltip (never hide features).
   TESTS: build a test page laid out like my screenshot (same packing,
   flush on all 4 edges, top row under the toolbar, a Slate widget with
   the NEW cards from item 0, several images, text). Grab and resize
   every item from every side and corner; box-select and lasso the edge
   items; the held-key box over an item. At 100%, 50%, 200%, and in a
   smaller window (page larger than window). Each test must fail on the
   code before the fix.

2. CLEARER SAVING
   Today saving is several overlapping systems and none is visible from
   the whiteboard (silent browser auto-save, auto backups inside the
   browser on /backup/, the "Save a backup" file, Boardkit/Linkkit's own
   exports and folder backups, calendarkit's notes Export file). I can't
   tell whether it's saved, where, or whether it's safe. Make it one
   clear system:
   a. One save status ALWAYS visible on the whiteboard, in a spot that
      doesn't cover the page edge: "Saved", "Saving…", red "Not saved"
      (impossible to miss). Hover: when it last saved and where.
   b. One real save location on my PC: I pick a folder once; the whole
      site (whiteboard pages, boards, maps, Slate notes `ck:notes:v1`,
      the stamps tray from item 6) saves there automatically as one file
      plus dated copies (keep a sensible number; say how many and why).
      Reuse Boardkit's existing folder-backup code/approach where
      possible. When Chrome needs the folder permission again (after a
      restart), the status says "Click to reconnect folder": one click.
   c. Ctrl+S saves to the folder now and shows "Saved to folder".
   d. One Restore list with every copy (folder and browser) by date and
      time in plain words (e.g. "Today 20:41 · 14 pages · 6 boards"),
      restore in one click, and a restore can itself be undone (a copy of
      the current state is saved first, as /backup/ already does).
   e. Keep the existing safety: browser auto-save and auto backups stay
      underneath; the apps' own exports stay but out of the way.
   TESTS: status changes on edit / save / forced failure; folder saves
   (fake the folder API in the test browser); dated copies kept and
   pruned; Ctrl+S; reconnect state; restore gives back the exact state
   (compare all stored data, Slate notes included); restore-undo. The
   folder picker prompt itself is the only manual step: tell me that one
   step.

3. ADDING ANY WIDGET MUST BE FASTER THAN A SCREENSHOT
   A screenshot is ~3 actions (snip, pick area, Ctrl+V). Adding a live
   widget must take 3 actions or fewer, with no digging in menus. Today
   it's main menu → "Add existing board…" → pick, and lists can't be
   added alone.
   a. One toolbar button opens a picker at once for EVERY widget type:
      boards, single lists, Linkkit maps, Slate days. Search box already
      focused, most recently used first, each board expandable to its
      lists, "+ New …" for each type at the top. One click places the
      widget at the cursor (or page middle if the cursor is off the page).
   b. Copy in the app, paste on the whiteboard: Ctrl+C on a board or a
      list in /boardkit (or a map in /linkkit), then Ctrl+V on the
      whiteboard → that LIVE widget lands at the cursor, not a picture.
      Same origin, so it should be possible: confirm before building; if
      it isn't, say why and do only (a).
   c. A single list as its own widget, LIVE: the same list as in its
      board (edit either, both change), not a copy. This needs Boardkit
      changes: do them the same way phase 2 did (Boardkit branch, pinned
      commit), and say in the report what changed in Boardkit.
   TESTS: count clicks/keys for each path (≤3); each widget type placed
   at the cursor; the list widget stays in sync with its board both ways.

4. PASTE AT THE CURSOR
   Ctrl+C / Ctrl+V of whiteboard items pastes on top of the original. It
   must paste where the mouse is, keeping the copied items' layout
   relative to each other; off the page → in the visible part of the
   current page, inside the edge wall. As far as I know tldraw has a
   built-in paste-at-cursor option: check whether it exists and use it if
   it does. Also check that cards copied inside a board still paste into
   the list under the pointer (HISTORY K2 says they do); if not, fix.
   TESTS: copy, move the mouse, paste → new position at the cursor; multi
   item layout kept; off-page case.

5. STYLE PANEL: COLLAPSE AND LEFT/RIGHT
   The style panel (left, under the main menu) covers my left column, so
   editing things there is awful.
   a. A collapse button: the panel shrinks to a small tab at the screen
      edge; one click opens it. Stays collapsed while I select other
      things until I open it.
   b. A left/right switch on the panel moves it to the other side.
   c. Both remembered after reload.
   d. The panel never covers its own selection's handles, the toolbar,
      the page arrows or the zoom controls on either side.
   No automatic jumping between sides.
   TESTS: collapse/expand, switch side, remembered after reload, no
   overlap with handles or page controls on both sides.

6. STAMPS TRAY v0 (IDEAS from 19/10; I want a first version now to test)
   My own stickers (team logos, a "tv" tag, icons), NOT a clip-art
   library (I hate Excalidraw's Library).
   - A toolbar button opens a small tray panel; one click opens/closes;
     never covers the page edge strip.
   - Add: select anything on the whiteboard (image, text, group, labelled
     box) → "Add to tray"; or paste/drop an image straight into the tray.
   - Use: click a sticker → it lands at the cursor; or drag it to a spot.
     Each placement is a normal independent copy.
   - The same tray on every page, saved apart from pages, included in the
     backup file, restore and the folder save (item 2).
   - Manage: delete, drag to reorder. Nothing more yet (no folders,
     search, names).
   TESTS: add from selection / paste / drop; place by click and by drag;
   tray visible on another page; reload; backup/restore; delete; reorder;
   no slowdown with ~50 stickers (measure, compare with an empty tray).

7. CASE SWITCHER in the style panel
   A row of three buttons for text: Aa (as typed), AA (all caps), aa (all
   lowercase). It's a DISPLAY style like font size: the typed text is
   kept as I wrote it, so switching back loses nothing. Applies to any
   whiteboard item with text (text, box labels, arrow labels) and to
   several selected at once, one undo step. Whiteboard only, not
   Boardkit cards.
   TESTS: each button on one and on several items; undo; survives reload
   and backup/restore; copy-as-image (and page images) show the shown case.

8. TWO-WAY SYNC AS A RULE FOR EVERY WIDGET
   An edit in an app (/boardkit, /linkkit, /calendar) must show on the
   whiteboard and the other way round, for every widget type including
   the new list widget, with both open in two tabs and with only one open.
   (The Slate widget's notes are read-only on the whiteboard until Slate
   step 4: test only /calendar → widget for now.) Add an automated test
   per widget type for each direction that applies, if one is missing.
   If any case fails, that's a bug: fix it and tell me.

9. GIF / VIDEO / SOUND CHECK — REPORT ONLY, BUILD NOTHING
   Paste and drop an animated GIF and an mp4 with sound onto the
   whiteboard (your own test files). Report: does the GIF animate; does
   the video play; does it have sound or start muted, and can sound be
   turned on; does either slow the page down (measure); do both survive a
   reload and backup/restore. Automate what can be automated; the only
   thing for me might be "does sound come out of the speakers": say so in
   one short step. Anything to build here goes to IDEAS.

FINISH
- Full local suite once, push, deploy, live run once (as CLAUDE.md says).
  Results in one line; details only for failures.
- Update PROJECT.md DECISIONS for every behaviour change, IDEAS for
  anything moved there, HANDOFF.md, docs/HISTORY.md.

REPORT in plain words, then STOP:
1. What's done and live, per item (0-9).
2. What was skipped or changed from this request, and why.
3. Item 0: the new calendarkit commit/version, whether odds show in the
   widget, notes check, perf numbers vs step 2. Item 1: the exact cause
   of each part. Item 2: how many dated copies and why. Item 3: action
   counts per path, and whether copy-paste from the apps worked. Item 4:
   whether tldraw's paste-at-cursor existed. Item 6: the 50-sticker
   numbers. Item 9: the findings.
4. What I should try by hand, feel only, keep it short (one line each).
5. Anything unverified, said plainly.
