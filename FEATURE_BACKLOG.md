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
**Tests:** e2e: each of the three widget kinds renders; combined is in time order with both sports.

### GT-16 — Countdown button in the Slate widgets
**In short:** The Slate widgets on the whiteboard get the same "⏱ Countdown" button as calendarkit and footykit, opening halftime-timer counting down to the first game.
**What:** after calendarkit CK-22 (and footykit FK-61 for the football / combined Slate, GT-14) ship, bump the pinned packages and make sure the button works inside the widgets (opens halftime-timer in a new tab, doesn't interfere with selecting or dragging the widget). Combined Slate: counts to the first game of either sport.
Blocked: waits for calendarkit CK-22 (and footykit FK-61 for the football and combined Slates); the owner unblocks it once they ship.
**Tests:** e2e: the button is in the NBA Slate widget and its link points to halftime-timer with the right time.

## Held (needs the owner's "go"; never built from "build the backlog")

### GT-6 — Phase 4: things connect (cards go anywhere)
**In short:** Cards become real whiteboard objects you can grab and move anywhere, in or out of lists.
Start only when the owner says "go" for GT-6; then move it to Ready. Plan it in steps first (stop after the plan),
then build one step at a time, stopping to report after each.
Owner's decisions (2026-10-20, 2026-11-12):
- Cards become real whiteboard objects: directly clickable, draggable, selectable by box and lasso, no double-click
  to enter a board first. No interim "two clicks" mode.
- A board works like a frame: a named container, moved by its title AND by the gaps between its lists, or by
  selecting it. Dragging a board's corner still scales everything together.
- A card dropped on the empty page leaves its list and lives only on the whiteboard until dropped into a list again.
- A copied card is a new, independent card.
- While dragging a card, a line shows where it will land and the target list is highlighted.
- Ctrl+Z on the whiteboard undoes a card move that also changed Boardkit data, in one step.
- Arrows attach to a single card inside a board and a single box inside a map, and stay attached when things move.
- Things attached to a card follow it when it moves; when a card is deleted, arrows and things attached to it go with it.
- Every card change on the whiteboard saves to Boardkit too (same live board in /boardkit).
Open question for the owner before step 1: the original plan said "notes stick to cards", but sticky notes were removed
from the toolbar (2026-10-22). What gets attached to a card: text, rectangles, anything? Ask; do not pick a default.
