# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step.

**Nothing is broken on the live site.** The home page (/) is untouched.

## Current phase: 1 (the floor), DONE; waiting for the owner's "go to phase 2"

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

- Every e2e passed before the push (`node scripts/local-e2e.mjs`: 12 here,
  14 Linkkit). Pushed to main (`005168d`), live at
  gauntlet-home.vercel.app/whiteboard/ (/whiteboard redirects there).

### Half-done / where it stopped
- Nothing half-done.

### Known wrong / open
- **Live /whiteboard disappears after 5 s**: no tldraw license key yet
  (console: "No tldraw license key provided!"). The owner applied for the
  free hobby key on 2026-10-18; tldraw reviews it and replies by email
  (within a week). Not needed to build phase 2. When it arrives, the owner
  pastes it to the agent (commit it
  as `VITE_TLDRAW_LICENSE_KEY=...` in `.env.production`; the key ships to
  every browser anyway, so it isn't a secret) or sets it as a Vercel env
  var. Until then, the live e2e "watermark" test fails (11/12 pass live);
  localhost works without a key.
- Old PROJECT.md content (how the iframe canvas works) is now only in git
  history (`git show 28662b9:PROJECT.md`) and GAUNTLET-PLAN.md.

### Next concrete step
- Owner tries phase 1 by hand and says "go to phase 2". Add the license
  key when it arrives, re-run `npx playwright test` live (all 12 should
  pass).
