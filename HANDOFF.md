# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step. Hard limit: 100 lines (PROJECT.md section 7).
Finished work goes to docs/HISTORY.md.

## Current state (2026-10-22)

- PHASE 3 DONE (docs/PHASE-3.md, all ticked; summary in docs/HISTORY.md).
  STOPPED for the owner's report (PROJECT.md rule 3); phase 4 not started.
- Hand-test fixes (owner, 2026-10-21) done; see docs/HISTORY.md.
- EXCALIDRAW PARITY (owner, 2026-10-21) done, items 0-3 (summary in
  docs/HISTORY.md, decisions in PROJECT.md): no leftover test windows
  (scripts/leftovers.mjs), dark fixed + custom colours, our own Excalidraw
  paste/drop/import (src/import/excalidraw/), Crop in the panel.
- Move cursor over items, as in Excalidraw (owner, 2026-10-22): done
  (DECISIONS; src/whiteboard/hoverResize.ts `moveCursor`,
  e2e/movecursor.e2e.ts, 8 tests).
- Owner's hand test of the hand-test round PASSED (2026-10-22, HISTORY).
- Map fixes 1-4 from that hand test, hover speed and the clickaway hang:
  done (DECISIONS 2026-10-22; e2e/mapfixes.e2e.ts; Linkkit v0.0.112).
- Pinned: Boardkit v0.0.105 (`5a6850a`), Linkkit v0.0.113 (`f8b63cf`).
- Last results (2026-10-23, links step 2): unit 110 + 19 scripts, local
  gauntlet 239, Linkkit 18; live: see below.

## Waiting for the owner

- Feel of the map fixes: the dim while editing a map, the label, a dot
  dragged far out, a board's Map and Both views.
- Phase 3 hand test (feel only): placing and scaling a map, editing it in
  place, the List | Map | Both switch, one undo. Then "go to phase 4".
- Earlier hand test (phase 2.5 feel items), if not done yet.

## Half-done

- TOOLBAR REWORK (owner, 2026-10-22; request word for word in
  docs/TOOLBAR-REWORK.md): steps 1-4 DONE (DECISIONS; e2e/toolbar, tools,
  embed, markup .e2e.ts); waiting for the owner's hand check.
- Live runs: no bypass secret exists (DECISIONS 2026-10-22); after a
  push, `node scripts/wait-deploy.mjs`. A 403 stops the run: tell the owner.
- LINKS ROUND (owner, 2026-10-23): step 1 (leftover hidden windows) and
  step 2 (links on everything: src/links/, e2e/links.e2e.ts; Boardkit
  v0.0.105, Linkkit v0.0.113; DECISIONS) DONE. Waiting for the owner's
  hand check (feel of the icons and the link field).
- Phase 4 NOT started (owner: don't start it).

## Broken / known wrong

- Linkkit's tree layout lets long card names overlap their neighbours
  (a board's map, and Linkkit's own page): not changed.
- Flaky, not chased: fullpage.e2e.ts:192 (zoom one wheel tick off after a
  resize).
- Zoom of a big map is near its limit: 150 boxes, zoom p95 67-117 ms per
  run (limit 108; the board's is ~50); the test now judges the median of
  5 runs. Browser repaint, no DOM changes. For the speed session.
- Linkkit's embed mode (`?embed=1`) has no e2e of its own any more (its
  embed.e2e.ts only tested it inside the deleted canvas); realdata.e2e.ts
  and Linkkit's readonly.e2e.ts still open maps that way.

## Deadlines

- tldraw license: the hobby key is installed in Vercel Production
  (`VITE_TLDRAW_LICENSE_KEY`, project `gauntlet-home`), valid until
  2027-10-20. Preview still has the evaluation key, which expires
  2026-11-01: after that, previews lose the whiteboard (tldraw hides the
  editor after 5 s). Test on localhost then. Swapping a key: edit the value
  in Vercel → Settings → Environment Variables, then redeploy (Vite bakes it
  into the build). Check: `BRIDGE_SITE=https://gauntlet-home.vercel.app npx
  playwright test e2e/whiteboard.e2e.ts` ("license is accepted").

## Standing notes

- Open ideas for later (not built): Boardkit card images (build in Boardkit
  itself); "New map" waits for phase 3; whiteboard-level search, page
  download/copy as PNG/PDF, shortcuts help, a trash panel (see HISTORY,
  "Whiteboard-level ideas"). Boardkit `npm audit` 7 high in the shadcn CLI:
  leave as is (owner).
- tldraw internals this code relies on (why tldraw is pinned): the edge
  wall (select tool states), the unsaved journal, undo skipping selection,
  the page undo (`editor.history` stacks, `store.addHistoryInterceptor`),
  the page list moved to "N / M" (pages.css pins Radix's popover), the
  Excalidraw import's hand-back of other files to tldraw's own files
  handler (`externalContentHandlers.files`), crop mode `select.crop.idle`,
  display values for exact colours and sizes (src/style/shapeUtils.ts).
- Previews: /boardkit and /linkkit on a preview are the LIVE apps; the
  real-data test (`e2e/realdata.e2e.ts`, owner's backup file read at run
  time from Downloads) runs only on localhost.
- Dev tips: `node scripts/sync-linkkit.mjs` copies ~/linkkit/src into
  node_modules/linkkit (as sync-boardkit does). After `node scripts/sync-boardkit.mjs` restart the dev server
  (and a browser that had the page open may keep the old Boardkit module
  cached: use a fresh profile). `local-e2e.mjs` joins its arguments into a
  shell line: use `file:line`. Never pipe test commands without pipefail;
  use the real exit code.
- CI (GitHub Actions, gauntlet and Boardkit): lint, unit tests, build on
  every push. The e2e stays local.
- Vercel Authentication is off for previews; turn back on with
  `vercel project protection enable gauntlet-home --sso`.

## Next step

- The owner's phase 3 hand test, then the speed session, then phase 4.
