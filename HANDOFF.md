# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step. Hard limit: 100 lines (PROJECT.md section 7).
Finished work goes to docs/HISTORY.md.

## Current state (2026-10-31)

- PHASE 3 DONE; phase 4 NOT started (owner: don't start it). Earlier rounds
  (hand-test fixes, Excalidraw parity, move cursor, map fixes, toolbar
  rework, links round): done, see docs/HISTORY.md and DECISIONS.
- SLATE WIDGET (owner, 2026-10-31; separate track, steps 1-5, DECISIONS):
  step 1 done in calendarkit; STEP 2 (static widget) DONE: src/slate/,
  e2e/slate.e2e.ts (9), 2 Slate tests in perf.e2e.ts. STOPPED for the
  owner's report. Step 3 not started (←/→ date, keys vs nudge, ↗, tooltips).
- Pinned: Boardkit v0.0.106 (`79ae65b`), Linkkit v0.0.114 (`c032a8b`),
  calendarkit v1.40.1 (`7c606c6`); all three on their main, live.
- EDGES ROUND (owner, 2026-11-05; docs/ROUND-EDGES.md): items 0-9 DONE and
  LIVE (DECISIONS 2026-11-05; results in docs/HISTORY.md "Edges round").
  STOPPED for the owner's report and hand check (feel only).
- Pitfall: `git stash pop` here rewrites files with CRLF (autocrlf true);
  scripted "\n" replaces then silently miss. Use the Edit tool after one.
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

## Broken / known wrong

- Linkkit's tree layout lets long card names overlap their neighbours
  (a board's map, and Linkkit's own page): not changed.
- Flaky, not chased: fullpage.e2e.ts:192 (zoom one wheel tick off after a
  resize).
- Zoom of a big map is near its limit: 150 boxes, zoom p95 67-117 ms per
  run (limit 108; the board's is ~50); the test now judges the median of
  5 runs. Browser repaint, no DOM changes. For the speed session.
- Linkkit's embed mode (`?embed=1`) has no e2e of its own (only
  realdata.e2e.ts and Linkkit's readonly.e2e.ts open maps that way).

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

- Open ideas (not built): Boardkit card images (in Boardkit itself);
  whiteboard search, page PNG/PDF, shortcuts help, a trash panel (HISTORY,
  "Whiteboard-level ideas"). Boardkit `npm audit` 7 high (shadcn CLI): leave.
- tldraw internals relied on (why tldraw is pinned): select tool states
  (edge wall), unsaved journal, undo skipping selection, page undo
  (`editor.history`, `store.addHistoryInterceptor`), page list in "N / M",
  Excalidraw files hand-back, `select.crop.idle`, display values
  (src/style/shapeUtils.ts); since the Edges round also the selection
  overlay (subclassed), Brushing.hitTestShapes, inputs._currentPagePoint,
  the text sizeCache width.
- Previews: /boardkit and /linkkit on a preview are the LIVE apps; the
  real-data test (`e2e/realdata.e2e.ts`, owner's backup file read at run
  time from Downloads) runs only on localhost.
- Dev tips: `node scripts/sync-linkkit.mjs` copies ~/linkkit/src into
  node_modules/linkkit (as sync-boardkit and sync-calendarkit do). After `node scripts/sync-boardkit.mjs` restart the dev server
  (and a browser that had the page open may keep the old Boardkit module
  cached: use a fresh profile). `local-e2e.mjs` joins its arguments into a
  shell line: use `file:line`. Never pipe test commands without pipefail;
  use the real exit code.
- CI (GitHub Actions, gauntlet and Boardkit): lint, unit tests, build on
  every push. The e2e stays local.
- Vercel Authentication is off for previews; turn back on with
  `vercel project protection enable gauntlet-home --sso`.

## Next step

- The owner's report on the Edges round and on Slate step 2 (feel), then
  "go" for Slate step 3.
- The owner's phase 3 hand test, then the speed session, then phase 4.
