import { useEffect, useRef, useState } from "react";

import { describe, fileName, readBackup, summarize, type BackupFile } from "./format";
import { makeBackup, restoreBackup } from "./storage";

/**
 * The backup page (/backup/): "Save a backup" downloads one file with
 * everything this site keeps in this browser; "Restore from a backup
 * file…" puts such a file back, after downloading a copy of what is here
 * now, so a restore can itself be undone.
 */

function download(file: BackupFile, name: string): void {
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });

type Status =
  | { readonly kind: "idle" }
  | { readonly kind: "busy"; readonly text: string }
  | { readonly kind: "saved"; readonly name: string; readonly what: string }
  | { readonly kind: "confirm"; readonly file: BackupFile }
  | { readonly kind: "restored"; readonly what: string; readonly safety: string }
  | { readonly kind: "error"; readonly text: string };

export function BackupPage() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [here, setHere] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const refreshHere = () =>
    makeBackup(new Date()).then(
      (file) => setHere(describe(summarize(file))),
      () => setHere(null),
    );
  useEffect(() => void refreshHere(), []);

  const save = async () => {
    setStatus({ kind: "busy", text: "Saving…" });
    try {
      const now = new Date();
      const file = await makeBackup(now);
      const name = fileName("gauntlet-backup", now);
      download(file, name);
      setStatus({ kind: "saved", name, what: describe(summarize(file)) });
    } catch (error) {
      setStatus({ kind: "error", text: `The backup could not be made: ${String(error)}` });
    }
  };

  const pick = async (input: HTMLInputElement) => {
    const chosen = input.files?.[0];
    input.value = "";
    if (!chosen) return;
    let file: BackupFile | null = null;
    try {
      file = readBackup(JSON.parse(await chosen.text()));
    } catch {
      file = null;
    }
    setStatus(file ? { kind: "confirm", file } : { kind: "error", text: `“${chosen.name}” is not a gauntlet backup file.` });
  };

  const restore = async (file: BackupFile) => {
    setStatus({ kind: "busy", text: "Restoring…" });
    try {
      const now = new Date();
      const safety = fileName("gauntlet-before-restore", now);
      download(await makeBackup(now), safety);
      await restoreBackup(file);
      setStatus({ kind: "restored", what: describe(summarize(file)), safety });
      void refreshHere();
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const busy = status.kind === "busy";
  return (
    <main className="backup">
      <h1>Backup</h1>
      <p className="lead">
        One file with everything this site keeps in this browser: your Boardkit boards (with their pictures and trash),
        your Linkkit maps, the whiteboard and the home page.
      </p>
      <p className="here" data-testid="here">
        In this browser now: {here ?? "…"}
      </p>

      <div className="actions">
        <button type="button" className="primary" onClick={save} disabled={busy}>
          Save a backup
        </button>
        <button type="button" onClick={() => picker.current?.click()} disabled={busy}>
          Restore from a backup file…
        </button>
        <input
          ref={picker}
          type="file"
          accept=".json,application/json"
          aria-label="Backup file"
          hidden
          onChange={(event) => void pick(event.currentTarget)}
        />
      </div>

      <div role="status" className="status">
        {status.kind === "busy" && <p>{status.text}</p>}
        {status.kind === "saved" && (
          <p className="ok">
            Saved “{status.name}” to your Downloads folder ({status.what}). Move it somewhere safe, like OneDrive.
          </p>
        )}
        {status.kind === "error" && <p className="bad">{status.text}</p>}
        {status.kind === "restored" && (
          <>
            <p className="ok">Restored: {status.what}.</p>
            <p>
              What was here before is in “{status.safety}” in your Downloads folder, in case you want it back.
            </p>
            <p className="links">
              Open <a href="/boardkit/">Boardkit</a>, <a href="/linkkit/">Linkkit</a>,{" "}
              <a href="/whiteboard/">the whiteboard</a> or <a href="/">the home page</a>.
            </p>
          </>
        )}
      </div>

      {status.kind === "confirm" && (
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="card">
            <h2 id="confirm-title">Replace what's here with this backup?</h2>
            <p>
              Backup of {when(status.file.createdAt)}: {describe(summarize(status.file))}.
            </p>
            <p>Everything in this browser now ({here ?? "…"}) is replaced by it.</p>
            <p className="warn">First close every other tab of this site (Boardkit, Linkkit, whiteboard, home page).</p>
            <p>A copy of what's here now is downloaded first, so this can be undone.</p>
            <div className="actions">
              <button type="button" onClick={() => setStatus({ kind: "idle" })}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => void restore(status.file)}>
                Replace with this backup
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
