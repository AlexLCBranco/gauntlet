import { useEffect, useRef, useState } from "react";
import { TldrawUiIcon, useEditor, useIsToolSelected, useTools, useTranslation, useValue, type TLUiToolItem } from "tldraw";

import { BAR, LABELS, MORE, SEPARATOR } from "./toolbarLayout";

/** A tool's name (toolbarLayout.ts), else tldraw's own label. */
function useLabel() {
  const msg = useTranslation();
  return (item: TLUiToolItem) => {
    const l = item.label as unknown;
    return LABELS[item.id] ?? msg((typeof l === "string" ? l : (l as Record<string, string>).default) as never);
  };
}

function ToolButton({ item }: { item: TLUiToolItem }) {
  const selected = useIsToolSelected(item);
  const label = useLabel()(item);
  return (
    <button
      type="button"
      className="gk-tool"
      data-testid={`tools.${item.id}`}
      data-value={item.id}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={() => item.onSelect("toolbar")}
    >
      <TldrawUiIcon icon={item.icon} label={label} small />
    </button>
  );
}

/** The ⋮ "More tools" menu's entry for a tool. */
function MoreItem({ item, onDone }: { item: TLUiToolItem; onDone: () => void }) {
  const selected = useIsToolSelected(item);
  const label = useLabel()(item);
  return (
    <button
      type="button"
      role="menuitem"
      className="gk-more-item"
      data-testid={`tools.more.${item.id}`}
      data-value={item.id}
      aria-pressed={selected}
      disabled={item.id === "markup"}
      onClick={() => {
        onDone();
        item.onSelect("toolbar");
      }}
    >
      <TldrawUiIcon icon={item.icon} label={label} small />
      <span className="gk-more-label">{label}</span>
    </button>
  );
}

/**
 * The toolbar along the top, centred, as in Excalidraw: exactly the tools
 * in toolbarLayout.ts, at every window size (our own row, not tldraw's
 * overflowing one), then the ⋮ "More tools" button and its menu.
 */
export function Toolbar() {
  const editor = useEditor();
  const tools = useTools();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = useValue("current tool", () => editor.getCurrentToolId(), [editor]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  return (
    <div className="gauntlet-top-toolbar" ref={root} onPointerDown={(e) => e.stopPropagation()}>
      <div className="gk-toolbar gauntlet-island" role="toolbar" data-testid="toolbar">
        {BAR.map((id, i) =>
          id === SEPARATOR ? <div key={`sep${i}`} className="gk-toolbar-sep" role="separator" /> : tools[id] && <ToolButton key={id} item={tools[id]} />,
        )}
        <button
          type="button"
          className="gk-tool gk-more-button"
          data-testid="tools.more-button"
          aria-label="More tools"
          title="More tools"
          aria-expanded={open}
          // Lit while a tool from the menu is on.
          aria-pressed={MORE.includes(current)}
          onClick={() => setOpen((o) => !o)}
        >
          <TldrawUiIcon icon="dots-vertical" label="More tools" small />
        </button>
      </div>
      {open && (
        <div className="gk-more gauntlet-island" role="menu" data-testid="tools.more">
          {MORE.map((id) => tools[id] && <MoreItem key={id} item={tools[id]} onDone={() => setOpen(false)} />)}
        </div>
      )}
    </div>
  );
}
