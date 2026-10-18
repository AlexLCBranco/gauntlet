# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step.

**Nothing is broken on the live site.** The home page (/) is untouched.

## Current phase: 1 (the floor), in progress

The whiteboard is a tldraw app at /whiteboard (see DECISIONS).

### Done
- tldraw 5.5.2 installed. PROJECT.md replaced by the owner's new plan.
- Written but not yet built or tested (in `src/whiteboard/`, uncommitted):
  lasso tool, fixed sheet + camera limits, "keep shapes inside the sheet",
  page arrows + Present, toolbar at the top, Excalidraw shortcuts, dark by
  default.

### Half-done / where it stopped
- About to move the files into areas: `src/whiteboard/` (the app shell),
  `src/pages/` (sheet, arrows, present), `src/lasso/`.

### Known wrong / open
- Live /whiteboard needs the tldraw hobby license key (see DECISIONS).

### Next concrete step
- Finish the move, `npm run build`, `npm test`, then open /whiteboard with
  `npm run dev` (port 5180) and check it.
