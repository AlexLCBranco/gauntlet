import { useEditor, useValue } from "tldraw";

import "./lasso.css";
import { lassoLoop } from "./LassoTool";

/** The lasso loop while it's being drawn: a dashed outline, closed back to
    its start, with a light fill. */
export function LassoOverlay() {
  const editor = useEditor();
  const points = useValue(
    "lasso points",
    () => {
      const loop = lassoLoop.get();
      if (loop.length < 2) return null;
      editor.getCamera(); // redraw when the camera moves
      return loop.map((p) => editor.pageToViewport(p)).map((p) => `${p.x},${p.y}`).join(" ");
    },
    [editor],
  );
  if (!points) return null;
  return (
    <svg className="gauntlet-lasso" data-testid="lasso-loop">
      <polygon points={points} />
    </svg>
  );
}
