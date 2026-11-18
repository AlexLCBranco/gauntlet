# Built — gauntlet

Shipped work only, newest first. Planned work is in `FEATURE_BACKLOG.md`, never here.
Entries dated before 2026-11-16 were backfilled from the git commit messages (data, docs, test-only, merge and
spec commits left out). New entries name their backlog ID (see CLAUDE.md, "Feature backlog, built list and ideas").

No version numbers here: gauntlet's package.json stays 0.1.0, so entries go under `## <YYYY-MM-DD>` only.

## 2026-11-17
- GT-10 — Save a board as a frozen archive file, load it back and edit
  Main menu → "Save board to file" keeps the current page with its widgets' data as they are; "Open board file…" adds it as a new page whose boards, maps and Slates show that saved data (badge "Frozen d/m"), are edited there only, and "Go live" shows today's data again (Ctrl+Z undoes it).
- GT-5 — Slate step 5: live scores and changes reach the widget
  A Slate shows a game's final score within minutes of the end; a newer schedule, and any new calendarkit Slate design, reach an open whiteboard without a reload (checked every 5 minutes and when you come back to the tab).
- GT-3 — Today's date in one click
  The stamps tray (Y) starts with a "Today" item showing the date (e.g. 5/11, São Paulo time); a click drops it where the pointer was, a drag drops it where you let go, as normal text you can edit, that never changes by itself.
- GT-2 — Resizing a text box scales its font
  Dragging a text box's corner makes the text bigger or smaller with the box (the style panel shows the new size, e.g. "Font size · 36.5 px"); a side handle still changes only the width and re-wraps; one undo puts the old size back.
- GT-1 — One broken widget never breaks the page
  A board, map, Slate or web embed that fails shows a small "This … widget failed" box with Try again, and can still be selected, moved and deleted; the rest of the whiteboard keeps working.
- GT-4 — Slate step 4: notes on the whiteboard
  Click a note on a Slate to type in it (Enter adds a line, ⇄ switches PRE/LIVE/POST); clicking away saves it; it is the game's note, the same in /calendar and in backups.
- GT-9 — Slate hover popups close as soon as the cursor leaves (calendarkit CK-6 on the whiteboard)
  On the whiteboard a Slate popup closes within 100 ms of leaving, only one is ever open across Slates, and a pan, zoom or press elsewhere closes it at once.
