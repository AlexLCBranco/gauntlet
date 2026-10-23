import { useState } from "react";
import {
  TldrawUiButton,
  TldrawUiButtonLabel,
  TldrawUiDialogBody,
  TldrawUiDialogCloseButton,
  TldrawUiDialogFooter,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  useEditor,
} from "tldraw";

import { addWebEmbed, normalizeAddress } from "./WebEmbedShape";

/** The ⋮ menu's "Web embed" (key I): asks for an address and puts a web
    embed in the middle of the view. Pasting the address does the same. */
export function WebEmbedDialog({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const [text, setText] = useState("");
  const address = normalizeAddress(text);
  const add = () => {
    if (!address) return;
    onClose();
    addWebEmbed(editor, address);
  };
  return (
    <>
      <TldrawUiDialogHeader>
        <TldrawUiDialogTitle>Web embed</TldrawUiDialogTitle>
        <TldrawUiDialogCloseButton />
      </TldrawUiDialogHeader>
      <TldrawUiDialogBody style={{ maxWidth: 400 }}>
        <input
          className="gk-embed-input"
          data-testid="web-embed-url"
          autoFocus
          placeholder="Paste or type a web address"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <p className="gk-embed-hint">Tip: pasting an address straight onto the page does the same.</p>
      </TldrawUiDialogBody>
      <TldrawUiDialogFooter className="tlui-dialog__footer__actions">
        <TldrawUiButton type="normal" onClick={onClose}>
          <TldrawUiButtonLabel>Cancel</TldrawUiButtonLabel>
        </TldrawUiButton>
        <TldrawUiButton type="primary" data-testid="web-embed-add" disabled={!address} onClick={add}>
          <TldrawUiButtonLabel>Add</TldrawUiButtonLabel>
        </TldrawUiButton>
      </TldrawUiDialogFooter>
    </>
  );
}
