# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step. Hard limit: 100 lines (PROJECT.md section 7).
Finished work goes to docs/HISTORY.md.

## Current state (2026-11-13)

- PHASE 3 DONE; phase 4 NOT started (owner: don't start it). Earlier rounds
  (hand-test fixes, Excalidraw parity, move cursor, map fixes, toolbar
  rework, links round): done, see docs/HISTORY.md and DECISIONS.
- SLATE WIDGET (owner, 2026-10-31; separate track, steps 1-5, DECISIONS):
  step 1 done in calendarkit; STEP 2 (static widget) DONE: src/slate/,
  e2e/slate.e2e.ts (9), 2 Slate tests in perf.e2e.ts. STEP 3 DONE as
  speed session Part 4 (e2e/slatehover.e2e.ts). Steps 4-5 not started.
- Pinned: Boardkit v0.0.106 (`79ae65b`), Linkkit v0.0.117 (`3e802ab`),
  calendarkit v1.63.0 (`cce027b`); all three on their main, live.
- MAP-MAKING ROUND (owner, 2026-11-13; Linkkit's speed round wired in):
  items 1-6 DONE (e2e/mapsfast.e2e.ts; Linkkit v0.0.117 made here for the
  list paste). Item 6's mod+c "clash" is a dev-only Boardkit check that
  ignores `when`: harmless; fix in Boardkit next time. STOPPED for report.
- EDGES ROUND (2026-11-05, docs/ROUND-EDGES.md): DONE, LIVE (HISTORY);
  waiting for the owner's hand check (feel only).
- SPEED SESSION (owner, 2026-11-12; request in docs/SPEED-SESSION.md,
  Parts 0-11 (9-11 added 2026-11-13: board export, text scaling, date
  stamp), one at a time, stop and report after each): PARTS 0-4 DONE
  (1: split save, src/backup/; 2: pictures, src/images/; 3: arrivals,
  src/pages/arrive.ts; 4: Slate step 3, src/slate/hover.tsx; DECISIONS
  2026-11-12/13; numbers in docs/HISTORY.md "Speed session"). STOPPED
  for the owner's report. NEXT: Part 5. Parts 5-11 not started.
- Real-disk save measurement, by hand only (a visible Edge for ~1 min):
  `node scripts/local-e2e.mjs gauntlet "-c playwright.disk.config.ts"`.
- Pitfall: `git stash pop` here rewrites files with CRLF (autocrlf true);
  scripted "\n" replaces then silently miss. Use the Edit tool after one.
## Waiting for the owner

- Feel of the map fixes (dim, label, far dot, a board's Map/Both views).
- Phase 3 hand test (feel only): a map placed, scaled, edited; the switch.

## Half-done

- TOOLBAR REWORK (owner, 2026-10-22; request word for word in
  docs/TOOLBAR-REWORK.md): steps 1-4 DONE (DECISIONS; e2e/toolbar, tools,
  embed, markup .e2e.ts); waiting for the owner's hand check.
- Live runs: no bypass secret exists (DECISIONS 2026-10-22); after a
  push, `node scripts/wait-deploy.mjs`. A 403 stops the run: tell the owner.
- LINKS ROUND (owner, 2026-10-23): steps 1-2 DONE (DECISIONS); waiting
  for the owner's hand check (feel of the icons and the link field).

## Broken / known wrong

- Linkkit's tree layout lets long card names overlap (not changed).
- Flaky, not chased: fullpage.e2e.ts:192 (zoom a wheel tick off).
- Toolbar buttons keep the keyboard focus after a click (tldraw then
  ignores keys: no nudge/Delete until the page is clicked). Fixed for the
  Slate only (DECISIONS Part 4); Board, Map and the rest still have it.
- perf.e2e.ts:259 hover p95 with 3 Slates: 24-26 ms since Part 4 (limit 25).
- Zoom of a big map is near its limit: 150 boxes, zoom p95 67-117 ms per
  run (limit 108; the board's is ~50); the test now judges the median of
  5 runs. Browser repaint, no DOM changes. For the speed session.
- Linkkit's embed mode (`?embed=1`) has no e2e of its own (only
  realdata.e2e.ts and Linkkit's readonly.e2e.ts open maps that way).

## Deadlines

- tldraw license: hobby key in Vercel Production (`VITE_TLDRAW_LICENSE_KEY`,
  `gauntlet-home`) until 2027-10-20; Preview's evaluation key expired
  2026-11-01 (previews lose the whiteboard: test on localhost). Swap: edit
  it in Vercel env vars, redeploy; check e2e/whiteboard.e2e.ts on the live site.

## Standing notes

- Open ideas (not built): HISTORY "Whiteboard-level ideas"; Boardkit card
  images. Boardkit `npm audit` 7 high (shadcn CLI): leave.
- tldraw internals relied on (why tldraw is pinned): select tool states
  (edge wall), unsaved journal, undo skipping selection, page undo
  (`editor.history`, `store.addHistoryInterceptor`), page list in "N / M",
  Excalidraw files hand-back, `select.crop.idle`, display values
  (src/style/shapeUtils.ts); since the Edges round also the selection
  overlay (subclassed), Brushing.hitTestShapes, inputs._currentPagePoint,
  the text sizeCache width; the local asset store (key = asset id, our
  `resolve` laid over it: src/images/smaller.ts).
- Previews: /boardkit and /linkkit on a preview are the LIVE apps; the
  real-data test (`e2e/realdata.e2e.ts`, owner's backup file read at run
  time from Downloads) runs only on localhost.
- Dev tips: `node scripts/sync-linkkit.mjs` copies ~/linkkit/src into
  node_modules/linkkit (so do sync-boardkit, sync-calendarkit); after
  sync-boardkit restart the dev server and use a fresh browser profile.
  `local-e2e.mjs` joins its arguments into a shell line: use `file:line`.
  Never pipe test commands without pipefail; use the real exit code.
- CI (GitHub Actions, gauntlet and Boardkit): lint, unit tests, build on
  every push. The e2e stays local.
- Vercel Authentication is off for previews; turn back on with
  `vercel project protection enable gauntlet-home --sso`.

## Next step

- Speed session Part 5 (widget parity check), then Parts 6-11 in order,
  stopping to report after each.
  Phase 4 only after this round is live and the owner says "go".
