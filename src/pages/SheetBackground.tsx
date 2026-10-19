import { useEditor, useValue } from "tldraw";

import { pageBox } from "./keepFilled";
import { SHEET } from "./sheet";
import "./pages.css";

/** The page in the canvas colour, the space around it darker. The page
    always fills the window (keepFilled.ts), so the darker space never
    shows; it stays as a guard. Drawn behind every shape. */
export function SheetBackground() {
  const editor = useEditor();
  const rect = useValue(
    "sheet rect",
    () => {
      const page = pageBox.get() ?? SHEET;
      const z = editor.getZoomLevel();
      const p = editor.pageToViewport({ x: page.x, y: page.y });
      return { left: p.x, top: p.y, width: page.w * z, height: page.h * z };
    },
    [editor],
  );
  return (
    <div className="gauntlet-outside">
      <div className="gauntlet-sheet" data-testid="sheet" style={rect} />
    </div>
  );
}
