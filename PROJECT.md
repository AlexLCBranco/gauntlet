# Gauntlet

The shared home address for my apps. Each app keeps its own repo and Vercel
project; Gauntlet forwards a path on this domain to it, so everything lives
under one address.

Last updated: 2026-10-18 (phase 4 done: the canvas is the home page; see GAUNTLET-PLAN.md).

The home page (`/`) is the **canvas**: a small Vite + React app (TypeScript,
CSS Modules, dark theme) where Boardkit boards and Linkkit maps sit as live
frames ("stones"). `vercel.json` builds it (`buildCommand`, `outputDirectory:
dist`) and keeps forwarding each app's path to its own deployment.

```
npm run dev          # canvas on http://localhost:5180, apps from their live deployments
npm run dev:local    # same, apps from their local dev servers (5181, 5173)
npm test             # unit tests (vitest) + the proxy's tests (node --test)
npm run build        # tsc + vite build into dist/
npm run lint         # oxlint
node scripts/local-e2e.mjs            # EVERY e2e, before any push: this repo's, then Linkkit's
node scripts/local-e2e.mjs gauntlet   # only the canvas e2e
```

localhost keeps its own boards and maps (data is per origin), apart from
the live site's.

### Files

- `src/domain/layout.ts`: the layout, pure: pages, stones in page
  fractions, clamping, page geometry and jumps, reorder, undo history,
  reading the saved layout. `sources.ts`: boards and maps from the apps'
  registries. `protocol.ts`: the stone messages (phase 3).
- `src/canvas/Canvas.tsx`: the page stack, keys, focus, loading and
  unloading, move/resize. `Stone.tsx` (one frame), `AddStone.tsx`,
  `Overview.tsx`, `frames.ts` (the one `message` listener, flush),
  `storage.ts`.
- `e2e/canvas.e2e.ts` (+ `helpers.ts`): Playwright, fresh Edge profile.
- `scripts/dev-proxy.mjs`: the site on one localhost port: the canvas
  build (`dist/`), and `vercel.json`'s own rewrites sent to each app's
  local dev server. Vite's dev server reuses its rules (`vite.config.ts`).
- `scripts/local-e2e.mjs`: builds the canvas, starts both apps' dev servers
  (or reuses running ones) and the proxy, then runs this repo's e2e and
  Linkkit's against it. Every e2e passes here **before** any push to
  `main`.

### How the canvas works

- **Pages:** a vertical stack of 16:9 pages, each as big as fits the
  window, "+ page" at the bottom. ↓/↑ and PageDown/PageUp jump one page
  and land aligned (when the canvas has the keys); scrolling is free, no
  snap. From part way into a page, "up" goes to that page's top.
- **Stones:** "+ Add stone" lists every board and every map (linked maps
  get a "Linked" badge) and puts the pick on the current page (left half,
  then right half, then stacked). Drag the header to move, the right edge,
  bottom edge or corner to resize; frames stay inside the page. Places
  are fractions of the page, so frames scale with the window; the content
  is not zoomed (a smaller window shows less and scrolls more). While
  dragging, a transparent shield covers every frame. The stone touched
  last is drawn on top. × removes a stone (undoable).
- **Keys and focus:** the focused frame has a yellow outline; keys and
  Ctrl+Z go to it. A click on the canvas outside any frame gives the keys
  back to the canvas. Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) outside a frame
  undo/redo canvas actions (add, remove, move, resize, pages); also the
  Undo/Redo buttons.
- **Unloading:** frames on the current page and its neighbours (±1) are
  loaded. A frame further away gets `stone:flush`; it is unloaded only
  when it answers `busy: false`. Busy or no answer: it stays, tried again
  every 2 s. Each frame's last `stone:scroll` is kept (`gauntlet:scroll`)
  and sent back with `stone:scroll-to` when it loads again.
- **Overview ("Pages"):** every page as an outline (frame rectangles with
  names). Click to jump, drag to reorder, × to remove a page (undoable).
- **Saved:** `gauntlet:canvas` (layout, every change), `gauntlet:scroll`.
  The canvas reads the apps' keys but never writes them.

### Known gaps and trade-offs (v0)

- **Dragging between frames isn't possible** (for example a card from the
  Boardkit frame into the Linkkit frame). Each frame is its own document.
- A wheel over a frame scrolls the frame, never the canvas
  (`overscroll-behavior: contain` in embed mode). The canvas scrolls from
  frame headers, the page margins and empty parts of a page.
- When an app inside a frame moves its focus (for example Boardkit after
  Enter in a card title), the browser scrolls the canvas to show that
  element. So a frame you are typing in comes back into view if you
  scrolled away. Browser behaviour; found by the unloading e2e.
- A frame entirely under a bigger one can't be clicked until the top one
  is moved or resized (the overview shows both).
- Stones can't move to another page yet (remove and add again).
- Whichever stone was touched last is on top; that order isn't saved.
- Each frame runs a whole copy of its app, hence the unloading.
- Thumbnails are outlines, not live previews.

## Apps forwarded

| Path        | Forwards to                                 |
|-------------|---------------------------------------------|
| `/boardkit` | https://boardkit-iota.vercel.app/boardkit/  |
| `/linkkit`  | https://linkkit-lake.vercel.app/linkkit/    |

Boardkit needs all three rules (`/boardkit`, `/boardkit/`, `/boardkit/:path+`);
a single catch-all returned 404 on `/boardkit/`.

## Adding an app (e.g. Linkkit)

