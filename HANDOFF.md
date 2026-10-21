# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step. Hard limit: 100 lines (PROJECT.md section 7).
Finished work goes to docs/HISTORY.md.

## Current state (2026-10-21)

- PHASE 3 DONE (docs/PHASE-3.md, all ticked; summary in docs/HISTORY.md).
  STOPPED for the owner's report (PROJECT.md rule 3); phase 4 not started.
- Hand-test fixes round (owner, 2026-10-21) done: click away saves in every
  inline field (Boardkit, Linkkit, whiteboard and standalone); one click on
  a board's hover controls; text alignment idea recorded in IDEAS.
  e2e/clickaway.e2e.ts.
- Pinned: Boardkit v0.0.104 (`e8f694e`), Linkkit v0.0.109 (`bd58f30`).
- Last results: unit 63 + 5, Linkkit 972, Boardkit 211; full local e2e
  gauntlet 131, Linkkit 18; live (`8cd78c4`) gauntlet 125 passed, 6
  skipped (real data: local only), Linkkit 18; CI green in all three.

## Waiting for the owner

- Phase 3 hand test (feel only): placing and scaling a map, editing it in
  place, the List | Map | Both switch, one undo. Then "go to phase 4".
- Earlier hand test (phase 2.5 feel items), if not done yet.

## Half-done

- Nothing.

## Broken / known wrong

- Flaky, not chased: fullpage.e2e.ts:192 (zoom one wheel tick off after a
  resize); unsaved.e2e.ts:142 (Delete right after a click not taken, once
  in a live full run 2026-10-21; 5/5 alone, 12/12 with 6 workers).
- Zoom of a big map is near its limit: 150 boxes, zoom p95 67-117 ms over
  8 runs (limit 108, 1 run over; the board's is ~50). No DOM changes while
  zooming: browser repaint. For the speed session; test kept as is.
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
  the page list moved to "N / M" (pages.css pins Radix's popover).
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
