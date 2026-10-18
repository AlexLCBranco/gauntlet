import { useEffect, useState } from "react";

import type { Source } from "../domain/sources";
import styles from "./Canvas.module.css";

type Props = {
  sources: Source[];
  page: number;
  onPick: (source: Source) => void;
  onClose: () => void;
};

/** Pick a Boardkit board or a Linkkit map to put on the current page. */
export function AddStone({ sources, page, onPick, onClose }: Props) {
  const [filter, setFilter] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = sources.filter((s) => s.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const group = (app: Source["app"], title: string) => {
    const items = shown.filter((s) => s.app === app);
    return (
      <section className={styles.pickGroup} aria-label={title}>
        <h3>{title}</h3>
        {items.length === 0 && <p className={styles.muted}>{filter ? "None match." : `None yet. Open ${app === "boardkit" ? "Boardkit" : "Linkkit"} to make one.`}</p>}
        {items.map((s) => (
          <button key={`${s.app}:${s.id}`} type="button" className={styles.pickItem} onClick={() => onPick(s)}>
            <span>{s.name}</span>
            {s.linked && <span className={styles.badge}>Linked</span>}
          </button>
        ))}
      </section>
    );
  };

  return (
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-label="Add a stone">
        <div className={styles.dialogHead}>
          <h2>Add to page {page + 1}</h2>
          <button type="button" className={styles.toolButton} onClick={onClose}>
            Close
          </button>
        </div>
        {sources.length > 8 && <input className={styles.filter} placeholder="Find…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a board or map" />}
        <div className={styles.pickColumns}>
          {group("boardkit", "Boardkit boards")}
          {group("linkkit", "Linkkit maps")}
        </div>
      </div>
    </div>
  );
}
