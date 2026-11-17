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

### GT-7 — Slate looks like the calendarkit copy: 2 columns, notes shown or hidden
(owner, 2026-11-16, chat)
The owner copy-pastes Slates from calendarkit instead of using the toolbar's Slate, because the widget comes out as
one narrow column (columns chosen once at insert, PROJECT.md DECISIONS 2026-10-31). The Slate widget must look like
that copy-paste, with the plus of being live (hover, links, ‹ › as today).
- Always 2 columns. The "columns chosen at insert" rule and its `cols` choice go away (no reflow when a note grows
  stays true: the column count is fixed at 2).
- Notes shown: 2 columns in whatever layout calendarkit's own copy uses with notes on (no third layout invented).
  Notes hidden: 2 columns of the wide cards, exactly like the copy-paste with notes hidden. Use calendarkit's
  existing hideNotes (src/components/SlateView.tsx) and its copy component, not a whiteboard copy.
- A new Slate starts with notes SHOWN.
- A show/hide notes button in the Slate's "‹ date ›" bar (only while one Slate is selected). Saved per widget
  (a shape prop; still never games), one undo step, survives reload and backups.
- Existing Slates switch to the new layout (owner: he wasn't using them).
- Speed: perf.e2e.ts must pass without raising any limit (hover with 3 Slates is already 24-26 ms vs 25).
Tests: insert → 2 columns, notes shown; toggle hides/shows, one undo, reload keeps it; layout matches calendarkit's
copy in both states (as the step-2 visual check); old Slate shapes load in the new layout.

### GT-8 — Slate tight grid (calendarkit CK-7 on the whiteboard)
(owner, 2026-11-16, chat)
Blocked: until calendarkit's CK-7 (divider lines instead of gaps) ships.
Then: pin that calendarkit version; the widget shows the tight grid (1 px dividers, square corners, every card's info
still there) in both notes states of GT-7. Tests: the GT-7 visual checks against calendarkit's copy updated to the
new layout; perf.e2e.ts passes without raising any limit.

### GT-9 — Slate hover popups close as soon as the cursor leaves (calendarkit CK-6 on the whiteboard)
(owner, 2026-11-16, chat)
Blocked: until calendarkit's CK-6 (hover popups close on leave) ships.
Then: pin that calendarkit version. On the whiteboard: leaving an element closes its popup within 100 ms; element →
element swaps cleanly; element → popup → click its link works; a fast sweep leaves none open; pan/zoom or a press
elsewhere still closes them; with several Slates on a page, never two popups open. Tests in e2e/slatehover.e2e.ts;
perf.e2e.ts passes without raising any limit. Only the feel is left to the owner.

### GT-4 — Slate step 4: notes on the whiteboard
(Slate track, PROJECT.md DECISIONS 2026-10-31, step 4)
Today a Slate's game notes are read-only on the whiteboard. Step 4 as planned: typing notes in the Slate on the
whiteboard, ⇄, notes in the backups. Owner's rules still apply: notes belong to the GAME (calendarkit's localStorage
`ck:notes:v1`, shared, same site), so a note typed on the whiteboard shows in /calendar and the other way round.
Clicking outside the note box saves, like Enter (owner's rule for every widget). Use calendarkit's own component, not
a whiteboard copy. With GT-7's toggle: notes are typed only while shown; hiding them never deletes
or changes a note. Tests: type on the whiteboard → seen in /calendar and after reload; typed in /calendar → seen on
the whiteboard; notes restored from a backup.

### GT-5 — Slate step 5: live scores and changes reach the widget
(Slate track, PROJECT.md DECISIONS 2026-10-31, step 5)
Final scores show on a Slate once games end; changes to a game card in calendarkit reach the widget on the
whiteboard without a reload. The widget stays pinned to its date and still stores only date and size, never games.
Tests across both repos (gauntlet and calendarkit).

### GT-10 — Backlogs page: every repo's planned and built items in one place
The owner wants one small website where he can quickly review all his repos' feature backlogs: what is planned and
what is built, side by side, without opening GitHub. Build it as a page at gauntlet-home.vercel.app/backlogs, served
by this repo's own Vercel deployment (not a rewrite to another app).
- Data: read live from GitHub on each visit, server side, through a function in api/ (like api/unfurl.js), so the
  page is never stale and no daily job is needed. Use a token from a Vercel env var (name it in the report) so
  private repos (rotationkit, and any others) work; never send the token to the browser. Cache the response for a
  short time (about a minute) so reloads are fast. Find repos automatically: every repo of AlexLCBranco that has a
  FEATURE_BACKLOG.md or a BUILT.md, so a new repo shows up without code changes.
- Layout: a list of repos on the left (name, number of planned items, date of the latest built item), click one to
  see it; plus an "All repos" view. For a repo: Planned on the left, Built on the right, never mixed. Planned keeps
  the backlog's own sections (Ready, Held, ...) and shows each item as its ID and title, click to expand its full
  text. Built shows newest day first, the same items as BUILT.md ("### Internal" left out, as scripts/all-built.mjs
  does: reuse its parsing, don't write a second one). A search box filters items across all repos by text or ID.
- A repo that cannot be read (no access, error) is listed with the reason instead of silently missing.
- Desktop only. Same look as the rest of gauntlet-home.
- Add a link to it from wherever gauntlet-home lists its apps, if such a place exists (say where in the report).
- Owner step the report must spell out: how to create the token (fine-grained, read-only Contents on all repos) and
  where to set it in Vercel. Until it is set, the page shows the public repos and lists the private ones as unread.
Tests (automated, mocked GitHub): parsing of a backlog with sections and multi-line items, built days newest first
with Internal skipped, an unreadable repo shown with its reason, search, token never present in the page or its
responses.

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
