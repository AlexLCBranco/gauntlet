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

### GT-1 — One broken widget never breaks the page
(was speed session Part 7)
Check whether each widget (board, map, Slate, web embed) is wrapped so an error inside it shows a small
"this widget failed" box and the rest of the whiteboard keeps working. Add it where missing, with a test per widget
type that forces an error and checks the rest of the page still works (select, drag, type, change page).

### GT-2 — Resizing a text box scales its font
(was speed session Part 10)
Today changing a text box's size does not change the font size. Dragging a text box's corner makes the text bigger
or smaller with the box, like scaling an image. If dragging a side handle should keep changing only the width
(re-wrapping), keep that, and say in the report which handle does what. Check tldraw 5.5.2's own source for how text
scaling works before building. Our font sizes live in meta (fontPx, lineHeight): keep them in sync with the scaled
size so the style panel shows the real size. Undo restores the old size in one step. Tests: corner scaling, side
resizing, undo, size survives a reload.

### GT-3 — Today's date in one click
(was speed session Part 11)
The owner makes a board every day and types the date by hand (e.g. "4/11", day/month). Add a "today's date" item to
the stamps tray (src/stamps/): one click (or drag) drops today's date as normal text in America/Sao_Paulo, format d/m
like "4/11". Fixed text, editable like any text, never changes by itself. If a better one-click place than the stamps
tray exists, propose it in the report, but build the stamp. Tests: right date (mock the clock, including just after
midnight), text is editable and saved.

### GT-5 — Slate step 5: live scores and changes reach the widget
(Slate track, PROJECT.md DECISIONS 2026-10-31, step 5)
Final scores show on a Slate once games end; changes to a game card in calendarkit reach the widget on the
whiteboard without a reload. The widget stays pinned to its date and still stores only date and size, never games.
Tests across both repos (gauntlet and calendarkit).

### GT-10 — Save a board as a frozen archive file, load it back and edit
(owner, 2026-11-16, chat)
The owner makes a board every day and wants to keep past days. A PNG is useless: widgets must stay hoverable.
- **Save board → file**: one action saves the current board (all pages, or the current one — propose which in the
  report) to a file on disk (reuse the backup-folder mechanism if it fits). The file holds the full whiteboard plus a
  **frozen copy of every widget's data at save time** (Slate's games for its date, Boardkit lists/cards, Linkkit maps,
  web embeds as their link). The file must be self-sufficient: opening it later never pulls today's data.
- **Load file → gauntlet**: opens as a normal, fully editable board (move, draw, type, add widgets). Frozen widgets
  keep working (hover popups, clicks, List | Map | Both) using the frozen data, and show a small "frozen" badge.
- **Edits stay in the file (owner chose A)**: editing a frozen widget (e.g. adding a card to an old list) changes only
  that board's frozen copy; live Boardkit boards, Linkkit maps and calendarkit data are never touched.
- **"Go live" per widget**: a button on a frozen widget reconnects it to the live data (replacing the frozen copy,
  undoable in one step). Never automatic.
- Not a change to GT-5: live Slates on normal boards still store only date and size; freezing happens only in the
  saved file.
Tests: save → load round-trip keeps every widget and its data; a frozen Slate shows the saved games after the live
schedule is mocked to change; editing a frozen list leaves the live Boardkit board unchanged; "Go live" switches to
live data and undo restores the frozen copy; badge shows on frozen widgets only; perf.e2e.ts passes without raising
any limit.

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
