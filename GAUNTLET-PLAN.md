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
| 3 | Embed mode for each stone | **Pending**. Unfinished Linkkit work is on a local branch, see "Phase 3: where it stands" |
| 4 | Canvas v0 on the gauntlet home page | Pending |
| 5 | Prove it's alive (e2e) | Pending |
| — | Snapshot-thumbnail feasibility note | Open: write it, don't build it |

## Rules for this work (owner's)

- Phases in order. Push to `main` only when every test passes.
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

Linkkit v0.0.100, commit `3431efd` on `main`, live.

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

## Phase 3: embed mode (pending)

**Goal:** `?embed=1&id=<board or map id>` shows that one board or map with no
menus or app chrome, and editing still works normally. Do Linkkit, then
Boardkit.

### Where it stands

Unfinished Linkkit work is on the **local** branch `wip/embed-phase3` in
`C:\Users\alexc\linkkit` (commit `c1531e0`, not pushed, not on `main`). Use
it as a starting point or drop it. It contains:

- `src/domain/embed.ts`: `readEmbed(search)` and the message protocol
  (`readToFrame`).
- `src/store/embed.ts`: `embedded()` (read once from the address as the
  stores load), `useEmbedStatus` (`ok` / `missing` / `deleted`),
  `setEmbeddedForTests`.
- `persistMap.ts`: `saveActiveMapId` does nothing in embed mode.
- `mapStore.ts`: `embeddedState(id)` opens the named map and writes nothing.
  A missing or trashed id gives status `missing` (with a never-shown
  placeholder that waits for a tidy that never runs). `leaveGoneMap` gives
  `deleted` instead of opening another map. `restoreMaps` stays on the
  frame's own map.
- `src/app/EmbedApp.tsx`: no header. Every warning banner is kept (save
  failed, link hold, backup hold, plus the new `EmbedBackupStrip`, a
  "Resume backups" button since embed mode has no menu). A floating tool
  group (Add box, Tidy up, Undo/Redo) and a "This map was deleted / isn't
  here" screen.
- `src/app/embedBridge.ts`: the frame side of the protocol (ready/status,
  scroll reports, flush with `busy`, scroll-to).
- `autoBackup.ts`: one writer per app through a Web Lock
  (`linkkit-auto-backup`). A BroadcastChannel tells the other copies when the
  folder changes (chosen, resumed, off). The writer also backs up on
  `storage` events, because it may not have the edited map open.
- `global.css`: `overscroll-behavior: contain` under `html[data-embed]`.
- `main.tsx`: renders `EmbedApp`, starts the bridge, skips autosave when the
  map is missing.

**Known broken on that branch:** in `src/store/embed.test.ts`, "says a map
that isn't there is missing, and writes nothing" fails because of a bug in
the test itself: `before` serialises `Object.entries(localStorage)` on the
memory-storage object. Build the snapshot the same way as `after`, by
looping over keys. The other 6 tests there pass. Not yet done: the e2e,
`PROJECT.md`, the version bump, and all of Boardkit.

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

### Tests to write

- Unit: parsing the address and messages; the embed store opens the named
  item and writes nothing; missing, trashed and deleted items; restore stays
  on the frame; Boardkit's registry write keeps the stored active board.
- e2e on the live site, fresh profile: open `/linkkit/?embed=1&id=…` and
  `/boardkit/?embed=1&id=…`. Expect no header, editing works, `linkkit:active`
  and the registry's active board unchanged, the damaged-map banner shows
  inside an embedded frame, only one backup file per change with two copies
  open, and the missing-id screen.

## Phase 4: canvas v0 (pending)

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
