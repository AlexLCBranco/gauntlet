# HANDOFF

Read PROJECT.md first (the plan + DECISIONS), then this file. Update this
file after every step. Hard limit: 100 lines (PROJECT.md section 7).
Finished work goes to docs/HISTORY.md.

## Current state (2026-10-20)

- Phase 2 is done and LIVE on `main` (gauntlet-home.vercel.app). Boardkit
  is pinned in package.json (codeload tarball of a Boardkit `main` commit).
- NOW: phase 2.5, the owner's fixed polish list, docs/PHASE-2.5.md. Items
  are ticked there as they are done; continue from the first unticked one.
  Phase 3 starts only when that list is done.

## Half-done

- Phase 2.5 (see docs/PHASE-2.5.md for exactly where it stopped).

## Broken / known wrong

- Flaky, not chased: fullpage.e2e.ts:192 (zoom one wheel tick off after a
  resize) and unsaved.e2e.ts:176 (Ctrl+D x10 then close; fails when two
  copies run at once, Ctrl+D sometimes not taken in a fresh tab).
- If the window is 0 x 0 (seen in an embedded browser pane), the whiteboard
  crashes with "camera.x: Expected a number, got NaN" (phase 2.5 item 8).

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
- Previews: /boardkit and /linkkit on a preview are the LIVE apps; the
  real-data test (`e2e/realdata.e2e.ts`, owner's backup file read at run
  time from Downloads) runs only on localhost.
- Dev tips: after `node scripts/sync-boardkit.mjs` restart the dev server.
  `local-e2e.mjs` joins its arguments into a shell line: use `file:line`.
  Never pipe test commands without pipefail; use the real exit code.
- Vercel Authentication is off for previews; turn back on with
  `vercel project protection enable gauntlet-home --sso`.

## Next step

- Continue docs/PHASE-2.5.md from the first unticked item.
