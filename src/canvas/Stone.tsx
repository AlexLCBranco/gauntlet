import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import type { Edge, Rect, Stone as StoneData } from "../domain/layout";
import { frameUrl, type FromFrame, type Status } from "../domain/protocol";
import { register } from "./frames";
import styles from "./Canvas.module.css";

export type Grab = "move" | Edge;

type Props = {
  stone: StoneData;
  rect: Rect;
  /** Stacking order among overlapping stones. */
  z: number;
  name: string;
  linked: boolean;
  loaded: boolean;
  focused: boolean;
  status: Status | undefined;
  /** Something is being dragged or resized: shield every frame. */
  shielded: boolean;
  onGrab: (stone: StoneData, grab: Grab, e: ReactPointerEvent) => void;
  onRemove: (stone: StoneData) => void;
  onReload: (stone: StoneData) => void;
  onFrame: (stoneId: string, el: HTMLIFrameElement | null) => void;
  onMessage: (stoneId: string, msg: FromFrame) => void;
  onFrameFocus: (stoneId: string, focused: boolean) => void;
};

const pct = (v: number) => `${v * 100}%`;

export function Stone(props: Props) {
  const { stone, rect, z, name, linked, loaded, focused, status, shielded, onGrab } = props;
  const grab = (kind: Grab) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    onGrab(stone, kind, e);
  };
  return (
    <div
      className={styles.stone}
      data-stone-id={stone.id}
      data-app={stone.app}
      data-loaded={loaded}
      data-focused={focused}
      style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h), zIndex: z }}
    >
      <div className={styles.stoneHeader} onPointerDown={grab("move")} title="Drag to move">
        <span className={styles.appTag} data-app={stone.app}>
          {stone.app === "boardkit" ? "Board" : "Map"}
        </span>
        <span className={styles.stoneName}>{name}</span>
        {linked && <span className={styles.badge}>Linked</span>}
        {status && status !== "ok" && (
          <button type="button" className={styles.headerButton} onPointerDown={(e) => e.stopPropagation()} onClick={() => props.onReload(stone)}>
            Reload
          </button>
        )}
        <button
          type="button"
          className={styles.headerButton}
          aria-label={`Remove ${name} from the canvas`}
          title="Remove from the canvas (Ctrl+Z brings it back)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => props.onRemove(stone)}
        >
          ×
        </button>
      </div>
      <div className={styles.stoneBody}>
        {loaded ? (
          <Frame {...props} />
        ) : (
          <div className={styles.unloaded} data-testid="unloaded">
            {name}
            <span>Loads when you come near this page</span>
          </div>
        )}
        {shielded && <div className={styles.shield} />}
      </div>
      <div className={styles.resizeE} onPointerDown={grab("e")} />
      <div className={styles.resizeS} onPointerDown={grab("s")} />
      <div className={styles.resizeSE} onPointerDown={grab("se")} title="Drag to resize" />
    </div>
  );
}

/** The app in a frame. Its message handler is registered before it gets its
    address. */
function Frame({ stone, name, onFrame, onMessage, onFrameFocus }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const latest = useRef({ onMessage, onFrameFocus });
  latest.current = { onMessage, onFrameFocus };

  useLayoutEffect(() => {
    const el = ref.current!;
    const unregister = register(el, (msg) => latest.current.onMessage(stone.id, msg));
    // Focus inside the frame: its own window's focus and blur (same origin),
    // hooked again on every load since each load is a new window.
    const onLoad = () => {
      const win = el.contentWindow;
      if (!win) return;
      win.addEventListener("focus", () => latest.current.onFrameFocus(stone.id, true));
      win.addEventListener("blur", () => latest.current.onFrameFocus(stone.id, false));
      if (document.activeElement === el) latest.current.onFrameFocus(stone.id, true);
    };
    el.addEventListener("load", onLoad);
    onFrame(stone.id, el);
    el.src = frameUrl(stone.app, stone.itemId);
    return () => {
      el.removeEventListener("load", onLoad);
      unregister();
      onFrame(stone.id, null);
      latest.current.onFrameFocus(stone.id, false);
    };
    // The frame's address never changes for a stone.
  }, [stone.id]);

  return <iframe ref={ref} className={styles.frame} title={name} />;
}
