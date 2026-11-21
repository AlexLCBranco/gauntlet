# GT-6 — step plan (cards go anywhere)

Written 2026-11-21 after the owner's "go". The spec and the owner's decisions are in FEATURE_BACKLOG.md (GT-6);
this file is only the order of the work. Status: the owner OK'd the steps (2026-11-21) and then cut the scope in
Claude chat the same day: GT-6 is steps 1-4 below. The old steps 4-6 (arrows on a card, things stuck to a card,
arrows on a map box) are GT-18, GT-19, GT-20 under Held in the backlog, not part of this plan. The owner answered
both questions and said to build (2026-11-21). STEP 1 DONE 2026-11-21 (what was built: PROJECT.md DECISIONS, same
date). STEP 2 DONE 2026-11-21 (owner: "Start gt-6 step 2"). NEXT: step 3, when the owner says so.

Rules for every step: one step at a time, stop and report after each. Each step has its own e2e tests, goes live
on its own, and takes nothing away that works today. Tick steps off here; a fresh session reads this file first.

## How it is today (what the steps change)

- A board on the whiteboard is ONE whiteboard object. Its cards are drawn inside it by Boardkit's own code and
  ignore the pointer until the board is "entered" with a double-click (src/boards/BoardShape.tsx).
- Dragging cards is Boardkit's own drag, only while the board is entered. It cannot leave the board.
- The page's undo already knows three kinds of step (drawing, board, map) and keeps their order
  (src/whiteboard/pageUndo.ts). A step that changes both the drawing and a board does not exist yet.
- Lasso and box select pick a whole board only. (Arrows attach to a whole board or map only: unchanged by GT-6.)

## How it will work (one design for all steps)

- Every card on a board gets its own whiteboard object (a "card object"), a child of its board. The board still
  lays the lists out (Boardkit's code, same look); each card object sits exactly where its card is drawn and
  follows it. That one object is what gets clicked, box/lasso-selected and dragged (and, later, what arrows
  attach to: GT-18).
- A card outside every list ("free card") is the same kind of object with the card's data kept on the whiteboard
  page (so page saves, backups, archive files and exports cover it). It is not in /boardkit until it is dropped
  into a list again.
- Card moves are done by the whiteboard and written to Boardkit's record with Boardkit's own ordering code.
- Undo: a new "both" step in pageUndo.ts, so one Ctrl+Z puts back the drawing and the board together.
- Needs new Boardkit releases (draw one card on its own, take a card out, put a card in at a place, switch its
  own card drag off on the whiteboard). Each is made in that step and pinned here.

## Steps

- [x] 1. **Pick a card with one click, and move it between lists.** One click on a card selects that card (no
  double-click to enter the board). Box select and lasso pick single cards. Dragging a card moves it inside its
  list or to another list of any board on the page: a line shows where it lands, the target list lights up.
  Several picked cards move together. The board itself moves by its title, by the gaps between its lists, or
  once selected; its corner still scales everything. Card buttons, "+" and list menus work with one press as
  now. Each move saves to Boardkit and is one Ctrl+Z. The old "enter the board" mode is removed for lists.
  Tests: click/box/lasso pick one card; drag within and across lists and across two boards; the line and the
  highlight; /boardkit shows the same order; one undo, one redo; board moved by title and by a gap.
- [x] 2. **Cards leave their list.** A card dropped on the empty page becomes a free card: it is gone from its
  list (and from /boardkit) and stays on the page. Dropped on a list again (any board), it is that list's card
  again. One Ctrl+Z either way. Free cards are saved, backed up, archived and exported with the page.
  Tests: out and back in; undo/redo each; reload keeps it; backup + restore keeps it; archive file keeps it;
  a card taken out of a board with a linked map is gone from the map too.
- [ ] 3. **Copy and delete.** A copied card (copy/paste, Ctrl+D, Alt-drag) is a new card of its own, in a list or
  free, wherever it is put. Delete removes the picked cards (a list's card goes to Boardkit's trash, as now).
  Tests: each way of copying, in a list and free; the copy changes alone; delete + undo.
- [ ] 4. **Speed and clean-up.** Measure a realistic page (many boards, many cards) against today's limits in
  e2e/perf.e2e.ts and fix what got slower. Remove dead code, update PROJECT.md DECISIONS and HANDOFF. GT-6 moves
  to BUILT.md here; steps 1-3 are listed there as they go live, without the ID.

## The owner's answers (2026-11-21)

1. (step 1) Editing a card's text: **double-click the card** to type in its title.
2. (step 2) A card dragged out of a board scaled to 50% **stays small** (the size it had on that board); dropped
   into a board at another scale, it takes that board's size.

## Step 2 as built: what differs from the step's text

- A card on the page shows what is its own (text, colour, highlight, check mark, link). What its list gave it is
  gone: its number and the list's colour. Without the number its text has a little more room.
- A card on the page can't be typed in yet (a double-click does nothing): the step's text doesn't say, the owner
  decides. To change its text, drop it on a list first.
- A card on the page is the page's own item: it moves, nudges and lines up like a picture. Delete, Ctrl+D and copy
  on it are tldraw's own for now (step 3 says what they should do). It has no handles: it keeps its size.
- Let go anywhere over a board, a card goes to the nearest list of that board (as in step 1), never "on top of" it.
- Several cards dropped on the page together land one under the other, in the order they were drawn.

## Step 1 as built: what differs from the step's text

- A double-click on a part of a board that is not a card (a list's background or header) still opens the board
  for editing, as before: that is the only way to drag a LIST to another place (Boardkit's own drag), and the plan
  says nothing that works today is taken away. Cards never need it.
- Delete, Ctrl+D and copy on a picked card do nothing yet (step 3). Picked cards show no style panel and no
  resize handles.
- A selection box picks the cards it fully surrounds (the whiteboard's existing rule for every item).
- A full list (50 cards, Boardkit's limit) takes no more: the drag says "This list is full. A list holds 50 cards."