### Internal
- REPORTS.md: the end-of-batch reports (new rule, CLAUDE.md), starting with GT-1, 2, 3, 5, 10
- test: the archive Slate test and the odds-request count no longer assume a night the snapshot lists as upcoming has no ESPN finals (on the live site it may)
- test: the archive hover check points at the record where it is now (a just-drawn widget may still be settling its size)
- Pin calendarkit v1.77.0 (abedce8): calendarDataFromRaw for archived Slates
- test: text-scaling e2e measures the text after its font has loaded (it was measured in the narrower fallback font, then dragged from a stale edge)
- Pin calendarkit v1.76.0 (d8e9c79): the Slate kit and same-night finals; the pinned copy is now the fallback
- ALL_BUILT.md, its script and daily workflow moved to backlogkit (BL-2 there), which now also writes ALL_BACKLOG.md
- Pin calendarkit v1.75.0 (448cd3c): notes open for typing in its copy layout (SlateCopy editNotes)
- test: copies and paste-at-cursor e2e wait for Ctrl+C / Ctrl+X to land in the clipboard before pasting (a quick paste took an earlier test's clipboard)

## 2026-11-16
- GT-8 — Slate tight grid (calendarkit CK-7 on the whiteboard)
  The Slate widget's cards touch, split by one 1 px line with square corners, with notes shown or hidden (calendarkit v1.74.0).
- GT-7 — Slate looks like the calendarkit copy: 2 columns, notes shown or hidden
  A Slate is always 2 columns like the copy-paste, starts with notes shown, and a "Hide notes" button in its date bar switches to calendarkit's info-only cards (saved per Slate, one undo; notes are never changed).
### Internal
- test: the Slate odds-request check picks a night not over (an over night's odds are asked once; the data now has finals)
- test: edges e2e places its Slate at a whole height (the text under it sat on tldraw's 16 px side-handle limit at 50%, by float rounding)
- test: the Slate copy comparisons block odds in both browsers (live odds arrived in one side only)

## 2026-11-14
- Serve footykit at /football (rewrites to footykit.vercel.app, like /calendar); the local dev proxy and its tests know it
- A board or map widget copied on the whiteboard shows its own new board or map (speed session Part 6)
- Hovering a board's card or a map's box on the whiteboard works as in its app (speed session Part 5)
- Pin calendarkit v1.65.1 (0a6cb17): the Slate's cards take calendarkit's copy width
- Page export draws boards, maps and Slates as the screen does (speed session Part 9)

## 2026-11-13
- slatehover e2e: the popup's close after a zoom is seen by the page itself (the browser's re-hover raced the poll on the live site)
- Slate step 3 (speed session Part 4): hovering a Slate shows calendarkit's own popups as in /calendar, without selecting, above every item at reading size; ↗, score and team li…
- HANDOFF: within 100 lines; Part 3 done
- Nothing arrives too big: pictures, Slate, boards and maps placed new land inside the window at 100%; a new Slate starts a third of the window wide (speed session Part 3)
- Speed session: the owner's Parts 9-11 (board export, text scaling, date stamp) word for word
- HANDOFF: map-making round done; Linkkit v0.0.117 pinned
- npm run dev:local starts again: its Vite mode is "local-apps" (Vite refuses "local", which clashes with .env.local files)
- Linkkit's +, Enter chain, border arrows and list paste in a map being edited: a top box's toolbar is no longer cut off; pin Linkkit v0.0.117 (3e802ab) for the paste
- A new map goes straight to typing: Enter on its name opens it with the first box's name open; a double-click on an empty map adds the box in that one gesture
- Pin Linkkit v0.0.116 (7b6653b): its map-making round; e2e follow its renamed + New entries

## 2026-11-12
- Images on the page: no picture as data: text in a record, smaller copies for pictures shown small (speed session Part 2)
- HANDOFF: within 100 lines
- Saving that scales: pictures as their own files, the save read in a worker (speed session Part 1)
- Speed session Part 0: perf test for 19 pages of screenshots (measures only)

## 2026-11-05
- HISTORY: Edges round results (local, live, numbers)
- GIF / video / sound check, report only (Edges round item 9)
- Two-way sync tests for every widget type, both open and one open (Edges round item 8)
- Case switcher: Aa / AA / aa for texts and labels, a display style; the typed text is kept (Edges round item 7)
- Stamps tray v0: own stickers from the selection or a pasted/dropped picture, placed by click or drag, same on every page, in backups (Edges round item 6)
- Style panel: collapse to an edge tab, left/right switch, both remembered; never over the toolbar or bottom controls (Edges round item 5)
- Add any widget in 2-3 actions; single-list widgets; paste a board, list or map copied in its app; paste at the cursor (Edges round items 3-4)
- Page edges and packed pages; one clear save (Edges round items 1-2)
- Slate widget on calendarkit v1.40.1 (7c606c6): tight cards, odds (one request per night per page), series chip; notes format unchanged
- Edges round: the owner's request word for word in docs/ROUND-EDGES.md

## 2026-10-31
- HISTORY: Slate widget step 2 results (local, live, perf, bundle)
- Toolbar e2e: Slate on the bar; everything pinned now fits from ~670 px windows
- Slate widget step 2: calendarkit's Slate as a static whiteboard widget
- dev-proxy: an app server cutting a reply after its headers no longer kills the proxy
- Serve calendarkit at /calendar (rewrite to calendarkit-brown.vercel.app/calendar/)

## 2026-10-23
- HANDOFF: keep the phase 2.5 hand-test item; shorter embed-mode note
- HANDOFF: links step 2 live results
- Links on everything: every whiteboard item, board, list, card and map box holds a link, set from the right-click menu or Ctrl+K, opened only from its icon (new tab, noopener); h…
- Leftover check counts hidden windows of a finished run's test browsers; a run still going (its launching node alive) is ignored

## 2026-10-22
- HANDOFF: toolbar step 4 live results
- DECISIONS, HANDOFF: toolbar rework step 4
- Markup (K, replaces the laser): red marks that stay until cleared, never saved, gone on leaving the page or a reload; while it's on, Arrow and Line draw red markup (straightened…
- unfurl: startsWith for the link-local prefix (lint)
- Web embeds: a pasted address (or ⋮ Web embed, key I) becomes a preview card (title, picture, from this site's own /api/unfurl); the live site loads only after "Load site"; sit…
- Group and Ungroup at the top of the right-click menu (tldraw had them only in its Edit submenu)
- Lines and arrows drawn within 5° of horizontal or vertical come out exactly straight (Shift keeps tldraw's 15° steps)
- Leftover-windows check counts only windows on screen: a running headless test browser's hidden window made it fail when run during an e2e run
- HANDOFF: selection fix live results
- A reload brings back the selection you had, not an older one (the flaky Delete: a stale selection made the click open the shape's text); big-map zoom speed judged on the median …
- HANDOFF: ghost fix + full bar live results; unsaved.e2e.ts:142 flaked again live
- Toolbar: the dragged icon follows the pointer (drawn on the body, out of the toolbar's transform); the bar never overflows (a pin with no room is refused with a message; on a na…
- HANDOFF: toolbar step 3 live results
- Toolbar rework step 3: drag tools between the bar and the ⋮ menu (pin, unpin, reorder; menu stays open mid-drag); Select stays on the bar; layout kept in localStorage; "Reset …
- HANDOFF: font + licences live results
- Toolbar: Excalidraw's UI font (Assistant Regular) self-hosted; THIRD_PARTY_LICENSES with Excalidraw MIT, Tabler MIT and Assistant SIL OFL; e2e checks the text is drawn in Assistant
- HANDOFF: toolbar step 2 live results
- Toolbar rework step 2: Excalidraw's exact look and size (values from its source, file by file in toolbar.css), its icons, key hints and tooltips; keys B board, M map, I web embe…
- Live runs without a bypass secret (none exists: gauntlet-home has no Deployment Protection): no header, no error; 2 browsers at once on a deployed site; a 403 stops the run inst…
- Live tests through Vercel's automation bypass (header only to the deployed site; secret in env or git-ignored .env.e2e); slow deploy check (scripts/wait-deploy.mjs); tldraw's In…
- Toolbar rework step 1: our own bar (Select, Rectangle, Arrow, Line | Board, Map, ⋮), never overflowing; ⋮ menu holds Insert image, Web embed, Lasso selection, Markup (greyed…
- HANDOFF: map fixes live results
- DECISIONS, HISTORY, HANDOFF: hand test passed, item 8 dropped to IDEAS, map fixes, hover speed, clickaway hang
- clickaway e2e: on the whiteboard, wait for map editing to end after a click away (a race left a click waiting 5 minutes on an inert map)
- Hover speed: the canvas shows the cursor itself and the items' layer doesn't inherit it (a cursor change re-styled every element of every item, 8 ms with 400); control lookup on…
- Map fixes from the owner's hand test: editing a map dims the rest as one layer (a filled box still hides what's under it); the label says what adds a box under the map's rules; …
- HANDOFF: move cursor live results
- Move cursor over items, as in Excalidraw: select tool at rest shows move over any unlocked item's body (selected or not), resize edges/handles win, text editing/hand/drawing too…
- Item 4 closed: Alt+Tab tiles gone after removing the Edge Run entries (owner)
- DECISIONS: backup path
- HANDOFF: backup path
- DECISIONS, HANDOFF: Edge auto-launch Run entries removed (owner), backup kept
- HANDOFF: hand-test round results
- Pin Linkkit v0.0.111 (c333d3d); map draws over its name; HANDOFF, HISTORY for the hand-test round
- Linked boards visible: pickers mark linked boards (+ map) and maps (+ board); Add map view on a board widget (one click) links a new map; Unlink map in the board's ⋯ menu, one…
- leftovers test: plain path in the sample command line
- leftovers: lint fixes
- Map editing on the whole page: double-click anywhere adds a box to the edited map (nearest free spot), widget grows any way with boxes kept in place (Linkkit's shift), others di…

## 2026-10-21
- Live runs wait until /boardkit and /linkkit work before testing (e2e/global-setup.ts) and keep a screenshot of failures; scripts/boardkit-load.mjs measures /boardkit's load; DEC…
- leftovers.mjs: also list test-browser windows titled Linkkit/Boardkit/Gauntlet and stale Playwright profile folders (--kill removes them); DECISIONS: what the Alt+Tab tiles are
- Resize from the edge without selecting first: resize cursor over an unselected item's sides and corners, one press-and-drag selects and resizes (src/whiteboard/hoverResize.ts, e…
- Toolbar no bigger than Excalidraw's (measured 542 x 44): 13 tools + more at 37 px = 520 x 44; lasso and highlighter only in the more menu, keys unchanged; tool lock beside the r…
- Imported Excalidraw colours follow Excalidraw's dark mode: its exact invert(93%) hue-rotate(180deg) in dark mode (src/style/colors.ts excalidrawDark), stored colours in light mo…
- HANDOFF: results of the Excalidraw parity runs
- HANDOFF, HISTORY: Excalidraw parity items 0-3
- Crop in the style panel's Actions row for one selected picture, starting tldraw's own crop mode (the floating button stays); e2e/crop.e2e.ts
- Excalidraw paste and import that keep everything: our own converter (src/import/excalidraw/) for pasted Excalidraw content, dropped .excalidraw files and the main menu's Import …
- Style panel: dark fixed colours (black, dark grey, dark red, brown, olive, dark green, dark blue, dark purple) and a custom colour picker with the last 5 custom colours, in Stro…
- Tests and scripts leave no window open: explicit headless (HEADED=1 or --headed to show), drag-feel headless by default and always closes its browser, local-e2e stops everything…
- Typing at once after a one-click + keeps every character; a map's + label works on the whiteboard; Linkkit v0.0.110 (no scroll inside a map widget); e2e for every inline field k…
- Hand-test fixes: a click away saves typed text everywhere (Boardkit v0.0.104, Linkkit v0.0.109 pinned); one click on a board's hover controls; text alignment idea in IDEAS
- Phase 3 done: HANDOFF, HISTORY
- Enter in a new map's name field no longer starts editing the map (its key-up reached the whiteboard); e2e: empty new maps leave Linkkit with their widget; page-list rename waits…
- Phase 3 steps 6-7: real data (every map as a widget, linked boards as Map and Both: no stored byte changes), a 150-box map within the big board's speed limits; docs
- Phase 3 steps 4-5: one undo across whiteboard, card and map edits (e2e); failed map saves show the banner (e2e). Fixed: a double-click that starts editing a map now renames the …
- Phase 3 steps 1-3: Linkkit maps as whiteboard widgets (src/maps/), Map picker with + New map, List | Map | Both on a board with a linked map; Linkkit v0.0.108 and Boardkit v0.0.…
- Phase 3 start: PHASE-3.md, owner's decisions; the Ctrl+D + close-tab test is back (duplicate through the editor)
- Pin Boardkit v0.0.102 (new list opens its card field)
- New list + Enter opens its card field (Boardkit v0.0.102, synced); e2e on the whiteboard and /boardkit; HANDOFF flaky note
- Pin Boardkit v0.0.101 (board widget look)
- Board widget look after the owner's hand test: card + row inside the list, ghost column for a new list, header count at the right; a slim + press opens at its own point
- Skip the flaky Ctrl+D-then-close unsaved test (testing rule; no app cause found, 4/4 alone on old and new code)
- Delete the old canvas's saved data (gauntlet:canvas, gauntlet:scroll) on opening the whiteboard (owner's OK)
- HANDOFF.md: phase 2.5 results (local, live, CI)
- Pin Boardkit v0.0.100 (4061861); fullpage no-jump checks compare floats to 6 decimals; HANDOFF and HISTORY for phase 2.5
- Phase 2.5 group E: CI runs lint, unit tests and build on every push (e2e stays local)
- Phase 2.5 groups C and D: board widget polish, save-failed banner, one undo for the page, empty new boards leave Boardkit

## 2026-10-20
- Phase 2.5 item 14: the whiteboard is the home page; /whiteboard redirects to /; old iframe canvas deleted
- Phase 2.5 item 13: pages: only ‹ N / M › bottom right beside the watermark, N / M opens the page list, no Present, ←/→ keys
- Phase 2.5 items 7-12: tldraw pinned to 5.5.2, 0x0 window test, honest chunk limit, Backups in a new tab, 10% zoom steps, no Laser/Note/Frame
- Phase 2.5 group A: HANDOFF under 100 lines (rest in docs/HISTORY.md), missing DECISIONS, phase rules, test-run rules
- HANDOFF.md: live e2e result for the backup folder
- Backups: each automatic backup also written to a folder picked on /backup/; favicon
- HANDOFF.md: live e2e result for placing existing boards in the view
- Whiteboard: an existing board picked in the Board menu goes in the middle of the view
- HANDOFF.md: live e2e result for New board
- Whiteboard: + New board makes a Boardkit board in the middle of the view, name typed in place
- HANDOFF.md: Linkkit full-run failures were test races; perf limit 108 ms; results
- perf e2e: zoom p95 limit 6.5 refreshes (108 ms), off the 6-refresh boundary
- HANDOFF.md: live e2e result for the unsaved-drawings journal
- Keep drawings made just before a reload or tab close; perf zoom p95 limit 100 ms
- HANDOFF.md: perf 0/25 failures, save waits replace sleeps, gone-page test

## 2026-10-19
- HANDOFF.md: flaky fullpage:314 was a lost page change on reload; fixed
- Whiteboard reopens on the page you were on, even right after a page change
- HANDOFF.md: renamed board shows everywhere; opening from Linkkit's menu writes nothing
- Canvas names a linked Linkkit map after its board; real-data test opens maps from the menu
- HANDOFF.md: Linkkit v0.0.106 (explicit zoom sticks), stale-name readers listed
- HANDOFF.md: Linkkit fit to view on open is live (v0.0.105)
- HANDOFF.md: Linkkit v0.0.104 (Tips toggle, header test), fit-to-view and stale-name reports
- HANDOFF.md: Linkkit header overlap fixed (v0.0.103), live e2e 16/16
- HANDOFF.md: Linkkit read-only opening is live; e2e results
- Real-data test: opening each Linkkit map changes no stored byte
- HANDOFF.md: phase 2 is live; 67 e2e pass against the live site
- Phase 2 goes live: Boardkit boards on the whiteboard, Excalidraw-style pages
- HANDOFF.md: phase 2 ready to go live, waiting for the owner's OK; real-data findings; next round
- Pin Boardkit 1a9f283 (whiteboard branch, v0.0.97, main merged in)
- Call things placed on the board widgets, not stones, in comments and docs
- Boards on the whiteboard have no panel behind their lists
- Smaller windows work like Excalidraw, and page edges are a wall while dragging
- HANDOFF.md: fullscreen-page experiment, preview link and results
- Whiteboard page fills the window: no bars, page resizes with it
- HANDOFF.md: automatic backups are live on main
- HANDOFF.md: automatic backups live, 28 e2e pass against the live site
- HANDOFF.md: Boardkit fix live, crash answer, speed check alone, backup ships from backup-live
- HANDOFF.md: automatic backups on backup-live, the owner's storage and quota questions answered
- Automatic backups on the backup page, within a storage budget, with a warning
- Speed check runs alone, with limits in whole screen refreshes
- HANDOFF.md: parity and backup done on phase-2, preview limits, live Boardkit bug, waiting for the owner's re-test
- Vercel installs with npm ci, so a new Boardkit pin is really used
- Pin Boardkit 1e3a413: a dragged card crosses lists at most once per pointer position
- Backups of the Boardkit, Linkkit and home-page data, with a Backups page
- Phase 2 parity: Boardkit's menus, panels and drags work on the whiteboard board
- Phase 2 parity (in progress): whiteboard boards run Boardkit's own code
- HANDOFF.md: backup page live, waiting for the owner to save their backup
- Backup page: e2e round trips (empty browser, over changed data, wrong file); docs and owner's steps
- Backup page at /backup/: one file with all of this site's browser storage, and restore
- PROJECT.md, HANDOFF.md: owner's go-live conditions, home page stays, previews open without login
- Owner's decisions: go-live needs hand test + restorable backup; home page stays; previews open without login
- HANDOFF.md: phase 2 done on phase-2, waiting for the owner's hand test
- Boards show Boardkit's card looks: number formats and emphasis, highlights, check circles, keep/maybe/cut
- Board button is a toolbar tool (shares the row and overflow menu); toolbar shows as many tools as fit

## 2026-10-18
- HANDOFF.md: two re-test decisions live; phase 2 resumes on phase-2
- Whole page at 100% with dark bars (no scrolling); one Ctrl+Z undoes a shape after Escape; Ctrl+Y redoes
- HANDOFF.md: phase 1 fixes live, owner re-tests; how phase 2 picks them up
- Item 10: drag smoothness measured (no difference from Excalidraw); scripts/drag-feel.mjs
- Phase 1 fixes 1-9: page fills the window (100%), Excalidraw layout and style panel, smaller fonts, background and text colours, Clear page, drag outline
- HANDOFF.md on the fixes branch: key, branches, owner's 1-10 fix list
- tldraw evaluation key (expires 2026-11-01) set in Vercel; license e2e; docs on swapping it
- HANDOFF.md: rest of the owner's phase 1 fix list (items 7-10)
- HANDOFF.md: owner's phase 1 fix list (do before phase 2); full e2e passed
- HANDOFF.md: all work lives on branch phase-2; main stays phase 1 (live)
- tldraw evaluation key (expires 2026-11-01) set in Vercel; license e2e; docs on swapping it
- Phase 2 (paused): Boardkit boards as live whiteboard objects, not yet pushed
- boards: read and edit Boardkit's own board record (rename, add, move, trash, undo)
- Phase 2 started: board object shares Boardkit's record (owner's choice)
- HANDOFF.md: hobby license applied for, waiting on tldraw's email
- HANDOFF.md: phase 1 done and live; GAUNTLET-PLAN.md marked superseded
- Whiteboard e2e (9 tests); fix Excalidraw number keys and Escape mid-lasso
- Whiteboard at /whiteboard (phase 1): tldraw, lasso, fixed sheet, page arrows, present
- PROJECT.md: the owner's whiteboard plan (replaces the old file); add HANDOFF.md
- GAUNTLET-PLAN.md, PROJECT.md: phase 4 done (the canvas), notes for phase 5
- Canvas v0 on the home page (gauntlet phase 4)
- GAUNTLET-PLAN.md, PROJECT.md: phase 3 done, local e2e route, notes for phase 4
- Add a local copy of the site for e2e before a push
- GAUNTLET-PLAN.md: all tests, e2e included, pass before pushing to main; how to run e2e before a push
- Add GAUNTLET-PLAN.md: approved canvas plan, decisions and phase status
- PROJECT.md: canvas plan from phase 0 (serving, storage, field mapping, proposal)

## 2026-10-09
- Add CLAUDE.md and AGENTS.md with the testing policy

## 2026-10-06
- Forward /linkkit to Linkkit and link it from the home page
- Create Gauntlet: home page and Boardkit forwarding
