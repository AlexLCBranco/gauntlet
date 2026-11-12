import { useEffect, useRef, useState } from "react";
import { atom, useEditor, useValue, type Editor, type TLUiToolItem } from "tldraw";

import { lastPointOnPage } from "../widgets/WidgetPicker";
import { addImageFile, addSelection, deleteStamp, loadStamps, moveStamp, placeStamp, stamps, type Stamp } from "./store";
import "./stamps.css";

// The stamps tray's panel (owner, Edges round item 6; store.ts): opened and
// closed by its toolbar button (key Y). A click on a sticker puts a copy
// where the pointer last was on the page (else the middle of the view); a
// drag puts it where it is let go. "+ Add selection" (or right-click →
// "Add to tray") keeps what is selected; a picture pasted or dropped onto
// the tray becomes a sticker. × deletes; drag within the tray reorders.

export const trayOpen = atom("stamps tray open", false);

const icon = (
  <div>
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M6 3h6l-1 4h3v3H4V7h3z" />
      <path d="M3 13h12M5 15.5h8" strokeLinecap="round" />
    </svg>
  </div>
);

export function stampsToolItem(): TLUiToolItem {
  return {
    id: "stamps",
    label: "tool.stamps" as never,
    icon,
    onSelect: () => trayOpen.set(!trayOpen.get()),
  };
}

/** Where a drag from the tray would drop: a page point, or null when the
    pointer is not over the page (on the tray, a toolbar, outside). */
function dropPoint(editor: Editor, x: number, y: number): { x: number; y: number } | null {
  const el = document.elementFromPoint(x, y);
  if (!el || !editor.getContainer().contains(el) || el.closest(".tlui-layout, .gs-tray, .gw-picker")) return null;
  return editor.screenToPage({ x, y });
}

export function StampsTray() {
  const editor = useEditor();
  const open = useValue(trayOpen);
  const list = useValue(stamps);
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ stamp: Stamp; x: number; y: number; moved: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) void loadStamps();
  }, [open]);

  // Paste a picture into the tray: while the pointer is over it.
  useEffect(() => {
    if (!open) return;
    const paste = (e: ClipboardEvent) => {
      const el = box.current;
      if (!el || !el.matches(":hover")) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void addImageFile(editor, file);
    };
    window.addEventListener("paste", paste, true);
    return () => window.removeEventListener("paste", paste, true);
  }, [open, editor]);

  // A picture dropped on the tray: seen first (capture, on the window),
  // before tldraw takes a drop anywhere in its container onto the page.
  useEffect(() => {
    if (!open) return;
    const onTray = (e: DragEvent) => !!box.current && e.target instanceof Node && box.current.contains(e.target);
    const over = (e: DragEvent) => {
      if (!onTray(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const drop = (e: DragEvent) => {
      if (!onTray(e)) return;
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      e.preventDefault();
      e.stopPropagation();
      void (async () => {
        for (const f of files) await addImageFile(editor, f);
      })();
    };
    window.addEventListener("dragover", over, true);
    window.addEventListener("drop", drop, true);
    return () => {
      window.removeEventListener("dragover", over, true);
      window.removeEventListener("drop", drop, true);
    };
  }, [open, editor]);

  if (!open) return null;

  const begin = (e: React.PointerEvent, stamp: Stamp) => {
    if (e.button !== 0 || (e.target as Element).closest(".gs-stamp-del")) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    setDrag({ stamp, x: e.clientX, y: e.clientY, moved: false });
    const move = (m: PointerEvent) => {
      moved ||= Math.hypot(m.clientX - start.x, m.clientY - start.y) > 4;
      setDrag({ stamp, x: m.clientX, y: m.clientY, moved });
    };
    const up = (u: PointerEvent) => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      setDrag(null);
      if (!moved) {
        void placeStamp(editor, stamp, lastPointOnPage(editor));
        editor.focus();
        return;
      }
      // Let go over the tray: reorder, before the sticker under the pointer.
      const over = document.elementFromPoint(u.clientX, u.clientY)?.closest<HTMLElement>("[data-stamp]");
      if (over && box.current?.contains(over)) {
        const ids = stamps.get().map((s) => s.id);
        const to = ids.indexOf(over.dataset.stamp!);
        const from = ids.indexOf(stamp.id);
        if (to >= 0 && to !== from) void moveStamp(stamp.id, to);
        return;
      }
      const at = dropPoint(editor, u.clientX, u.clientY);
      if (at) {
        void placeStamp(editor, stamp, at);
        editor.focus();
      }
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  };

  return (
    <div
      ref={box}
      className="gs-tray gauntlet-island"
      role="dialog"
      aria-label="Stamps tray"
      data-testid="stamps-tray"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="gs-tray-head">
        <b>Stamps</b>
        <button
          type="button"
          className="gs-tray-add"
          data-testid="stamps-add-selection"
          disabled={busy}
          title="Keep what is selected as a sticker"
          onClick={async () => {
            setBusy(true);
            await addSelection(editor);
            setBusy(false);
          }}
        >
          + Add selection
        </button>
      </div>
      {list.length === 0 ? (
        <div className="gs-tray-empty">Select something and press “+ Add selection”, or paste or drop a picture here.</div>
      ) : (
        <div className="gs-tray-grid">
          {list.map((s) => (
            <div key={s.id} className="gs-stamp" data-stamp={s.id} data-testid="stamp" onPointerDown={(e) => begin(e, s)} title="Click: put one on the page · drag: put it there, or to another place in the tray">
              {s.thumbUrl ? <img src={s.thumbUrl} alt="" draggable={false} /> : <span>?</span>}
              <button
                type="button"
                className="gs-stamp-del"
                aria-label="Delete this sticker"
                data-testid="stamp-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteStamp(s.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {drag?.moved && drag.stamp.thumbUrl && <img className="gs-stamp-ghost" src={drag.stamp.thumbUrl} alt="" style={{ left: drag.x, top: drag.y }} />}
    </div>
  );
}
