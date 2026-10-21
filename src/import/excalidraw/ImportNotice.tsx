import { useEffect, useState } from "react";

import { IMPORT_EVENT, type ImportResult } from "./importExcalidraw";
import "./import.css";

/** After an Excalidraw paste or import: how much came over, and every
    element that couldn't be converted exactly. Stays until closed when
    something is listed; otherwise goes after a few seconds. */
export function ImportNotice() {
  const [result, setResult] = useState<ImportResult | null>(null);
  useEffect(() => {
    const on = (e: Event) => setResult((e as CustomEvent<ImportResult>).detail);
    window.addEventListener(IMPORT_EVENT, on);
    return () => window.removeEventListener(IMPORT_EVENT, on);
  }, []);
  useEffect(() => {
    if (!result || result.notConverted.length > 0) return;
    const t = setTimeout(() => setResult(null), 5000);
    return () => clearTimeout(t);
  }, [result]);
  if (!result) return null;
  const what = result.source === "paste" ? "Pasted" : "Imported";
  return (
    <div className="gk-import-notice gauntlet-island" role="status" data-testid="import-notice" onPointerDown={(e) => e.stopPropagation()}>
      <div className="gk-import-notice__head">
        <span>
          {result.count > 0 ? `${what} ${result.count} element${result.count === 1 ? "" : "s"} from Excalidraw.` : "Nothing imported."}
          {result.notConverted.length > 0 && ` Not converted exactly: ${result.notConverted.length}.`}
        </span>
        <button type="button" aria-label="Close" title="Close" onClick={() => setResult(null)}>
          ×
        </button>
      </div>
      {result.notConverted.length > 0 && (
        <ul className="gk-import-notice__list" data-testid="import-not-converted">
          {result.notConverted.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
