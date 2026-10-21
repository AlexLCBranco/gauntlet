# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step. Hard limit: 100 lines (PROJECT.md section 7).
Finished work goes to docs/HISTORY.md.

## Current state (2026-10-21)

- Phase 2.5 (docs/PHASE-2.5.md, the owner's fixed polish list): all 24
  items done and committed. Summary in docs/HISTORY.md. "/" is the
  whiteboard now; the old iframe canvas is deleted.
- Boardkit v0.0.100 (whiteboard mode changes) is pinned in package.json.
- Last results: unit 63 + 5, Boardkit unit 211; full local e2e gauntlet
  112 + 1 failed (a float-exact test, fixed; fullpage 13/13 after),
  Linkkit 18; live (`1a1e5c3`) gauntlet 108 passed, 5 skipped (real data:
  local only), Linkkit 18; CI green in gauntlet and Boardkit.
- PHASE 3 in progress (docs/PHASE-3.md, ticked as done). Done: step 0
  (Ctrl+D + close-tab test back: duplicates through the editor), steps 1-3
  (map widgets, Map picker, List | Map | Both on linked boards). Linkkit
  v0.0.108 (`732f7a6`) and Boardkit v0.0.103 (`a13cccc`) pushed, pinned.
  Linkkit e2e 18 pass.
- Steps 4-5 done: map steps in the page's one undo (pageUndo.ts), the map
  save banner (Linkkit's MapParts). e2e/maps.e2e.ts 12 tests pass.
- Steps 6-7 done: realdata (the backup file has 18 listed maps, not 19;
  every one placed, both linked boards as Map and Both: no byte changed),
  perf (150-box map: drag p95 17 ms, zoom p95 83 ms, longest 129 ms).
- Next: END (full local suite once, push, deploy, live once, report).

## Waiting for the owner

- Hand test (feel only): slim "+" buttons, hover-only list headers, the
  "⋯" list menu, "‹ N / M ›" and the page list, one undo for the page.

## Half-done

- Nothing.

## Broken / known wrong

- Flaky, not chased: fullpage.e2e.ts:192 (zoom one wheel tick off after a
  resize); unsaved.e2e.ts:142 (Delete right after a click not taken, once
  in a live full run 2026-10-21; 5/5 alone, 12/12 with 6 workers).
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

- The owner's hand test, then phase 3 (PROJECT.md section 6).
