import { useEffect, useState, useSyncExternalStore } from "react";

import { keepBackup, listAutoBackups } from "./auto";
import { listFolderCopies, pickFolder, readFolderCopy, reconnectFolder, LATEST_FILE } from "./folder";
import { readBackup, summarize, type Summary } from "./format";
import { saveState, showsSavedToFolder, subscribeSave, type SaveState } from "./save";
import { PENDING_RESTORE } from "./restoreKey";
import "./save.css";

// The whiteboard's one save status (owner, Edges round item 2), in the page
// arrows' island (bottom right), so it covers nothing new of the page's
// edge: "Saved", "Saving…", a red "Not saved", "Click to reconnect folder"
// or "Choose a save folder". Hover: when it last saved and where. A click
// opens the Restore list (every copy, folder and browser), or reconnects /
// picks the folder.

const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** "Today 20:41", "Yesterday 09:05", "Mon 3 Nov 18:00". */
export function plainWhen(at: number, now = Date.now()): string {
  const d = new Date(at);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date(now)) - day(d)) / 86_400_000);
  const t = time(at);
  if (diff === 0) return `Today ${t}`;
  if (diff === 1) return `Yesterday ${t}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} ${t}`;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
/** "14 pages · 6 boards · 2 maps". */
export const shortWhat = (s: Summary) => [plural(s.whiteboardPages, "page"), plural(s.boards, "board"), plural(s.maps, "map")].join(" · ");

function label(s: SaveState): string {
  if (s.phase !== "failed" && showsSavedToFolder()) return "Saved to folder";
  switch (s.phase) {
    case "saved":
      return "Saved";
    case "saving":
      return "Saving…";
    case "failed":
      return "Not saved";
    case "reconnect":
      return "Click to reconnect folder";
    case "no-folder":
      return "Choose a save folder";
  }
}

function hover(s: SaveState): string {
  const last = s.savedAt ? `Last saved to your folder “${s.folder ?? "?"}” at ${plainWhen(s.savedAt)}.` : "Not yet saved to a folder.";
  switch (s.phase) {
    case "saved":
      return `${last}\nAlso kept in this browser as you go. Ctrl+S saves now. Click for the Restore list.`;
    case "saving":
      return `Changes are being written to your folder.\n${last}`;
    case "failed":
      return `NOT SAVED: ${s.detail ?? "the last save could not be written."}\n${last}\nClick for the Restore list.`;
    case "reconnect":
      return `Chrome wants your OK again to write to “${s.folder ?? "your folder"}”: one click.\nYour changes are kept in this browser meanwhile. ${last}`;
    case "no-folder":
      return "Saved in this browser only: clearing its data would lose everything.\nClick to choose a folder on your PC; everything saves there by itself.";
  }
}

export function SaveStatus() {
  const s = useSyncExternalStore(subscribeSave, saveState);
  const [open, setOpen] = useState(false);
  const click = async () => {
    if (s.phase === "reconnect") await reconnectFolder();
    else if (s.phase === "no-folder") await pickFolder();
    else setOpen((o) => !o);
  };
  return (
    <>
      <button type="button" className="gk-save" data-testid="save-status" data-phase={s.phase} title={hover(s)} onClick={() => void click()}>
        <span className="gk-save__dot" aria-hidden />
        {label(s)}
      </button>
      {open && <RestoreList onClose={() => setOpen(false)} />}
    </>
  );
}

type Copy = { key: string; source: "folder" | "browser"; at: number; what?: string; beforeRestore?: boolean; current?: boolean };


function RestoreList({ onClose }: { onClose: () => void }) {
  const [copies, setCopies] = useState<Copy[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const [folder, browser] = await Promise.all([listFolderCopies().catch(() => []), listAutoBackups().catch(() => [])]);
      const all: Copy[] = [
        ...folder.map((f) => ({ key: f.name, source: "folder" as const, at: f.at, current: f.name === LATEST_FILE })),
        ...browser.map((b) => {
          let what: string | undefined;
          try {
            const file = readBackup(JSON.parse(b.json));
            what = file ? shortWhat(summarize(file)) : undefined;
          } catch {
            what = undefined;
          }
          return { key: b.id, source: "browser" as const, at: b.at, what, beforeRestore: b.reason === "before-restore" };
        }),
      ].sort((a, b) => b.at - a.at);
      if (!live) return;
      setCopies(all);
      // The folder's files say what they hold only when read: newest first.
      for (const c of all.filter((c) => c.source === "folder").slice(0, 40)) {
        try {
          const file = readBackup(JSON.parse(await readFolderCopy(c.key)));
          if (file && live) setCopies((cs) => cs && cs.map((x) => (x === c || (x.key === c.key && x.source === "folder") ? { ...x, what: shortWhat(summarize(file)) } : x)));
        } catch {
          // Shown without what it holds.
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  const restore = async (c: Copy) => {
    setBusy(true);
    // A copy of now first, so this restore can itself be undone (it shows
    // at the top of this list, "before a restore").
    await keepBackup("before-restore");
    try {
      sessionStorage.setItem(PENDING_RESTORE, JSON.stringify({ source: c.source, key: c.key }));
    } catch {
      setBusy(false);
      return;
    }
    location.assign("/backup/?restore=1");
  };
  return (
    <div className="gk-restore" role="dialog" aria-label="Restore" data-testid="restore-list">
      <div className="gk-restore__head">
        <b>Restore</b>
        <button type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="gk-restore__lead">Puts everything back as it was then. What's here now is saved first, so a restore can be undone.</p>
      {copies === null ? (
        <p className="gk-restore__lead">Looking…</p>
      ) : copies.length === 0 ? (
        <p className="gk-restore__lead">No copies yet.</p>
      ) : (
        <ul>
          {copies.slice(0, 80).map((c) => (
            <li key={`${c.source}:${c.key}`}>
              <button type="button" disabled={busy} data-testid="restore-copy" data-source={c.source} data-key={c.key} onClick={() => void restore(c)}>
                <span>
                  {plainWhen(c.at)}
                  {c.what ? ` · ${c.what}` : ""}
                </span>
                <span className="gk-restore__where">
                  {c.source === "folder" ? (c.current ? "folder · current" : "folder") : "browser"}
                  {c.beforeRestore ? " · before a restore" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <a className="gk-restore__more" href="/backup/" target="_blank" rel="noopener">
        More (backup files, the apps' own exports)…
      </a>
    </div>
  );
}
