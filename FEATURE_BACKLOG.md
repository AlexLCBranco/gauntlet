# Feature backlog — gauntlet

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are GT-1, GT-2, ... (never reused; GT is this repo's prefix, unique across the owner's repos).

Moved here 2026-11-16 from the open parts of `docs/SPEED-SESSION.md` (Parts 7, 10, 11), the Slate track in PROJECT.md
DECISIONS (2026-10-31, steps 4-5) and PROJECT.md section 6 (phase 4). Those docs are now history; this file is the plan.
Speed session Part 8 (write phase 4 decisions, no code) is dropped: its decisions are inside GT-6 below.

General rules for every item: one item at a time, stop and report after each (what changed in one or two lines, test
results in one line), update HANDOFF.md. Testing policy in CLAUDE.md: everything automatable is automated, no manual
checklists, no browser windows left open. tldraw is pinned at 5.5.2: check its own source before relying on behaviour.

## Ready

### GT-14 — Football Slate and combined Slate widgets
**In short:** Two new Slate widgets on the whiteboard: football only, and football plus NBA together in time order.
**What:** next to the NBA Slate widget, a Football Slate widget (footykit's Slate) and a Combined Slate: one Slate with both sports' games sorted by start time, a small sport mark on each card. Each can be placed on its own (NBA only, Football only, Combined). Needs footykit FK-35 first (same card shape); until then this item is `Blocked:` on it. Header: "SLATE · 18-11 · NBA + Football". Live scores and updates as GT-5.
Blocked: (2026-11-21) FK-35 shipped, but the "same card shape" it promised no longer holds, and the combined Slate needs answers and kit work first: (1) footykit's cards are now 561 × 96 (FK-50, FK-53, FK-73), calendarkit's 509 × 78: how do the two sit in one grid (football's size for every cell with NBA cards padded, each card its own size, or footykit back to 509 × 78)? (2) Neither kit offers one card on its own: footykit's part draws a whole day (SlateDay) and calendarkit's a whole night with its own header (SlateCopy), so cards can't be mixed in time order or given a sport mark until both export a single card (new footykit and calendarkit items). (3) Which games are "18-11" in a combined Slate: the NBA night is a US Eastern date, football's day is the local (São Paulo) day. (4) No footykit Slate kit is served at run time as calendarkit's is (/calendar/slatekit/): is a pinned footykit package enough (a new card design then needs a new pin here), or should footykit get a kit too? The owner answers and unblocks.
**Tests:** e2e: each of the three widget kinds renders; combined is in time order with both sports.

### GT-16 — Countdown button in the Slate widgets
**In short:** The Slate widgets on the whiteboard get the same "⏱ Countdown" button as calendarkit and footykit, opening halftime-timer counting down to the first game.
**What:** after calendarkit CK-22 (and footykit FK-61 for the football / combined Slate, GT-14) ship, bump the pinned packages and make sure the button works inside the widgets (opens halftime-timer in a new tab, doesn't interfere with selecting or dragging the widget). Combined Slate: counts to the first game of either sport.
Blocked: waits for calendarkit CK-22 (and footykit FK-61 for the football and combined Slates); the owner unblocks it once they ship.
**Tests:** e2e: the button is in the NBA Slate widget and its link points to halftime-timer with the right time.

### GT-6 — Cards go anywhere
**In short:** Cards become real whiteboard objects you can grab and move anywhere, in or out of lists.
Build one step at a time (docs/GT-6-PLAN.md), stopping to report after each.
Owner's decisions (2026-10-20, 2026-11-12):
- Cards become real whiteboard objects: directly clickable, draggable, selectable by box and lasso, no double-click
  to enter a board first. No interim "two clicks" mode.
- A board works like a frame: a named container, moved by its title AND by the gaps between its lists, or by
  selecting it. Dragging a board's corner still scales everything together.
- A card dropped on the empty page leaves its list and lives only on the whiteboard until dropped into a list again.
  If its board has a linked map, the card leaves the map too.
- A copied card is a new, independent card.
- While dragging a card, a line shows where it will land and the target list is highlighted.
- Ctrl+Z on the whiteboard undoes a card move that also changed Boardkit data, in one step.
- Every card change on the whiteboard saves to Boardkit too (same live board in /boardkit).
Scope cut 2026-11-21 (owner, chat): GT-6 is only the four steps in docs/GT-6-PLAN.md (pick and move cards, cards
leave their list, copy and delete, speed and clean-up). Arrows on a card, things stuck to a card and arrows on a
map box are now GT-18, GT-19, GT-20 under Held: decided after the owner has used GT-6 for real.
**Answered (2026-11-21):** How do you edit a card's text without entering the board first? → Double-click the card.
**Answered (2026-11-21):** A card dragged out of a board scaled to 50%: small or full size? → It stays small; dropped into another board, it takes that board's size.
Owner said "go" 2026-11-21, steps OK'd. Step 1 (pick and move cards) and step 2 (cards leave their list) built 2026-11-21; steps 3-4 wait for the owner's word, one at a time.

## Held (needs the owner's "go"; never built from "build the backlog")

### GT-18 — Arrows attach to one card
**In short:** An arrow's end can snap to a single card and stays on it wherever the card goes.
**What:** after GT-6. An arrow's end snaps to a single card (in a list or free on the page) and stays attached when
the card, its list or its board moves, and when the card changes list. Deleting the card deletes its arrows.
**Tests:** e2e: attach, then move card / list / board / to another list / out to the page; delete card.

### GT-19 — Things stick to a card
**In short:** Text, shapes, pictures or drawings can be attached to a card and then follow it everywhere.
**What:** after GT-6. Anything can be attached to a card (owner, 2026-11-21); it follows the card through list
moves, board moves and scaling, and is deleted with it.
Blocked: the owner hasn't decided how a thing gets attached: by dropping it on top of the card (and dragging it off
lets go), or some other way?
**Tests:** e2e: attach each kind; follows through list moves, board moves, scaling; delete; detach; undo.

### GT-20 — Arrows attach to one box of a map
**In short:** An arrow's end can snap to a single box inside a Linkkit map and stays on it.
**What:** after GT-18. Same as GT-18, for a single box inside a map on the whiteboard. Needs a Linkkit release.
Blocked: the owner hasn't decided whether only arrows attach to map boxes, or boxes also become objects picked
with one click, like cards.
**Tests:** e2e: attach; edit the map so the box moves; move/scale the map; delete the box.
