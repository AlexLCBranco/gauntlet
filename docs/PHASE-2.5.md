# PHASE 2.5 — POLISH ROUND (owner's fixed list, 2026-10-20)

Status: ticked items are done (and committed). An agent picking this up mid-way
continues from the first unticked item.

First: save this whole message as docs/PHASE-2.5.md and tick items off there as you go, so a cut-off session can continue. Read PROJECT.md and HANDOFF.md as usual. One agent in the repo at a time.

Work in the order of the groups below. Commit after each group (small commits inside a group are fine). Testing per item 6 below. Stop and report only at the end, or earlier if something blocks you. Any item that needs the Boardkit repo (~/Projects/boardkit, github.com/AlexLCBranco/boardkit): change it there, push its main, bump the pinned commit in gauntlet's package.json. Standalone /boardkit must look and work exactly as before unless an item says otherwise; the whiteboard-only behaviour goes in Boardkit's whiteboard mode (src/app/whiteboard/).

## GROUP A — Docs and rules (do first, cheap)
- [x] 1. HANDOFF.md: hard limit 100 lines. Move everything about finished work, word for word, to docs/HISTORY.md (nothing deleted). HANDOFF keeps only: current state, half-done work, anything broken, anything with a deadline (tldraw hobby key now installed in Vercel Production, valid until 2027-10-20; Preview still has the evaluation key that expires 2026-11-01, so previews lose the whiteboard after that; test on localhost then), and the next step. Remove the stale "wait for the owner's hand test" notes. Add the rule to PROJECT.md: "HANDOFF.md never exceeds 100 lines. When a task is done, move its entry to docs/HISTORY.md. Open items, broken things, deadlines and the next step never leave HANDOFF while still true. If 100 lines is truly too tight, say so in the report instead of going over."
- [x] 2. PROJECT.md DECISIONS is missing decisions that only went into HANDOFF. Add them with dates and reasons, taken from HANDOFF: (a) the page is at least the window's size at 100% and grows with its content, no bars, a smaller window shows part of the page and you pan, zoom out only while the page still covers the window; (b) the edge wall during drags/resizes; (c) things on the whiteboard are called "widgets", not "stones"; (d) boards on the whiteboard show no board background. Mark the entries they replace as "(replaced by <date>)" instead of deleting them. Fix section 2's wording ("FIXED in size") to match. Add the rule: "Any decision the owner makes goes into DECISIONS in the same commit as the code, never only into HANDOFF."
- [x] 3. Add to PROJECT.md: "Phase 2.5 = docs/PHASE-2.5.md, a fixed list. When it's done, phase 3 starts. During a phase, a new ask from the owner is done right away only if it blocks daily use (data loss, something broken or unusable); anything else goes to an IDEAS section at the end of PROJECT.md, and the agent tells the owner so instead of building it."
- [x] 4. Rewrite the phase 4 description in PROJECT.md section 6 to add the owner's decision (2026-10-20): cards become real whiteboard objects (directly clickable, draggable, selectable by box and lasso, no double-click to enter a board), and a board works like a frame: a named container, moved and resized as a whole by its title bar or by selecting it. No interim "two clicks" mode is to be built.
- [x] 5. Add to the plan: "A dedicated speed session after phase 3, with boards and maps together on a realistic page. Zoom's worst frames are 50-67 ms today; measure where the time goes before changing anything." No speed work now.
- [x] 6. Testing rules, add to CLAUDE.md (keep its existing policy, automate everything):
   - While working on an item: only that area's tests + unit tests.
   - Before pushing: the full local suite ONCE. After deploying: the live run once.
   - Three runs in a row only when deliberately checking whether one test is flaky.
   - Linkkit's suite only when a change touches Boardkit, Linkkit, or the link between them.
   - Flaky test with no app cause found within ~30 minutes: mark it skipped with a one-line reason in HANDOFF and move on. A test that catches a real app bug is never skipped.
   - Reports: results in one line (e.g. "unit 88 ✓, e2e 94 ✓, live ✓"); details only for failures.

## GROUP B — Quick code fixes
- [x] 7. Pin tldraw to exactly "5.5.2" in package.json (no ^). Our edge wall, unsaved journal and undo-skips-selection depend on tldraw internals; upgrading tldraw becomes its own task with a full test run.
- [x] 8. Fix the known crash when the window is 0 x 0 ("camera.x: Expected a number, got NaN"): skip sizing while the window has no size. Test it.
- [x] 9. Build size warning: stop raising chunkSizeWarningLimit to just above the bundle. Set it with an honest comment (tldraw is most of it, loaded only by the whiteboard) and leave it. No code splitting now.
- [x] 10. Main menu "Backups" opens /backup/ in a NEW tab instead of replacing the whiteboard.
- [x] 11. Zoom buttons (+/-) and Ctrl+/Ctrl-: steps of 10% (as in Excalidraw), from the lowest allowed zoom up to 800%. Fix camera.ts zoomSteps, its wrong "Excalidraw-like" comment, camera.test.ts, and any e2e expecting 150%. Ctrl+wheel stays smooth as it is. At 100% on a window-sized page, "-" still does nothing (by design: no bars).
- [x] 12. Toolbar: remove Laser, Note (sticky note) and Frame. Keep Highlighter. Remove them from the overflow menu and their shortcuts too. Existing shapes of those kinds (if any) stay as they are.
- [x] 13. Pages:
   - Top left: remove tldraw's page menu (the "Page 2 ⌄" dropdown next to the ☰). Only the ☰ main menu stays there, as in Excalidraw.
   - Bottom right: remove the Present (▶) button and present mode entirely. Show only "‹ 2 / 4 ›": the arrows and the position. No page name ("Page 2" goes), even for renamed pages.
   - Clicking "2 / 4" opens the page list that the removed top-left menu had: jump to a page, rename, reorder, delete, add. Nothing that menu could do may be lost (test each one).
   - Put "‹ 2 / 4 ›" on the SAME row as tldraw's "made with tldraw" watermark, directly to its left and bottom-aligned with it (today it's stacked above it). Never cover or overlap the watermark: the hobby license requires it visible. With no watermark (localhost), it sits in the corner. Update the existing test that checks the arrows don't cover the watermark, and test both cases.
   - The on-screen › on the last page still creates a new page, as now.
   - Keyboard: ← and → go to the previous/next page when nothing is selected and no text is being edited; on the last page → does nothing (it never creates a page). With something selected, arrows keep nudging it as now.