1. The app must be built to serve under its own base path (e.g. `/linkkit/`).
2. Copy the three Boardkit rules in `vercel.json`, swapping the path and URL.
3. Add it to the canvas: `App` in `src/domain/layout.ts`, its registry in
   `src/domain/sources.ts`, a link in the toolbar (`src/canvas/Canvas.tsx`),
   and its local dev server in `scripts/dev-proxy.mjs` (`localTargets`).
   The app needs the embed mode (phase 3).

## Canvas plan (phase 0 findings, 2026-10-18)

The goal: the home page becomes a canvas where Boardkit boards and Linkkit
maps sit as live frames ("stones"). Phase 0 was investigation only; nothing
below is built yet unless it says so.

### How the apps are served

`vercel.json` uses **rewrites** (Vercel proxies the request), not
redirects. The browser only ever sees `gauntlet-home.vercel.app`, so both
apps — and a canvas on `/` — share **one origin**: one localStorage, one
set of IndexedDB databases, and `storage` events reach every tab and every
same-origin iframe. No `X-Frame-Options` or CSP header is sent, so the apps
can be framed by the canvas.

### Where the data lives today

| App | localStorage | IndexedDB |
|---|---|---|
| Boardkit | `boardkit:board:<id>` (one board, v2, with `rev`), `boardkit:registry` (board list + active board), `boardkit:damaged:*`, `boardkit:lastBackupAt`, theme, recent colours, starter | db `boardkit`, store `kv`: backup folder handle, background images (`boardImage:*`) |
| Linkkit | `linkkit:map:<id>`, `linkkit:registry`, `linkkit:active`, `linkkit:trash:maps`, `linkkit:damaged:*`, `linkkit:lastBackupAt`, `linkkit:align`, `linkkit:zoom`, starter | db `linkkit`, store `kv`: backup folder handle |

Automatic backups (both apps): the user picks a folder (File System
Access, Chrome/Edge only); 10 s after edits stop, every board/map is written
to a new `…-backup-YYYY-MM-DD-HHMM.json` (same format as Export all), the
newest 20 are kept, and a stop (permission lost, folder gone) shows in the
menu, never silently. Boardkit additionally **holds back** a board it can't
read: each new file carries that board's last good copy from an earlier
file, and the menu warns.

### Already done before this plan

- **Linkkit automatic backups** exist (copied from Boardkit).
- **Shared storage (bridge step 3)** is built: a Linkkit tree map that is
  "Linked to Boardkit" keeps its shared fields in the Boardkit record
  (`boardkit:board:<id>`); Linkkit's own record keeps only its view. Both
  apps merge by `rev`, refuse conflicting undos, and update live via
  `storage` events. Linkkit's `e2e/bridge.e2e.ts` checks all of this on
  the live site; it passed on 2026-10-18 (2.3 min, every step).

### Field mapping (shared vs app-only)

Only **linked tree maps** are shared. Connections and Steps maps have no
Boardkit equivalent and stay Linkkit-only. Full table and the reasoning:
Linkkit's PROJECT.md, "Bridge mapping".

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

App-only: Linkkit — arrow labels, box places and colours, start/list notes,
page size, direction, arrow length/style, collapse, hide-cut, every
unlinked map. Boardkit — postgame thots, divider and note cards, list and
card colours, icons, widths, numbering, highlights, checks (`check`,
`hasChecks`), `singleThots`, background, collapsed lists. Linkkit carries
every Boardkit field it doesn't know through untouched.

### Phases 1–5

Approved 2026-10-18 with changes; the full plan, decisions and status are in
`GAUNTLET-PLAN.md`. Status: phase 1 done (Linkkit v0.0.100), phase 2
skipped (already built), phase 3 done (embed mode: Linkkit v0.0.101,
Boardkit v0.0.94), phase 4 done (the canvas, above); phase 5 (the
alive-test) is next. The list below is the
original proposal.

#### Original proposal

1. **Linkkit backups — only the gap.** Today a damaged Linkkit map is
   repaired on open and its original is set aside in `linkkit:damaged:*`,
   but the user only learns of it in the console and backups go on with
   the repaired copy. Plan: a visible warning, and backups hold that map
   back the way Boardkit does (carry the last good copy, include the set
   aside original) instead of pausing every backup.
2. **Shared storage — no rebuild.** Keep the bridge. Re-running the
   migration would risk the data it already moved for no gain.
3. **Embed mode** in each app: `?embed=1&id=<board or map id>` hides menus,
   header and chrome, opens that one item, and never writes "active
   board/map" (or two frames, and the standalone app, would fight over
   it). Automatic backup runs in only one instance per app (a Web Lock), so
   five frames don't write five files.
4. **Canvas v0** (gauntlet becomes a small Vite + React app; rewrites
   stay): stacked 16:9 pages, frames stored in page-relative units, a
   transparent shield over all iframes while dragging/resizing so the
   pointer isn't swallowed, off-screen frames unloaded, thumbnails drawn
   as frame outlines with names (live iframes can't be shrunk cheaply),
   layout in `gauntlet:canvas`, its own undo/redo.
5. **Alive test**: Playwright on the live site, fresh profile, links a
   throwaway tree, places both frames, edits in one, expects the other.

Known iframe trade-offs: keys and Ctrl+Z go to whichever frame has focus
(so ↓/↑ page jumps need the canvas focused; a click on the page margin
gives it back); wheel at a frame's scroll edge chains to the canvas unless
embed mode sets `overscroll-behavior: contain`; nothing can be dragged from
one frame to another.
