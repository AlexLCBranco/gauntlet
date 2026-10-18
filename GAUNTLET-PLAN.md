# Gauntlet canvas plan (v0)

The source of truth for building the gauntlet canvas. A new session should be
able to pick up the next pending phase from this file alone. Written
2026-10-18. Keep it current: update the status table and decisions as work
lands.

## Goal

gauntlet-home.vercel.app is the shared home for the owner's widgets
("stones"). Boardkit lives at `/boardkit` and Linkkit at `/linkkit`, with
their data already there. The gauntlet is a canvas on the home page where
stones live as **live** frames: edit a card in Boardkit and the same item
updates in Linkkit, and vice versa.

Users are regular people: everything is done with the mouse, typing only for
content. Fluidity and efficiency come first; anything clunky is a bug.

## Status

| Phase | What | Status |
|---|---|---|
| 0 | Investigate and plan | **Done** (this file, and the canvas section of `PROJECT.md`) |
| 1 | Linkkit automatic backups | **Done**, live in Linkkit v0.0.100 (commit `3431efd`) |
| 2 | Shared storage (bridge step 3) | **Skipped**: already built and working (see Findings) |
| 3 | Embed mode for each stone | **Done** 2026-10-18: Linkkit v0.0.101 (`33801c2`), Boardkit v0.0.94 (`2a854dc`), e2e `linkkit/e2e/embed.e2e.ts`. Local e2e route built first (`scripts/`, `b732665`) |
| 4 | Canvas v0 on the gauntlet home page | **Next.** Read "Notes for phase 4" first |
| 5 | Prove it's alive (e2e) | Pending |
| — | Snapshot-thumbnail feasibility note | Open: write it, don't build it |

## Rules for this work (owner's)

- Phases in order. Push to `main` only when every test passes (see the next
  section: e2e included, run **before** the push).
- No new widget features (no bracket mode, presets, tree mode 14b–14e, …).
  Exception: fixes needed for stones to work inside the canvas.
- Automate every check that can be automated (unit, or Playwright e2e on the
  live site with throwaway data it makes and deletes, or a fresh browser
  profile). Manual steps only for what truly can't be automated (feel), each
  with the reason.
- At the end of each phase: update `PROJECT.md` (here and in each app
  touched), and give the owner a short summary: what changed, what's still
  pending, what needs testing by hand (ideally nothing).
- If part of the plan is a bad idea, say so and why **before** building it.
- Before fixing a bug: diagnose and report the cause first. Every fix gets a
  test that fails on the old code.
- Owner's global rules also apply (`~/.claude/CLAUDE.md`): dark theme by
  default; after each change, build/test, one focused commit, push to `main`.

## Every test passes before pushing to main (owner's rule, 2026-10-18)

Every test passes **before** any push to `main`: unit tests, build, lint,
and **every e2e**: Linkkit's `e2e/bridge.e2e.ts`, `e2e/held.e2e.ts`, and
every e2e added later (embed, canvas, alive, same-map). Running an e2e
against the live site after the push doesn't count. Phase 1 broke this
rule: the bridge e2e ran only after the change was live (it passed, but
that was luck, not process).

### Where the e2e can run before a push

**Vercel preview deploys: set up, but not usable for e2e today.** Checked
2026-10-18: pushing `wip/embed-phase3` built a Linkkit preview
automatically (`npx -y vercel@latest ls linkkit` lists it, "Preview",
e.g. `https://linkkit-crpftuq8c-alexlcbrancos-projects.vercel.app`). Every
non-`main` branch of each repo gets one. Three things block e2e on them:

1. **Vercel Deployment Protection is on.** A preview URL answers `302` to
   Vercel's login (`vercel.com/sso-api`), so Playwright can't load it.
   Fixing that means turning on "Protection Bypass for Automation" in the
   Vercel project settings and passing its secret as the
   `x-vercel-protection-bypass` header. That's a Vercel settings change, so
   it needs the owner's explicit yes.
