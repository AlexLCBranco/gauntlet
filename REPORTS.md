# Reports — gauntlet

The report at the end of each batch of backlog work, newest first (CLAUDE.md, "Feature backlog, built list and
ideas"), so the owner's Claude chat can read it without a paste.

## 2026-11-21 — GT-6 step 2 (cards leave their list)

**Built:** GT-6 step 2 of 4. GT-6 itself stays in the backlog until step 4.
- Drag a card off its board and let go on the empty page: it leaves its list and stays on the page, where you let go.
  It is gone from /boardkit too, and from the board's map if it has one. It is not in the board's trash: it moved.
- It keeps the size it had on its board (a card from a board at 50% stays small).
- Drag it onto a list of any board: a blue line shows where it lands, the list gets a blue outline, and it is that
  list's card again, at that board's size.
- One Ctrl+Z either way. Undoing a drop on a list puts the card back on the page where it was before that drag.
- Several picked cards go out together (they land one under the other) and go back in together, in the same order.
- A card on the page is saved with the page: it is there after a reload, in a backup, in a board file, and in an
  exported picture.
- Escape while dragging still puts the cards back. A full list (50 cards) still takes no more.

**Different from the step's text:**
- A card on the page loses what its list gave it: its number and the list's colour. Its own colour, highlight, check
  mark and link stay.
- Let go anywhere over a board, a card goes to the nearest list of that board. It can't be left lying on top of a board.
- Delete, Ctrl+D and copy on a card on the page work as for any item on the page (a deleted one comes back with
  Ctrl+Z; it is not in a board's trash). Step 3 is where you say what they should do.

**Question for you:** a card on the page can't be typed in yet (a double-click does nothing). The step doesn't say.
Should a double-click type in its title there too, as on a list? Until then: drop it on a list to change its text.

**Boardkit:** v0.0.110 (a1e5f6b) pushed and pinned. Nothing changes on screen in Boardkit itself.

**Tests:** unit 173 ✓ (Boardkit 242 ✓), e2e 366 ✓ (6 new in e2e/freecards.e2e.ts), Linkkit e2e 30 ✓.
One older test changed: it checked that a drop off every list did nothing, which is no longer true.

**Blocked:** nothing. **Ideas added:** none.

**To test by hand (feel only, can't be automated):** drag a card out and back in on a real page. Is it clear the
card has left its board? Is it easy to aim at a list on the way back?

## 2026-11-21 — GT-6 step 1 (cards are picked and moved on the whiteboard)

**Built:** GT-6 step 1 of 4. GT-6 itself stays in the backlog until step 4.
- One click on a card picks that card. No double-click to "enter" the board first. Shift + click adds or removes one.
- A selection box and the lasso pick single cards (the ones they surround). A box around the whole board picks the board.
- Drag a card to another place in its list, to another list, or to a list of another board on the page. A blue line
  shows where it lands and that list gets a blue outline. Several picked cards move together (a small number shows how many).
- Escape, or a drop that is not on a list, puts the cards back.
- Double-click a card to type in its title (owner's answer).
- Every move is saved in Boardkit (the same board in /boardkit) and one Ctrl+Z undoes it, also a move between two boards.
- The board itself moves by its name, by the gaps between lists, or once picked; a corner still scales everything.
- A card's own buttons (delete, thots, customise, the "+") still work with one press.

**Different from the step's text:**
- A double-click on a part of a board that is not a card (a list's background) still opens the board for editing.
  It is the only way to drag a whole LIST to another place, and the plan says nothing that works today is taken away.
- Delete, Ctrl+D and copy on a picked card do nothing yet: that is step 3.
- A full list (Boardkit's limit: 50 cards) takes no more; the drag says "This list is full. A list holds 50 cards."

**Also fixed:** a Boardkit bug found on the way. Opening a board again on the whiteboard counted as a new undo step,
which would have made some Ctrl+Z presses do nothing. Has a test that fails on the old code.

**Boardkit:** v0.0.109 (80d0e18) pushed and pinned. Nothing changes on screen in Boardkit itself.

**Tests:** unit 172 ✓ (Boardkit 236 ✓), e2e 360 ✓ (9 new in e2e/cards.e2e.ts), Linkkit e2e 30 ✓.
Live (7c79ae4, Boardkit v0.0.109): 351 ✓, 8 skipped, 1 ✗. The 9 card tests pass live. The failure is
slatehover.e2e.ts:259 (GT-13): on /calendar itself, hovering today's first fatigue chip showed no day squares, so the
test had nothing to compare the whiteboard's popup with. Same calendarkit version as the pin (v1.92.1); /calendar got
a new schedule snapshot today. It passed locally minutes earlier. Not caused by this step.
Looked into the same day (owner: "Yes, look into it"): a race in the test, no app bug. The test measured where the
chip was as soon as the first card showed; on a busy machine the Slate's cards still moved a little after that, so
the pointer landed on the "2d" rest chip one row up and that chip's popup opened (seen in the failure screenshot).
Alone it passed 3 of 3; four at once against the live site it failed 2 of 12. The test now points at the chip again
until the right popup shows: 24 of 24 under the same load.
10 older tests were updated: they assumed a card could only be touched after entering its board.

**Blocked:** nothing. **Ideas added:** none.

**To test by hand (feel only, can't be automated):** drag a few cards around on a real page. Is the lifted card,
the blue line and the outline easy to follow? Does grabbing the board by its name feel right? (The name's top edge
is the board's edge, which resizes: grab the name a little lower.)

**Needs your attention:**
- Edge of the screen: dragging a card to the window's edge does not scroll the page (tldraw's own drags do).
  Zoom out or move the page first. Say if you want it.
- Card buttons that are not hover buttons (check circle, thots) still need the board opened first, as before.
- Next: step 2 (cards leave their list), when you say so.

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
