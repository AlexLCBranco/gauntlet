import {
  DefaultMainMenu,
  EditSubmenu,
  ExportFileContentSubMenu,
  PreferencesGroup,
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
  ViewSubmenu,
  type Editor,
} from "tldraw";

import { openBoardPicker } from "../boards/AddBoard";
import { openMapPicker } from "../maps/AddMap";
import { IMPORT_EVENT, importExcalidrawFile } from "../import/excalidraw/importExcalidraw";
// GT-10: the archive code loads only when one of its menu items is used
const archive = () => import("../archive/archive");

import { tellBoardFile } from "../archive/BoardFileNotice";

/** GT-10: asks for a board file saved by "Save board to file" and opens it as a new page. */
function pickBoardFile(editor: Editor) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.dataset.testid = "open-board-file-input";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    void file
      .text()
      .then(async (text) => (await archive()).openBoardFile(editor, text))
      .then(
        () => tellBoardFile({ title: "Board opened:", text: `"${editor.getCurrentPage().name}". Its widgets are frozen copies; "Go live" on one shows the live data.` }),
        (err: Error) => tellBoardFile({ title: "Couldn't open that file.", text: err.message, error: true }),
      );
  });
  document.body.append(input);
  input.click();
}

/** Asks for a .excalidraw file and imports it in the middle of the view
    (src/import/excalidraw/). */
function pickExcalidrawFile(editor: Editor) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".excalidraw,.json,application/vnd.excalidraw+json,application/json";
  input.dataset.testid = "import-excalidraw-input";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    importExcalidrawFile(editor, file, editor.getViewportPageBounds().center).catch((err: Error) =>
      window.dispatchEvent(new CustomEvent(IMPORT_EVENT, { detail: { source: "file", count: 0, notConverted: [err.message] } })),
    );
  });
  document.body.append(input);
  input.click();
}

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
    "Reset the canvas", which asks first, and adding an existing board or
    map (the toolbar's Board and Map buttons make new ones). */
export function MainMenu() {
  const { addDialog } = useDialogs();
  const editor = useEditor();
  return (
    <DefaultMainMenu>
      <TldrawUiMenuGroup id="gauntlet-add">
        <TldrawUiMenuItem id="add-existing-board" label={"Add existing board…" as never} icon="plus" onSelect={openBoardPicker} />
        <TldrawUiMenuItem id="add-existing-map" label={"Add existing map…" as never} icon="plus" onSelect={openMapPicker} />
      </TldrawUiMenuGroup>
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
          id="save-board-file"
          label={"Save board to file" as never}
          icon="download"
          onSelect={() => {
            archive().then((a) => a.saveBoardToFile(editor)).then(
              (name) => tellBoardFile({ title: "Board saved:", text: `this page, with its widgets' data, is in ${name}.` }),
              (err: Error) => tellBoardFile({ title: "Couldn't save the board.", text: err.message, error: true }),
            );
          }}
        />
        <TldrawUiMenuItem id="open-board-file" label={"Open board file…" as never} icon="file" onSelect={() => pickBoardFile(editor)} />
        <TldrawUiMenuItem
          id="import-excalidraw"
          label={"Import Excalidraw file…" as never}
          icon="file"
          onSelect={() => pickExcalidrawFile(editor)}
        />
        <TldrawUiMenuItem
          id="backup"
          label={"Backups" as never}
          icon="external-link"
          onSelect={() => {
            // A new tab: the whiteboard stays open.
            window.open("/backup/", "_blank", "noopener");
          }}
        />
      </TldrawUiMenuGroup>
      {/* tldraw's own menu without "Insert embed…" and "Upload media…":
          the toolbar's ⋮ menu is the only way in (owner, 2026-10-22). */}
      <TldrawUiMenuGroup id="basic">
        <EditSubmenu />
        <ViewSubmenu />
        <ExportFileContentSubMenu />
      </TldrawUiMenuGroup>
      <PreferencesGroup />
    </DefaultMainMenu>
  );
}