2. **The apps refuse preview hosts.** Both apps run only on
   gauntlet-home.vercel.app and localhost (Linkkit `src/domain/address.ts`,
   Boardkit `src/domain/address.ts`). Anywhere else they show "This app
   moved". Allowing preview hosts would be a code change that weakens that
   protection.
3. **The bridge, canvas and alive tests need both apps on one origin**, as
   on the live site. A single app's preview is a different origin from the
   other app's.

**The route in use: one local origin for everything** (no Vercel change
needed, and localhost is already allowed by both apps). Built 2026-10-18;
the bridge and held e2e passed through it before phase 3 started.

**How to run it (before every push to main):** check out the branch to
test in each app's folder, then from this repo:

```
node scripts/local-e2e.mjs                    # every e2e in linkkit/e2e
node scripts/local-e2e.mjs e2e/embed.e2e.ts   # some of them
node --test "scripts/*.test.mjs"              # the proxy's own tests
```

`local-e2e.mjs` reuses a dev server already listening on 5181 / 5173 (it
prints which branch that folder is on) or starts one, starts the proxy on
3000, runs Playwright in Linkkit with `BRIDGE_SITE=http://localhost:3000`,
and stops only what it started. `dev-proxy.mjs` (also runnable alone)
serves this repo's files and applies **`vercel.json`'s own rewrites**, with
each deployment's origin swapped for its local dev server; a rewrite to a
deployment it has no local server for stops it, so nothing is silently
tested against production. Full run: 14 tests, about 3 minutes.

The design notes it was built from:

- Run Linkkit's dev server (port 5181, `/linkkit/`) and Boardkit's dev
  server (check its `vite.config.ts` / `.claude/launch.json` for port and
  base `/boardkit/`), each from the branch being tested.
- Put one local proxy in front of both on a single port, routing `/linkkit`
  to 5181 and `/boardkit` to Boardkit's port. Once phase 4 exists, the
  gauntlet's own Vite dev server should be that proxy (`server.proxy`),
  serving the canvas at `/`. Before that, a small Node proxy script is
  enough.
- Run the e2e against it: `BRIDGE_SITE=http://localhost:<proxy port> npm run e2e`
  in Linkkit (the config reads `BRIDGE_SITE`). New e2e tests take the same
  variable.
- Only when all of them pass locally: push to `main`, then re-run the e2e
  on the live site as a final check.

