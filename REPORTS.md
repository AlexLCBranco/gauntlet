# Reports — gauntlet

The report at the end of each batch of backlog work, newest first (CLAUDE.md, "Feature backlog, built list and
ideas"), so the owner's Claude chat can read it without a paste.

## 2026-11-18 — GT-12

**Built** (live; local and live suites pass): GT-12 — Hide the style menu while editing a widget under it. The style
panel (Opacity / Layers / Actions) hides while a board, map, web embed or a Slate note under it is being edited, and
comes back when the editing ends. A widget elsewhere on the page doesn't hide it.

**Agent's reading of the spec:** "being edited" = a widget opened with a double-click (board, map, web embed) or a
Slate note being typed in; "in that area" = the widget's box on screen overlaps the panel.

**Blocked:** none. **Ideas added:** none.

**To test by hand** (feel only): whether the panel vanishing and coming back feels right while you work.

## 2026-11-18 — GT-11

**Built** (live; local and live suites pass): GT-11 — Slate notes box: fixed 3 lines, scroll inside. Every note box,
on the whiteboard and in /calendar, is 3 lines tall, empty or not, so every card is the same height; a longer note
scrolls inside (on the whiteboard the wheel now scrolls an open note instead of panning). calendarkit v1.78.0.

**Owner's choice:** copied pictures keep each note whole (cards in a picture may still differ in height).

**Blocked:** none. **Ideas added:** none.

**Notes:** calendarkit's two-tab notes test (notes.spec.ts:173) fails now and then under load and passes alone
(6/6): flaky, not from GT-11.

**To test by hand** (feel only): reading and scrolling a long note in a 3-line box.

## 2026-11-18 — GT-1, GT-2, GT-3, GT-5, GT-10

**Built** (all live; local and live suites pass):
- GT-1 — One broken widget never breaks the page: a failing board, map, Slate or web embed shows "This … widget
  failed" with Try again, and can still be selected, moved and deleted.
- GT-2 — Resizing a text box scales its font: corners scale the text (the style panel shows the real size, e.g.
  "Font size · 36.5 px"); side handles change only the width and re-wrap; one undo.
- GT-3 — Today's date in one click: a "Today" item first in the stamps tray (Y) drops the date as d/m in São Paulo
  time (click: where the pointer was; drag: where let go), as normal editable text.
- GT-5 — Slate live scores and changes: final scores within minutes of a game's end (ESPN, with the odds); a newer
  schedule and any new calendarkit Slate design reach an open whiteboard without a reload (every 5 min and when the
  tab comes back). calendarkit v1.76.0 made for it; the whiteboard now loads calendarkit's Slate at run time, the
  pinned copy is the fallback.
- GT-10 — Board archive files: main menu "Save board to file" (the current page, with every widget's data frozen)
  and "Open board file…" (a new page; boards and maps as "(archive d/m)" copies in /boardkit and /linkkit; Slates
  from the saved schedule; badge "Frozen d/m" with "Go live", one undo). calendarkit v1.77.0 made for it.

**Owner's choices asked on the way:** GT-5: ESPN for same-night scores; "changes" = schedule, scores/odds and
calendarkit code. GT-10: current page; opens as a new page; frozen copies listed in the apps; edits saved by
saving again.

**Blocked:** none. **Ideas added:** none.

**Not covered / known gaps:**
- GT-10: a Boardkit board's background picture is not inside the file (Boardkit keeps it apart, by id); a web embed
  is only its link.
- GT-3: a better one-click place than the tray would be its own key (e.g. Shift+D); not built.
- The Slate hover speed check (perf.e2e.ts) stays near its 25 ms limit on a loaded PC or against the live site;
  GT-10 had made it worse (a tldraw toasts hook in the main menu), fixed before shipping (local p95 ~20 ms).

**To test by hand** (feel only, can't be automated): the look of the failed-widget box, the Today tile and the
Frozen badge; Slates on a live game night (scores arriving).
