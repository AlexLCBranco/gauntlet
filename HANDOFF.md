# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step.

**Nothing is broken on the live site.** The home page (/) is untouched.

## Current phase: 1 (the floor), in progress

The whiteboard is a tldraw app at /whiteboard (see DECISIONS). Code areas
are listed in `src/README.md`: `src/whiteboard/`, `src/pages/`,
`src/lasso/`.

### Done
- tldraw 5.5.2. PROJECT.md replaced by the owner's new plan.
- Lasso (W), fixed 1920x1080 sheet with camera limits, shapes kept inside
  the sheet, page arrows (next on the last page makes one) + PageUp/Down,
  Present, toolbar on top, Excalidraw keys (1-0, D diamond, P pen), dark.
- Unit tests (`npm test`) and e2e `e2e/whiteboard.e2e.ts` (9 tests) pass
  against the dev server:
  `BRIDGE_SITE=http://localhost:5180 npx playwright test e2e/whiteboard.e2e.ts`
  (start it with `npm run dev`).
- Bugs found by the e2e and fixed: tldraw's "number = nth toolbar button"
  overrode Excalidraw's number keys (turned off); Escape mid-lasso cleared
  the selection instead of restoring it.

### Half-done / where it stopped
- Not pushed yet. Before pushing, every e2e must pass:
  `node scripts/local-e2e.mjs` (needs the Boardkit and Linkkit folders).

### Known wrong / open
- Live /whiteboard needs the tldraw hobby license key (see DECISIONS).
  Until then it disappears after 5 s on the live site.

### Next concrete step
- Visual check, `node scripts/local-e2e.mjs`, push, check the live
  /whiteboard, report to the owner, wait for "go to phase 2".
