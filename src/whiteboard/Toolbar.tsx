import { useEffect, useRef, useState } from "react";
import { TldrawUiIcon, useEditor, useIsToolSelected, useTools, useTranslation, useValue, type TLUiToolItem } from "tldraw";

import { dotsIcon, TOOL_ICONS } from "./toolbarIcons";
import { BAR, KEYS, LABELS, MORE, SEPARATOR, tooltip } from "./toolbarLayout";
import "./toolbar.css";

/** A tool's name (toolbarLayout.ts), else tldraw's own label. */
function useLabel() {
  const msg = useTranslation();
  return (item: TLUiToolItem) => {
    const l = item.label as unknown;
    return LABELS[item.id] ?? msg((typeof l === "string" ? l : (l as Record<string, string>).default) as never);
  };
}

/** Excalidraw's icon for the tool (toolbarIcons.tsx), else tldraw's. */
function Icon({ item, label }: { item: TLUiToolItem; label: string }) {
  return TOOL_ICONS[item.id] ?? <TldrawUiIcon icon={item.icon} label={label} small />;
}

/** A button on the bar, as Excalidraw's ToolIcon: the icon, and the key
    that picks it in the bottom-right corner. */
function ToolButton({ item }: { item: TLUiToolItem }) {
  const selected = useIsToolSelected(item);
  const label = useLabel()(item);
  const hint = KEYS[item.id]?.hint;
  return (
    <button
      type="button"
      className="gk-tool"
      data-testid={`tools.${item.id}`}
      data-value={item.id}
      aria-label={label}
      aria-pressed={selected}
      aria-keyshortcuts={hint}
      title={tooltip(item.id)}
      onClick={() => item.onSelect("toolbar")}
    >
      <span className="gk-tool__icon">
        <Icon item={item} label={label} />
      </span>
      {hint && <span className="gk-tool__kbd">{hint}</span>}
    </button>
  );
}

/** The ⋮ "More tools" menu's entry for a tool, as Excalidraw's dropdown
    item: icon, name, its key on the right. */
function MoreItem({ item, onDone }: { item: TLUiToolItem; onDone: () => void }) {
  const selected = useIsToolSelected(item);
  const label = useLabel()(item);
  const hint = KEYS[item.id]?.hint;
  return (
    <button
      type="button"
      role="menuitem"
      className="gk-more-item"
      data-testid={`tools.more.${item.id}`}
      data-value={item.id}
      aria-pressed={selected}
      aria-keyshortcuts={hint}
      title={tooltip(item.id)}
      // Markup's tool comes in step 4 of the toolbar rework.
      disabled={item.id === "markup"}
      onClick={() => {
        onDone();
        item.onSelect("toolbar");
      }}
    >
      <span className="gk-more-item__icon">
        <Icon item={item} label={label} />
      </span>
      <span className="gk-more-item__text">{label}</span>
      {hint && <span className="gk-more-item__shortcut">{hint}</span>}
    </button>
  );
}

/**
 * The toolbar along the top, centred, as in Excalidraw: exactly the tools
 * in toolbarLayout.ts, at every window size (our own row, not tldraw's
 * overflowing one), then the ⋮ "More tools" button and its menu. Looks:
 * toolbar.css (Excalidraw's own values).
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
      <div className="gk-toolbar" role="toolbar" data-testid="toolbar">
        {BAR.map((id, i) =>
          id === SEPARATOR ? <div key={`sep${i}`} className="gk-toolbar-sep" role="separator" /> : tools[id] && <ToolButton key={id} item={tools[id]} />,
        )}
        <button
          type="button"
          className="gk-more-button"
          data-testid="tools.more-button"
          aria-label="More tools"
          title="More tools"
          aria-expanded={open}
          // Lit while a tool from the menu is on.
          aria-pressed={MORE.includes(current)}
          onClick={() => setOpen((o) => !o)}
        >
          {dotsIcon}
        </button>
      </div>
      {open && (
        <div className="gk-more" role="menu" data-testid="tools.more">
          {MORE.map((id) => tools[id] && <MoreItem key={id} item={tools[id]} onDone={() => setOpen(false)} />)}
        </div>
      )}
    </div>
  );
}
