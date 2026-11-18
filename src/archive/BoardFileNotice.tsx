import { useEffect, useState } from "react";

// GT-10: what "Save board to file" and "Open board file…" did, in the
// Excalidraw import's notice (its look: gk-import-notice). Told by a window
// event, not a hook in the main menu: a toasts hook there made the menu draw
// again on every pointer move (the hover speed check in perf.e2e.ts).

export const BOARD_FILE_EVENT = "gauntlet:board-file";
export interface BoardFileResult {
  readonly title: string;
  readonly text: string;
  readonly error?: boolean;
}
export const tellBoardFile = (r: BoardFileResult) => window.dispatchEvent(new CustomEvent(BOARD_FILE_EVENT, { detail: r }));

export function BoardFileNotice() {
  const [result, setResult] = useState<BoardFileResult | null>(null);
  useEffect(() => {
    const on = (e: Event) => setResult((e as CustomEvent<BoardFileResult>).detail);
    window.addEventListener(BOARD_FILE_EVENT, on);
    return () => window.removeEventListener(BOARD_FILE_EVENT, on);
  }, []);
  // a success goes by itself; a failure stays until closed
  useEffect(() => {
    if (!result || result.error) return;
    const t = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(t);
  }, [result]);
  if (!result) return null;
  return (
    <div className="gk-import-notice gauntlet-island" role="status" data-testid="board-file-notice" data-error={result.error ? "" : undefined} onPointerDown={(e) => e.stopPropagation()}>
      <div className="gk-import-notice__head">
        <span>
          <b>{result.title}</b> {result.text}
        </span>
        <button type="button" aria-label="Close" title="Close" onClick={() => setResult(null)}>
          ×
        </button>
      </div>
    </div>
  );
}