- [x] 14. The whiteboard becomes the home page. "/" opens the whiteboard; "/whiteboard" and "/whiteboard/" redirect to "/" (keep old links working). Delete the old iframe canvas ("stones": src/canvas/, src/domain/ and anything only it uses — check nothing else imports them), its e2e (canvas.e2e.ts and any test only for it), and in the Linkkit repo the e2e that exist only to test Linkkit inside the old canvas's frames. Automatic backups must still start on "/". Update DECISIONS: mark the 2026-10-18 and 2026-10-19 "old home page stays" entries as replaced, and add: "2026-10-20 — The whiteboard IS the gauntlet: '/' is the whiteboard. The stones canvas was a failed attempt and is deleted; nothing is built on it." The old canvas's saved data in localStorage: LIST its keys in your report (only keys proven to be used by the old canvas alone), and do NOT delete them until the owner says yes.

## GROUP C — Board widget on the whiteboard (whiteboard mode only; standalone /boardkit unchanged)
- [x] 15. Give Boardkit's add buttons fixed markers (data-add="list", data-add="card") and make gauntlet's BoardShape.tsx find them by those, never by their text. Do this first in this group: the next item changes those buttons.
- [x] 16. "+ Add a list": replace it with a slim "+" attached to the right edge of the last list, shown only while the pointer is over the board or the board is selected. The widget's box must NOT reserve space for it (the selection box hugs the lists; the "+" sits just outside). "+ Add a card": a slim "+" on the bottom edge of a list, shown only on the list the pointer is over (not on all lists at once), with no space reserved. Exceptions: a board with no lists still shows the full "+ Add a list" button, and an empty list still shows the full "+ Add a card" button.
- [x] 17. List header: always show the title (and the card count); the other controls show only while the pointer is over that list's header.
- [x] 18. Move the x (delete list) out of the header into a "⋯" menu with the other rarely used list actions. Undo always brings a deleted list back (test it).
- [x] 19. The board's name label above it ("Untitled" etc.): hidden normally, shown on hover or when the board is selected. (In phase 4 it becomes the board's handle, so don't remove it.)
- [x] 20. Lists shrink to their content: no fixed minimum height; an empty list is just its header plus the add button.
Card numbering: no change (already a menu option, with "Hidden").

## GROUP D — Behaviour
- [x] 21. Failed saves on the whiteboard are silent today. Standalone Boardkit shows SaveFailedNotice (banner + "Try again" + "Leave site?" prompt) when a write fails (storage full or blocked), but the whiteboard never renders it, though its board edits go through the same save code (useSaveHealth). Export what's needed from Boardkit's whiteboard entry (src/app/whiteboard/index.ts) and show an equivalent banner + leave warning on the whiteboard while any board save is failing. e2e: fill localStorage on purpose, edit a board on the whiteboard, expect the banner; free space, "Try again", expect it gone and the edit stored.
- [x] 22. One undo for everything on the whiteboard page. Today, inside a board being edited Ctrl+Z undoes card edits; outside, it undoes whiteboard actions, so "rename a card, Escape, Ctrl+Z" undoes some older whiteboard action instead. Make Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z and the bottom-left undo/redo buttons always undo/redo the most recent action on this page, whether a card edit or a whiteboard action, in order. Boardkit and tldraw keep their own histories; the page keeps the order of which one acted. Edits made in /boardkit in another tab are not part of this page's history. e2e: rename a card, Escape, Ctrl+Z → the card's old name is back and nothing else changed; mixed sequence (move shape, edit card, move shape) undone and redone in exact order.
- [x] 23. A board made with "+ New board" on the whiteboard that is still EMPTY (no lists, never renamed) is deleted from Boardkit too when its creation is undone or its widget is deleted. A board with any content is never deleted this way (as today: widget leaves the whiteboard, board stays in Boardkit). Update the 2026-10-20 "+ New board" DECISIONS entry. e2e for both cases.

## GROUP E — Automatic checks on GitHub
- [ ] 24. Add a GitHub Actions workflow to gauntlet (and Boardkit if it has none) running lint, unit tests and build on every push. The full e2e stays local (it needs Edge and the Linkkit/Boardkit checkouts).

## END
- [ ] Run the full local suite once, push, deploy, run live once. Report in a few lines: what's done, anything not done and why, the old canvas's localStorage keys for my OK, and what I should try by hand (only feel: the slim "+" buttons, hover headers, page controls and page list, one undo).