(Vercel's Protection Bypass, point 1 above, was not needed.)

## Repos

| App | Folder | Live | Notes |
|---|---|---|---|
| Gauntlet | `C:\Users\alexc\gauntlet` | gauntlet-home.vercel.app | Today two static files: `index.html`, `vercel.json` |
| Linkkit | `C:\Users\alexc\linkkit` | gauntlet-home.vercel.app/linkkit (own deploy linkkit-lake.vercel.app) | Read its `CLAUDE.md`. Bump the patch version for each visible change. Dev server: port 5181, path `/linkkit/` |
| Boardkit | `C:\Users\alexc\Projects\boardkit` | gauntlet-home.vercel.app/boardkit (own deploy boardkit-iota.vercel.app) | Read its `CLAUDE.md`. **Two agents (Claude and Codex) work there: check `git status` and `PLAN.md`, and claim an item in `PLAN.md` before editing.** |

Both apps show only a "this app moved" notice at any address other than
gauntlet-home.vercel.app or localhost.

## Findings (phase 0)

### Serving: one origin

`gauntlet/vercel.json` uses **rewrites** (Vercel proxies), not redirects. The
browser only ever sees gauntlet-home.vercel.app, so both apps and a canvas on
`/` share **one origin**: one localStorage, one set of IndexedDB databases,
and `storage` events reach every other tab and every same-origin iframe. No
`X-Frame-Options` or CSP header is sent, so the canvas can frame the apps.
Boardkit needs all three rewrite rules (`/boardkit`, `/boardkit/`,
`/boardkit/:path+`); a single catch-all returned 404 on `/boardkit/`.

### Where data lives

| App | localStorage | IndexedDB |
|---|---|---|
| Boardkit | `boardkit:board:<id>` (one board, v2, has `rev`), `boardkit:registry` (board list **and the active board**), `boardkit:damaged:*`, `boardkit:lastBackupAt`, theme, recent colours, starter | db `boardkit`, store `kv`: backup folder handle; background images `boardImage:*` |
| Linkkit | `linkkit:map:<id>`, `linkkit:registry`, `linkkit:active` (map open last), `linkkit:trash:maps`, `linkkit:damaged:*`, `linkkit:held` (new, phase 1), `linkkit:lastBackupAt`, `linkkit:templates`, view keys (`align`, `zoom`, …), starter | db `linkkit`, store `kv`: backup folder handle |

Everything shares the ~5 MB localStorage quota of the origin. Boardkit's
images are in IndexedDB for that reason.

### Automatic backups (both apps)

The user picks a folder (File System Access: Chrome/Edge only). 10 s after
edits stop, every board/map goes into a new `…-backup-YYYY-MM-DD-HHMM.json`
(same format as Export all), the newest 20 are kept, and a stop (permission
lost after a restart, folder gone) shows in the menu, never silently.
Boardkit holds back a board it can't read: each new file carries that board's
last good copy forward, and the menu warns. Linkkit now does the same
(phase 1).

### Shared storage already exists (why phase 2 was skipped)

A Linkkit **tree** map that is "Linked to Boardkit" keeps its shared fields
in the Boardkit record `boardkit:board:<id>`; Linkkit's own record keeps only
its view. Both apps merge by `rev`, refuse an undo that conflicts with the
other app, and update live through `storage` events. Linkkit's
`e2e/bridge.e2e.ts` checks all of it on the live site and passed on
2026-10-18 (before and after phase 1). Linking is opt-in, one map at a time;
connections and Steps maps can't be linked.

### Field mapping (shared vs app-only)

Only linked tree maps share. Full table and reasoning: Linkkit `PROJECT.md`,
section "Bridge mapping".

| Shared (one value) | Linkkit | Boardkit |
|---|---|---|
| board | start box id + name (map name follows it) | board id + name |
| list | depth 1 box id + name | list id + title |
| card | depth 2 box id + name | card id + title |
| which list a card is in | the arrow into the box | `cardOrder` entry |
| order | `map.order` | `listOrder`, `cardOrder` (dividers/notes hidden in Linkkit) |
| keep / maybe / cut | box status | list / card `status` |
| card note | box note | card `description` (pregame thots) |
| deletes | go to Boardkit's trash | `trash`, `trashedLists` |

App-only. Linkkit: arrow labels, box places and colours, start/list notes,
page size, direction, arrow length/style, collapse, hide-cut, every unlinked
map. Boardkit: postgame thots, divider and note cards, list/card colours,
icons, widths, numbering, highlights, checks (`check`, `hasChecks`),
`singleThots`, background, collapsed lists. Linkkit carries every Boardkit
field it doesn't know through untouched.

## Owner's decisions (2026-10-18)

1. **Phase 2:** skip the rebuild. Keep the bridge.
2. **Phase 1:** copy Boardkit's approach: keep backing up, carry the last
   good copy forward, warn. The warning must be **visible on screen,
   including inside an embedded frame**, not only in the console.
3. **Sync scope:** Boardkit sync only for linked maps is fine for v0. Don't
   force linking. "Add stone → Linkkit map" lists **all** maps and marks
   linked ones with a badge. **Two frames showing the same map (linked or
   not) must stay in sync with each other, covered by an automated test.**
   The phase 5 alive-test uses a linked map.
4. **Thumbnails:** outline thumbnails (frame rectangles with names) are fine
   for v0. Separately, write a note on whether a static snapshot taken when
   leaving a page is feasible later, and what it costs. Don't build it.

Extra requirements from the owner:

- A **clear focus outline on the focused frame**, so the user always knows
  where keys and Ctrl+Z go.
- **Unloading far frames must never lose an in-progress edit or the frame's
  scroll position. Keep the current page and its neighbours loaded.**
- Log **dragging between frames** as a known gap in `PROJECT.md`.

Everything else in the proposed plan below is approved.

## Phase 1: done

Linkkit v0.0.100, commit `3431efd` on `main`, live. Process slip: the bridge e2e ran only after the push (it passed). The rule above now forbids that.

- `src/domain/held.ts` (pure, tested), `src/store/backupHold.ts`: a map that
  reads damaged (repaired or unreadable) goes on the held list
  `linkkit:held`. That list is shared through storage, so every tab and frame
  sees it.
- `src/features/maps/autoBackup.ts`: while a map is held, each new backup
  carries its newest backed-up copy forward. If no file has one, a repaired
  map is backed up as repaired, and an unreadable one is left out. The
  Backup menu shows the warning.
- `src/features/maps/BackupHoldBanner.tsx`: an on-screen banner with **Keep
  repaired version**, **Restore last good version** (comes back as its own
  map, "… (last good version)", nothing overwritten), **Download original**,
  and **Dismiss** for an unreadable map.
- Bug fixed: a damaged map's original was copied into
  `linkkit:damaged:<id>:<time>` on every read, and every backup reads every
  map, so storage filled up. It's now set aside once (test fails on the old
  code: 5 copies for 5 reads).
