import { TldrawUiMenuGroup, TldrawUiMenuItem, useEditor, useValue } from "tldraw";

import { contextMenuPoint } from "./opener";
import { innerTargetAt, itemTarget, kindOf, openLinkPrompt, setUrlOf, urlOf, type LinkTarget } from "./targets";

/**
 * "Add link…" (or "Edit link…") and "Remove link" in the whiteboard's
 * right-click menu, for the one item right-clicked: a card, list or box
 * under the pointer in a board or map widget, else the item itself (a
 * board widget: its board). Inside a board or map being edited, the menu
 * is Boardkit's or Linkkit's own, with the same items.
 */
export function LinkMenuItems() {
  const editor = useEditor();
  const target = useValue(
    "link target",
    (): LinkTarget | null => {
      const selected = editor.getSelectedShapes();
      if (selected.length !== 1 || editor.getEditingShapeId() !== null) return null;
      const at = contextMenuPoint();
      return (at && innerTargetAt(selected[0], at.x, at.y)) ?? itemTarget(selected[0]);
    },
    [editor],
  );
  if (!target) return null;
  const url = urlOf(editor, target);
  const what = kindOf(editor, target);
  const to = what === "item" ? "" : `-${what}`;
  return (
    <TldrawUiMenuGroup id="gauntlet-link">
      <TldrawUiMenuItem
        id="gauntlet-add-link"
        label={(url ? "link.edit" : "link.add") + to}
        kbd="$k"
        onSelect={() => openLinkPrompt(editor, target, contextMenuPoint() ?? undefined)}
      />
      {url && <TldrawUiMenuItem id="gauntlet-remove-link" label={`link.remove${to}`} onSelect={() => setUrlOf(editor, target, undefined)} />}
    </TldrawUiMenuGroup>
  );
}

/** The menu's words: one per kind of thing, so it says what it acts on. */
export const LINK_TRANSLATIONS: Record<string, string> = Object.fromEntries(
  (["", "-card", "-list", "-board", "-box", "-map"] as const).flatMap((to) => {
    const noun = to ? ` to ${to.slice(1)}` : "";
    const of = to ? ` ${to.slice(1)}` : "";
    return [
      [`link.add${to}`, `Add link${noun}…`],
      [`link.edit${to}`, `Edit${of} link…`],
      [`link.remove${to}`, `Remove${of} link`],
    ];
  }),
);
