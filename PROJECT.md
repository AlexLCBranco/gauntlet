# Gauntlet

The shared home address for my apps. Each app keeps its own repo and Vercel
project; Gauntlet forwards a path on this domain to it, so everything lives
under one address.

Last updated: 2026-10-18 (canvas plan approved; phase 1 done; see GAUNTLET-PLAN.md).

Right now it is just two static files:

- `index.html` — a plain page at `/` linking to each app.
- `vercel.json` — rewrites that forward each app's path to its own deployment.

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
3. Add a link to `index.html`.

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
skipped (already built), phases 3–5 pending. The list below is the
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