- Tests: unit tests in `held.test.ts` and `persistMap.test.ts`, and
  `e2e/held.e2e.ts` (passes locally and live). Shared e2e helpers are in
  `linkkit/e2e/helpers.ts`.
- Existing behaviour noted, not changed: a backup file is created empty and
  then written, so a crash in between can leave an empty file (harmless). The
  e2e helper skips unfinished files.

## Phase 3: embed mode (done)

**Goal:** `?embed=1&id=<board or map id>` shows that one board or map with no
menus or app chrome, and editing still works normally.

### What was built (2026-10-18)

- **Linkkit v0.0.101** (`33801c2`). The unfinished branch
  `wip/embed-phase3` was **reused**: on review it matched the approved
  design and guarded every path that writes `linkkit:active` or opens
  another map. It went onto `main` as one squashed commit, with fixes: the
  known broken test (`embed.test.ts` snapshotted the storage stand-in's
  methods; it now reads keys, and was checked to fail when the store
  writes), a second bug on the branch (`store/embed.ts` read
  `window.location`, which crashed all 81 store tests that stub `window`),
  and `busy` now also covers focus in any text field (a note), not only a
  box name. The branch is still on GitHub; deleting it needs the owner's
  yes.
- **Boardkit v0.0.94** (`2a854dc`), new: `domain/embed.ts` (same protocol),
  `store/embedStore.ts`, `app/EmbedApp.tsx`, `app/embedBridge.ts`,
  `features/board/EmbedBackupStrip.tsx`. `writeRegistry` keeps the stored
  active board in a frame; switch / new / duplicate / from-layout / delete
  board do nothing in a frame; search covers this board only;
  `?damage-test` is ignored in a frame (it would plant and open a board);
  the missing-boards notice has no "Open". A missing board writes nothing
  (no first-run seed, no orphan or image sweep). Deleted elsewhere: status
  `deleted`, and the store stops saving and listening, so it can't bring
  the board back. Backup: one writer per browser (Web Lock
  `boardkit-auto-backup`, released by `initAutoBackup`'s stop function),
  which also backs up on `storage` events; a BroadcastChannel for folder
  changes. Details: Boardkit `ARCHITECTURE.md`, "Embed mode".
- **Tests.** Unit: Linkkit `src/store/embed.test.ts` (7); Boardkit
  `src/store/embed.test.ts` (9) and two multi-copy tests in
  `autoBackup.test.ts`, each checked to fail on the old code. e2e:
  `linkkit/e2e/embed.e2e.ts`, one test per app, frames on the gauntlet home
  page: no chrome, editing, live sync between two frames of the same item,
  active map/board unchanged, **exactly one backup write per change with
  three copies open** (checked to fail without the lock: 3 writes),
  `stone:ready` / `stone:status` / `stone:flushed` with `busy`, the missing
  screen with storage untouched, the damaged-item banner inside a frame,
  and deleted while framed. Both also checked to fail against the old app.
- **Also fixed:** `linkkit/e2e/mapMenu.e2e.ts` had been failing on `main`
  and live (`c1aa963`): the "+ New ▸ Process" item's accessible name
  includes its "?" button ("Process What is this?"), so the exact match
  never found it. Test bug only; the app was fine.

### Notes for phase 4

- **Protocol**, as built (both apps, `domain/embed.ts`). Frame → canvas,
  posted to `window.parent` with the page's own origin:
  `{type: "stone:ready", app, id, status}` once at start,
  `{type: "stone:status", app, id, status}` on change (`ok` → `deleted`),
  `{type: "stone:scroll", app, id, x, y}` 150 ms after scrolling stops,
  `{type: "stone:flushed", app, id, busy}`. Canvas → frame:
  `{type: "stone:flush"}`, `{type: "stone:scroll-to", x, y}` (waits up to
  2 s for the content). Frames check `event.origin` and that
  `event.source === window.parent`; the canvas must check `event.origin`
  and match `event.source` to the iframe's `contentWindow`.
- **Attach the canvas's `message` listener before setting an iframe's
  `src`**: `stone:ready` is sent once, early.
- **Scroll position**: Linkkit reports its `[data-map-view]` area, Boardkit
  its `[data-board-canvas]` rail (horizontal; each list scrolls on its
  own, and those positions are not reported).
- **`busy`** is true while any text field in the frame has focus (an open
  name, title, thots or note editor, the search box). A frame that never
  answers a flush counts as busy (the plan already says so).
- **Status is final per load**: a frame that went `missing` or `deleted`
  stays so until reloaded, even if the item comes back (restored from the
  trash). The canvas can offer "Reload" or remove the stone.
- **Wheel**: `overscroll-behavior: contain` is on in both apps' embed mode,
  so a wheel over a frame never scrolls the canvas: frame header bars and
  page margins are where the canvas scrolls (as planned; check the feel).
- **Backups**: whichever copy of an app opened first holds the lock and
  writes; that can be a frame. A frame shows a "Resume backups" strip when
  backups are paused (one click resumes every copy).
- **Gaps found, not fixed** (no new features in phase 3; decide in phase 4
  whether they matter):
  - Boardkit's "held back" backup warning (a damaged board's last good copy
    is carried forward) lives only in the writing copy's backup menu
    state. A frame shows its own board's recovery notice, but not the
    held-back warning about another board.
  - Linkkit's embed view leaves out the "maps missing from storage" banner
    (`MissingMapsBanner`, about other maps); its own map's problems still
    show.
  - Boardkit's frame keeps its toolbar's "Copy board" / "Save board" image
    buttons and the shortcuts dialog. Harmless; hide them if they crowd a
    small frame.
