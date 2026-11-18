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

### GT-13 — Slate popup on the whiteboard same as calendarkit's
**What:** the team popup on the whiteboard's Slate (image `docs/backlog-img/GT-13-whiteboard-popup.png`) lacks what calendarkit's has (image `docs/backlog-img/GT-13-calendarkit-popup.png`): opponent logo and "vs NYK" / "@ DET" in each day square, the "last played" line and "Record going in". Find why (pinned calendarkit version, or the Slate copy path builds its own popup) and make the whiteboard show exactly calendarkit's.
**Tests:** e2e: same popup text on the whiteboard and on /calendar for the same team and night.

### GT-14 — Football Slate and combined Slate widgets
**What:** next to the NBA Slate widget, a Football Slate widget (footykit's Slate) and a Combined Slate: one Slate with both sports' games sorted by start time, a small sport mark on each card. Each can be placed on its own (NBA only, Football only, Combined). Needs footykit FK-35 first (same card shape); until then this item is `Blocked:` on it. Header: "SLATE · 18-11 · NBA + Football". Live scores and updates as GT-5.
**Tests:** e2e: each of the three widget kinds renders; combined is in time order with both sports.

### GT-15 — Browser tab title follows the page
**What:** the tab title says where you are ("Gauntlet · <page name>"), like calendarkit and footykit already do. Owner's rule for all apps.
**Tests:** e2e: switching page changes the title.

## Held (needs the owner's "go"; never built from "build the backlog")

### GT-6 — Phase 4: things connect (cards go anywhere)
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
