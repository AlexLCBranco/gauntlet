import { DefaultContextMenu, DefaultContextMenuContent, GroupMenuItem, TldrawUiMenuGroup, UngroupMenuItem, type TLUiContextMenuProps } from "tldraw";

/** tldraw's right-click menu with Group and Ungroup first, as in
    Excalidraw (owner, toolbar rework step 4): tldraw has them only inside
    its Edit submenu. Each shows only when it applies. */
export function ContextMenu(props: TLUiContextMenuProps) {
  return (
    <DefaultContextMenu {...props}>
      <TldrawUiMenuGroup id="gauntlet-group">
        <GroupMenuItem />
        <UngroupMenuItem />
      </TldrawUiMenuGroup>
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  );
}