- **Where the e2e live**: today in `linkkit/e2e` (`local-e2e.mjs` runs
  Playwright there). Phase 4/5 tests in this repo will need Playwright here
  and `local-e2e.mjs` taught to run both folders.
- **Dev serving**: the phase 4 plan's Vite proxy forwards to the **live**
  deployments for everyday dev, but pre-push e2e need the **local** dev
  servers. Reuse `scripts/dev-proxy.mjs` (`rewrite`, `localTargets`, and
  `vercel.json`) for Vite's `server.proxy`, with an env switch between the
  two, so the rules stay the production ones. Phase 4 adds a
  `package.json` here: move `scripts/` tests under its test command, and
  keep `.vercelignore` in mind (it currently excludes `scripts/`).
- `node --test scripts/` doesn't work on Node 24 (a folder isn't a test
  file); use the glob form above.


### Design (approved)

- **Never write "active".** Linkkit: `linkkit:active`. Boardkit: the
  `activeBoardId` inside `boardkit:registry`. Watch out for Boardkit's
  `persistRegistry.ts` `writeRegistry`: any registry write (a rename, a
  merge) writes `active` = this tab's board when it differs from
  `writtenActive`. In embed mode it must keep the stored active board
  instead. Otherwise two frames fight over it, and opening `/boardkit` lands
  on whatever a frame showed last.
