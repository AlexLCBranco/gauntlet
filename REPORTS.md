# Reports — gauntlet

The report at the end of each batch of backlog work, newest first (CLAUDE.md, "Feature backlog, built list and
ideas"), so the owner's Claude chat can read it without a paste.

## 2026-11-21 — the 5 red Slate / archive tests (no backlog item)

**Fixed** (owner: "Yes, fix them"). Causes, all on the test side or the pin; the widget itself was right:
- slate.e2e.ts:963: the pin was calendarkit v1.78.1 while /calendar serves v1.92.1. Pin moved to v1.92.1 (7d6ca62).
- slate.e2e.ts:255, notes shown: calendarkit CK-11 (v1.88.1) put the ⇄ switch on every card of the widget on purpose;
  the test still expected no button. It now expects one ⇄ per card (none with notes hidden) and no other button.
- slate.e2e.ts:255, notes hidden: the header line (CK-10, v1.82.0) was not in the test's list of the Slate's boxes, so
  the 1-device-pixel rounding of its edge counted as "something between the cards" (100 px at 4x). It is in the list now.
- archive.e2e.ts:95 and :144: Cup squares carry `data-game-id` as cards do; the tests now look for the card.

**Needs your attention:** nothing made sure the whiteboard's tests ran when calendarkit shipped v1.79-v1.92, so the
live suite was red for days unnoticed. Same risk at the next calendarkit change.

## 2026-11-21 — GT-17 (GT-14, GT-16 blocked)

**Built:** GT-17 — Main menu button matches the toolbar. The ☰ button is a floating box like the toolbar (44 px tall,
same corners, background and shadow, 6 px from the top edge, so on the toolbar's centre line), 8 px from the left edge,
in line with the style panel under it. CSS only (src/whiteboard/chrome.css); e2e at 1400 and 700 px wide.
Side effect: the ☰ box is 10 px wider than the old button and the centred toolbar keeps clear of it on both sides, so
a bar with every tool pinned needs a 20 px wider window than before (the default bar is unchanged, checked at 640 px).
Two tests followed: the "full bar" test runs at 740 px (was 720), and a full-page test's first rectangle starts at
70, 70 (40, 40 is now under the ☰ box).

**Blocked:** GT-14 — Football Slate and combined Slate widgets. footykit FK-35 shipped, but its "same card shape" no
longer holds and the combined Slate can't be built from what the two kits offer. Four things are missing (full note
in the backlog): (1) football cards are now 561 × 96, NBA cards 509 × 78: how they sit in one grid; (2) neither kit
exports a single card (footykit draws a whole day, calendarkit a whole night with its header), so cards can't be mixed
in time order or get a sport mark without new footykit and calendarkit items; (3) which games belong to one date
(NBA: US Eastern night; football: São Paulo day); (4) pinned footykit package only, or a run-time kit like
calendarkit's. Nothing of GT-14 was built (not the football-only widget either: the item ships whole).
GT-16 — Countdown button in the Slate widgets: still waits for calendarkit CK-22 (not in calendarkit's BUILT.md) and
footykit FK-61 (still in footykit's backlog).

**Needs your attention:** 5 e2e fail with and without this change (same 5 on the old code): calendarkit went from
v1.78.1 (the pin) to v1.92.1 and the whiteboard's tests were not updated. slate.e2e.ts:963 (the pin is not the version
/calendar serves), slate.e2e.ts:255 twice (5 buttons inside the widget where the test expects none; 100 non-background
pixels between cards), archive.e2e.ts:95 and :144 (the new Cup squares carry `data-game-id` too, so the tests' card
count and card locator match them). Not looked into further: whether each is a stale test or a real change in the
widget is not known yet. perf.e2e.ts hover p95 with 3 Slates failed once at 31 ms (limit 25; known borderline, HANDOFF)
and passed in the full run.

**Ideas added:** none.

**To test by hand:** nothing (GT-17 is covered by e2e); only whether the ☰ box looks right to you next to the toolbar.

## 2026-11-18 — GT-13, GT-15

**Built:** GT-13 — Slate popup on the whiteboard same as calendarkit's. Cause: the whiteboard's Slate called
calendarkit's popup without the lookup /calendar gives it for the day squares' matchups, and calendarkit's Slate kit
didn't offer that lookup. calendarkit v1.78.1 now exports it and the whiteboard passes it: each day square shows the
opponent's logo and "vs NYK" / "@ DET" with a link to the game. The "last played" and "Record going in" lines
were already the same: the two screenshots show different nights (Nov 18, 2nd of a back-to-back, with Nov 17 not yet
final, has neither line in /calendar either). The e2e compares the popup word for word, squares included.
GT-15 — Browser tab title follows the page: "Gauntlet · <page name>", changing with ‹ ›, a new page, a rename.

**Blocked:** none. **Ideas added:** none.

**To test by hand:** nothing (both are covered by e2e).

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
