# Speed session (owner's request, 2026-11-12, word for word)

Read PROJECT.md, HANDOFF.md and CLAUDE.md first. This is the planned "speed
session" plus a few owner decisions. Phase 4 stays NOT started. Do one part at
a time, in order; after each part stop and report in a few lines. Follow the
testing policy in CLAUDE.md: everything automatable is automated, no manual
checklists, no browser windows left open.

BACKGROUND (owner's report): with about 19 full pages of screenshots the
whiteboard gets slow in general, and dragging leaves a glitchy trail.

PART 0 - MEASURE FIRST, CHANGE NOTHING
Add a perf test that builds a throwaway whiteboard with 19 pages of realistic
screenshots (generated images around 1920x1080, several per page), then
measures: how long makeBackup + JSON.stringify + the folder write take and how
big the file is; main-thread stalls and frame times while dragging an item and
right after releasing it; time to open the site.
Hypothesis to confirm or refute: src/backup/save.ts runs makeBackup 2.5 s
after every change, which dumps all of localStorage and every IndexedDB
database (tldraw's stored images included, re-encoded to base64 in
src/backup/format.ts) on the main thread; src/backup/auto.ts does the same
every 10 minutes and keeps the full JSON in IndexedDB.
Report the numbers and the real cause before Part 1. If the cause is something
else, say so and propose the fix instead of following Part 1 blindly.

PART 1 - SAVING THAT SCALES
Outcome wanted, whatever the design:
- A small edit never causes every image to be re-read or re-encoded.
- Saving causes no main-thread stall the user can feel (target: no task over
  50 ms from saving, on the Part 0 fixture).
- The backup folder still holds a complete, restorable copy of the whole site,
  and Ctrl+S, the dated copies, the save status and the backup page still work.
- Every existing backup file (gauntlet-save.json, dated copies, in-browser
  automatic backups) still restores.
- Before any format change touches the owner's data, a full backup in the old
  format is written first.
One direction: each image written to the folder once as its own file, and the
frequently rewritten file holding everything except images. If you see a
better design, or real trade-offs, list the options in a few lines and wait
for the owner's choice.
The Part 0 test becomes a permanent perf test with limits.

PART 2 - IMAGES ON THE PAGE
tldraw is pinned at 5.5.2: check its own docs/source for how images are stored
and resolved under persistenceKey; do not assume.
- No image should live as a data URL inside a document record. Check pasted
  images, stamps (src/stamps/store.ts) and the Excalidraw import, and fix any
  that do, migrating existing ones safely.
- An image shown small should not be drawn from its full-resolution original
  if tldraw offers a way to serve a smaller version. Report if it does not.
- Confirm only the current page's shapes are mounted. Report, fix if not.

PART 3 - NOTHING ARRIVES TOO BIG
Rule: anything placed on the whiteboard (pasted or inserted image, Slate,
board, map) arrives with all four corners inside the visible window at 100%
zoom, so the owner never needs browser zoom to reach a resize handle.
- Pasted/inserted images larger than that are scaled down to fit.
- A new Slate currently fits the whole night to 90% of the page (fitBoard,
  FIRST_ROOM). Owner: far too big. Start it at about a third of the visible
  window's width; keep the column rule sensible at that size.
- Tests: insert each kind and assert the corners are inside the window.
- If calendarkit's cards cannot shrink below some width, report it; that fix
  belongs in calendarkit's shared code.

PART 4 - SLATE STEP 3: GO
The owner gives the "go" for Slate step 3 as planned in PROJECT.md. His
requirement: hovering a Slate on the whiteboard must feel like hovering it in
/calendar, with the same extra information popping up, without selecting the
widget first. Popups must not be clipped by the widget's box or hidden behind
other items, and must stay at normal reading size however small the widget is
scaled. Use calendarkit's own component, not a whiteboard copy. Test: hover on
the whiteboard shows the same popup content as in /calendar.

PART 5 - WIDGET PARITY CHECK (boards and maps)
Same principle: a widget on the whiteboard behaves like it does in its app.
List every hover behaviour in /boardkit and /linkkit that does not work on the
whiteboard without selecting or editing the widget first. Fix the ones that
are small; report the rest with a size estimate. Do not redesign map editing.

PART 6 - COPIES ARE INDEPENDENT
Today, copying a board widget on the whiteboard gives a second widget on the
SAME board: editing one changes the other. Owner's decision:
- Copy/paste or duplicate of a board or map widget INSIDE the whiteboard makes
  a new board/map with its own data (a linked board+map pair is copied as a
  new linked pair). One undo step removes the copy and its data.
- Unchanged: a board opened in /boardkit and shown on the whiteboard is one
  thing, and a board copied in /boardkit and pasted on the whiteboard is that
  same live board.
- A copied Slate keeps its own date and size; games stay live.
Tests for each case.

PART 7 - ONE BROKEN WIDGET NEVER BREAKS THE PAGE
Check whether each widget (board, map, Slate, web embed) is wrapped so an
error inside it shows a small "this widget failed" box and the rest of the
whiteboard keeps working. Add it where missing, with a test that forces an
error.

PART 8 - WRITE DOWN PHASE 4 DECISIONS (no code)
Add to PROJECT.md DECISIONS, for when phase 4 starts:
- A card dropped on the empty page leaves its list and lives only on the
  whiteboard until dropped into a list again.
- A copied card is a new, independent card.
- A board is dragged by its title AND by the gaps between its lists.
- While dragging a card, a line shows where it will land and the target list
  is highlighted.
- Dragging a board's corner still scales everything together.
- Ctrl+Z on the whiteboard undoes a card move that also changed Boardkit data.
- When a card is deleted, arrows and notes attached to it go with it.
- Phase 4 starts only after this round is live and the owner says "go".

NOT IN THIS ROUND: phase 4 itself, map editing redesign, cloud storage or
sync, anything not listed above. New ideas go to the IDEAS list.

REPORTS: per part, what changed in one or two lines, test results in one line
(e.g. "unit 88 ok, e2e 94 ok, live ok"), numbers before/after for Parts 0-2,
and anything the owner must decide. Update HANDOFF.md after every part.

# Parts 9-11 (owner's request, 2026-11-13, word for word)

Done after Part 8, in order, one at a time, stopping to report after each like
the other parts. Parts 3-8 are not reordered or skipped. Phase 4 stays NOT
started.

PART 9 - PAGE EXPORT DRAWS BOARDS WRONG (bug, owner 2026-11-09, still there)
Exporting a page to PNG draws a Boardkit board wrong: list titles squeezed and
wrapped, edit boxes with a white border visible around the list title and
every card's text, and card text not using the card's full width. The Slate
(calendar) widget exports correctly, so compare with how it is exported. The
exported picture must look exactly like the board on screen. Find the cause
(whiteboard export code or Boardkit's own components) and fix it in the right
repo. Test: export a page with a board, a map and a Slate and compare each to
an on-screen screenshot of the same page (pixel comparison with a tolerance).

PART 10 - RESIZING A TEXT BOX SCALES ITS FONT
Today changing a text box's size does not change the font size. Owner wants:
dragging a text box's corner makes the text bigger or smaller with the box,
like scaling an image. If dragging a side handle should keep changing only
the width (re-wrapping), keep that, and say in the report which handle does
what. tldraw is pinned at 5.5.2: check its own source for how text scaling
works before building anything. Our font sizes live in meta (fontPx,
lineHeight): keep those in sync with the scaled size so the style panel shows
the real size. Undo restores the old size in one step. Tests for corner
scaling, side resizing, undo, and that the size survives a reload.

PART 11 - TODAY'S DATE IN ONE CLICK
The owner makes a board every day and types the date by hand every time
(e.g. "4/11", day/month). Add a "today's date" item to the stamps tray
(src/stamps/): one click (or drag) drops today's date as normal text in the
owner's time zone (America/Sao_Paulo), format d/m like "4/11". It is fixed
text, editable like any text, and never changes by itself. If a better
one-click place exists than the stamps tray, propose it in the report but
build the stamp. Tests: the stamp drops the right date (mock the clock,
including just after midnight), and the text is editable and saved.

REPORTS: same format as the other parts. Update HANDOFF.md after every part.
