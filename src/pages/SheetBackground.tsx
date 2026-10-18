import { useEditor, useValue } from "tldraw";

import { SHEET } from "./sheet";
import "./pages.css";

/** The page as a sheet of paper: the sheet in the canvas colour, the space
    around it darker. Drawn behind every shape. */
export function SheetBackground() {
  const editor = useEditor();
  const rect = useValue(
    "sheet rect",
    () => {
      const z = editor.getZoomLevel();
      const p = editor.pageToViewport({ x: SHEET.x, y: SHEET.y });
      return { left: p.x, top: p.y, width: SHEET.w * z, height: SHEET.h * z };
    },
    [editor],
  );
  return (
    <div className="gauntlet-outside">
      <div className="gauntlet-sheet" data-testid="sheet" style={rect} />
    </div>
  );
}
