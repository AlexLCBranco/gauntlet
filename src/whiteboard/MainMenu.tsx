import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  TldrawUiButton,
  TldrawUiButtonLabel,
  TldrawUiDialogBody,
  TldrawUiDialogCloseButton,
  TldrawUiDialogFooter,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useDialogs,
  useEditor,
  type Editor,
} from "tldraw";

/** Deletes everything on the current page, as one undo step. */
export function clearPage(editor: Editor) {
  const ids = [...editor.getCurrentPageShapeIds()];
  if (ids.length === 0) return;
  editor.markHistoryStoppingPoint("clear page");
  editor.deleteShapes(ids);
}

function ClearPageDialog({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const name = editor.getCurrentPage().name;
  const count = editor.getCurrentPageShapeIds().size;
  return (
    <>
      <TldrawUiDialogHeader>
        <TldrawUiDialogTitle>Clear page</TldrawUiDialogTitle>
        <TldrawUiDialogCloseButton />
      </TldrawUiDialogHeader>
      <TldrawUiDialogBody style={{ maxWidth: 360 }}>
        This deletes everything on “{name}” ({count} {count === 1 ? "thing" : "things"}). Other pages stay as they are.
        Ctrl+Z brings it back.
      </TldrawUiDialogBody>
      <TldrawUiDialogFooter className="tlui-dialog__footer__actions">
        <TldrawUiButton type="normal" onClick={onClose}>
          <TldrawUiButtonLabel>Cancel</TldrawUiButtonLabel>
        </TldrawUiButton>
        <TldrawUiButton
          type="danger"
          data-testid="clear-page-confirm"
          onClick={() => {
            clearPage(editor);
            onClose();
          }}
        >
          <TldrawUiButtonLabel>Clear page</TldrawUiButtonLabel>
        </TldrawUiButton>
      </TldrawUiDialogFooter>
    </>
  );
}

/** tldraw's main menu (top left), plus "Clear page" like Excalidraw's
    "Reset the canvas", which asks first. */
export function MainMenu() {
  const { addDialog } = useDialogs();
  return (
    <DefaultMainMenu>
      <TldrawUiMenuGroup id="gauntlet-page">
        <TldrawUiMenuItem
          id="clear-page"
          label={"Clear page" as never}
          icon="trash"
          onSelect={() => {
            addDialog({ component: ClearPageDialog });
          }}
        />
        <TldrawUiMenuItem
          id="backups"
          label={"Backups" as never}
          icon="external-link"
          onSelect={() => {
            window.location.href = "/backups/";
          }}
        />
      </TldrawUiMenuGroup>
      <DefaultMainMenuContent />
    </DefaultMainMenu>
  );
}
