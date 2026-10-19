import { useEffect, useRef, useState } from "react";

import { fromFile, summaryOf, toFile, type Snapshot } from "./snapshot";
import { backUp, current, list, restore } from "./store";
import "./backups.css";

const REASON: Record<Snapshot["reason"], string> = {
  auto: "Automatic",
  manual: "Made by hand",
  "before-restore": "Before a restore",
  file: "From a file",
};

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Downloads backup `s` as a file. */
async function saveAsFile(s: Snapshot) {
  const blob = new Blob([JSON.stringify(await toFile(s))], { type: "application/json" });
  const a = document.createElement("a");
  const d = new Date(s.at);
  const pad = (n: number) => String(n).padStart(2, "0");
  a.href = URL.createObjectURL(blob);
  a.download = `gauntlet-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/**
 * The Backups page (/backups/): every backup of the owner's Boardkit,
 * Linkkit and home-page data on this site, newest first, each with
 * "Restore this". Also: back up now, download a backup as a file, restore
 * from a file. Restoring first backs up the data as it is, so a restore
 * can be undone from the same list.
 */
export function BackupsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [confirming, setConfirming] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () =>
    list()
      .then(setSnapshots)
      .catch((err) => setMessage({ text: `Couldn't read the backups: ${String(err)}`, bad: true }));
  useEffect(() => {
    void reload();
  }, []);

  const act = async (work: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await work() });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), bad: true });
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const doRestore = (s: Snapshot) =>
    act(async () => {
      setConfirming(null);
      await restore(s);
      return `Restored the backup from ${when(s.at)}. Reload any Boardkit, Linkkit or whiteboard tab that is open. (Your data from just before is in the list as "Before a restore".)`;
    });

  const download = (s: Snapshot) =>
    act(async () => {
      await saveAsFile(s);
      return "Downloaded. Keep the file somewhere safe (OneDrive, for example).";
    });

  const fromAFile = (file: File) =>
    act(async () => {
      const s = fromFile(await file.text(), Date.now(), `${Date.now()}-file`);
      setConfirming(s);
      return `Read ${file.name}. Check what it holds, then restore it.`;
    });

  return (
    <main className="bk-page">
      <header className="bk-head">
        <h1>Backups</h1>
        <nav>
          <a href="/">Home</a>
          <a href="/whiteboard/">Whiteboard</a>
        </nav>
      </header>
      <p className="bk-intro">
        Your Boardkit boards, Linkkit maps and home page on this site are backed up automatically: when you open the home page or the whiteboard,
        and every 10 minutes while one is open, if anything changed. The newest 30 are kept, and one a day for 90 days.
      </p>
      <div className="bk-actions">
        <button type="button" disabled={busy} onClick={() => act(async () => (await backUp("manual"), "Backed up."))}>
          Back up now
        </button>
        <button type="button" disabled={busy} onClick={() => act(async () => (await saveAsFile(await current("manual")), "Downloaded. Keep the file somewhere safe (OneDrive, for example)."))}>
          Download everything as a file
        </button>
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
          Restore from a file…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="restore-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void fromAFile(file);
          }}
        />
      </div>
      {message && (
        <p className="bk-message" role="status" data-bad={message.bad ? "" : undefined}>
          {message.text}
        </p>
      )}
      {confirming && (
        <div className="bk-confirm" role="alertdialog" aria-label="Restore this backup?">
          <p>
            Restore the backup from <strong>{when(confirming.at)}</strong>? Your boards, maps and home page go back to how they were then.
            What you have now is backed up first, so you can come back to it.
          </p>
          <Contents s={confirming} />
          <div className="bk-actions">
            <button type="button" className="bk-danger" disabled={busy} onClick={() => void doRestore(confirming)}>
              Restore
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {snapshots === null ? (
        <p className="bk-intro">Loading…</p>
      ) : snapshots.length === 0 ? (
        <p className="bk-intro">No backups yet. Press "Back up now", or open the home page or the whiteboard.</p>
      ) : (
        <ol className="bk-list" aria-label="Backups">
          {snapshots.map((s) => (
            <li key={s.id} data-backup-id={s.id}>
              <div className="bk-when">
                <strong>{when(s.at)}</strong>
                <span>{REASON[s.reason]}</span>
              </div>
              <Contents s={s} />
              <div className="bk-row-actions">
                <button type="button" disabled={busy} onClick={() => setConfirming(s)}>
                  Restore this
                </button>
                <button type="button" disabled={busy} onClick={() => void download(s)}>
                  Download
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

function Contents({ s }: { s: Snapshot }) {
  const { boards, maps } = summaryOf(s.local);
  const images = s.idb.boardkit.length + s.idb.linkkit.length;
  return (
    <p className="bk-contents">
      {boards.length} board{boards.length === 1 ? "" : "s"}
      {boards.length > 0 && `: ${boards.join(", ")}`} · {maps.length} map{maps.length === 1 ? "" : "s"}
      {maps.length > 0 && `: ${maps.join(", ")}`}
      {images > 0 && ` · ${images} stored item${images === 1 ? "" : "s"} (images, folder link)`}
    </p>
  );
}
