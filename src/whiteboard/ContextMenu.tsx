import { DefaultContextMenu, DefaultContextMenuContent, GroupMenuItem, TldrawUiMenuGroup, TldrawUiMenuItem, UngroupMenuItem, useEditor, useValue, type TLUiContextMenuProps } from "tldraw";

import { LinkMenuItems } from "../links/LinkMenuItems";
import { addSelection } from "../stamps/store";

/** "Add to tray" (the stamps tray, Edges round item 6): what is selected
    becomes a sticker. */
function TrayMenuItem() {
  const editor = useEditor();
  const any = useValue("anything selected", () => editor.getSelectedShapeIds().length > 0, [editor]);
  if (!any) return null;
  return (
    <TldrawUiMenuGroup id="gauntlet-tray">
      <TldrawUiMenuItem id="add-to-tray" label={"Add to tray" as never} onSelect={() => void addSelection(editor)} />
    </TldrawUiMenuGroup>
  );
}

/** tldraw's right-click menu with Group and Ungroup first, as in
    Excalidraw (owner, toolbar rework step 4): tldraw has them only inside
    its Edit submenu. Each shows only when it applies. Then the item's link
    (src/links/; owner, 2026-10-23). */
export function ContextMenu(props: TLUiContextMenuProps) {
  return (
    <DefaultContextMenu {...props}>
      <TldrawUiMenuGroup id="gauntlet-group">
        <GroupMenuItem />
        <UngroupMenuItem />
      </TldrawUiMenuGroup>
      <LinkMenuItems />
      <TrayMenuItem />
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  );
}