- **One backup writer per app** (Web Lock), in every copy of the app
  (standalone tabs and frames). The writer reacts to `storage` events for
  backed-up keys. Linkkit also watches `boardkit:board:*`, since linked maps
  are backed up from their board. Boardkit needs the same change.
- **Backups paused in a frame:** after a browser restart the browser wants
  one click to allow the folder again, and a frame has no menu, so the frame
  shows a small "Resume backups" strip. One click clears it everywhere
  (BroadcastChannel).
- **Banners stay on in embed mode**, including the phase 1 damaged-map
  warning (owner's rule). In embed mode, hide anything that switches to
  another map or board (for example the banner's "Open it").
- **Missing / deleted:** the frame says so and saves nothing. It never falls
  back to another map or board.
- **Scroll:** `overscroll-behavior: contain`, so a wheel at the frame's edge
  doesn't move the canvas. Trade-off: a wheel over a frame never scrolls the
  canvas, so the canvas needs frame header bars and margins to scroll from.
  Check this in phase 4 and document it.
- **Protocol** (postMessage, same origin only, check `event.origin` and
  `event.source`):
  - frame → canvas: `stone:ready {app, id, status}`,
    `stone:status {app, id, status}`, `stone:scroll {app, id, x, y}`
    (debounced), `stone:flushed {app, id, busy}`
  - canvas → frame: `stone:flush` (save now; reply `busy: true` while
    something is being typed), `stone:scroll-to {x, y}` (applied once the
    content is drawn)
- **Boardkit embed:** hide the header (`BoardSwitcher`, `ThemeSwitch`,
  `TrashPanel`) and `VersionBadge`. Keep the notices, `BoardCanvas` (it
  already contains `UndoRedoControls`), `TrashFullDialog`, `SyncToasts` and
  the toaster. Its scroll container is in `BoardCanvas` / `App.module.css`
  `.main`; find it. `damageTestFromUrl` already reads the address: check it
  doesn't clash with `embed`.

### Tests planned (all written: see "What was built")

- Unit: parsing the address and messages; the embed store opens the named
  item and writes nothing; missing, trashed and deleted items; restore stays
  on the frame; Boardkit's registry write keeps the stored active board.
- e2e on the live site, fresh profile: open `/linkkit/?embed=1&id=…` and
  `/boardkit/?embed=1&id=…`. Expect no header, editing works, `linkkit:active`
  and the registry's active board unchanged, the damaged-map banner shows
  inside an embedded frame, only one backup file per change with two copies
  open, and the missing-id screen.

## Phase 4: canvas v0 (next)

Gauntlet becomes a small Vite + React app (TypeScript, CSS Modules, dark
theme by default). The rewrites in `vercel.json` stay. Use `buildCommand` and
`outputDirectory` in `vercel.json` rather than Vercel project settings
(changing those needs the owner's yes). Local dev: a Vite proxy forwards
`/boardkit` and `/linkkit` to the live deployments, so the apps run at
localhost (they allow it) with their own local data.

- **Pages:** NOT infinite. A vertical stack of fixed 16:9 pages, with
  "+ page" at the bottom.
- **Keys:** ↓/↑ and PageDown/PageUp jump exactly one page and land aligned,
  when the canvas has focus. Normal scrolling still works (no forced snap).
- **Add stone:** pick a Boardkit board or a Linkkit map. Read
  `boardkit:registry` and `linkkit:registry` directly (same origin); a map
  is linked if `linkkit:map:<id>` has `linkedBoard`. List **all** maps and
  show a **badge** on linked ones. The stone is placed as a frame on the
  current page.
- **Frames:** move and resize with the mouse, and they stay inside the page.
  Taller content scrolls inside the frame. Positions and sizes are stored as
  fractions of the page, so frames scale with the window. The content is not
  zoomed (zooming blurs text and breaks drag coordinates), so a smaller
  window shows less and scrolls more. While dragging or resizing, a
  transparent shield covers every iframe so the pointer isn't swallowed.
  Each frame has a header bar (name, move handle), which is also where the
  wheel scrolls the canvas.
- **Focus outline:** a clear outline on the focused frame (detect it with
  `document.activeElement === iframe` and the window's blur/focus). Clicking
  the page margin gives focus back to the canvas.
- **Unloading:** keep the current page and its neighbours (±1) loaded, and
  unload frames further away. Before unloading, send `stone:flush` and wait
  for `stone:flushed`. If `busy`, or there's no reply, **don't unload**.
  Remember the last `stone:scroll` and send `stone:scroll-to` after
  reloading. Never lose an in-progress edit or a scroll position.
- **Overview:** all pages as outline thumbnails (frame rectangles with
  names). Click to jump, drag to reorder.
- **Layout** saved automatically (`gauntlet:canvas` in localStorage), with
  its own undo/redo for canvas actions. Ctrl+Z inside a frame is that app's
  undo; outside a frame it's the canvas's.
- **Iframes are fine for v0.** If dragging or scrolling inside a frame fights
  with the canvas, document it and propose a fix. Don't hide it.
- Update gauntlet `PROJECT.md`, including **Known gaps: dragging between
  frames (for example a card from the Boardkit frame into the Linkkit
  frame) isn't possible in v0.**

Tests: unit tests for the layout logic (clamping inside the page, fractions,
page jumps, reorder, undo/redo). e2e on the live site for adding a stone,
move/resize staying in the page, key jumps landing aligned, the overview
jump and reorder, the layout surviving a reload, undo/redo, the focus
outline, and unloading/reloading a far frame keeping its scroll and never
unloading while typing.

## Phase 5: prove it's alive (pending)

- **The alive-test** (definition of "the gauntlet exists"): Playwright on the
  live site, fresh profile. Make a throwaway **linked** tree map ("ZZ …")
  through the existing Linkkit flow, open a canvas with a Boardkit frame and
  a Linkkit frame of it, edit a card in one, and expect the other to update
  without a reload. Then the other direction. Clean up.
- **Same-map test:** two frames of the same map (one test linked, one not)
  on the canvas. An edit in one shows in the other without a reload.
- Reuse the patterns in `linkkit/e2e/bridge.e2e.ts` and
  `linkkit/e2e/helpers.ts` (fresh Edge profile via `channel: "msedge"`, OPFS
  folder picker stub for backups). Where the canvas e2e tests should live
  (gauntlet repo, most likely) is the next session's call.

## Open item: snapshot thumbnails (note only)

Write a short note for the owner on whether a static snapshot of a page,
taken when leaving it, would be feasible later and what it would cost. Points
to cover: same-origin frames can be rendered (for example html2canvas or
Linkkit's own `renderMapImage` on each frame's document), the cost in time
and jank, the storage it uses (images in IndexedDB, not localStorage),
staleness, and what happens to frames that are unloaded. Don't build it.

## Known trade-offs (from phase 0)

- Keys and Ctrl+Z go to whichever frame has focus. Canvas page jumps need the
  canvas focused (hence the focus outline).
- Nothing can be dragged between frames (known gap, see phase 4).
- Each frame runs a whole copy of its app, hence unloading far pages.
- Thumbnails are outlines, not live previews.
- Everything shares the ~5 MB localStorage quota of the origin.
