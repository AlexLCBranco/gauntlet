import { createShapeId, type Editor, type TLUiToolItem } from "tldraw";

import { pageBox } from "../pages/keepFilled";
import { insideDelta, SHEET } from "../pages/sheet";
import { SLATE_TYPE, type SlateShape } from "./SlateShape";
import { slateToday } from "./today";

/** The toolbar's "Slate" button, next to Board and Map: a click puts a
    Slate widget for today (São Paulo's date) on the current page. Wired in
    the whiteboard's `overrides.tools`. */
export function slateToolItem(editor: Editor): TLUiToolItem {
  return {
    id: "slate",
    label: "tool.slate" as never,
    icon: <div />,
    onSelect: () => insertSlate(editor),
  };
}

/** One undo step: a Slate widget pinned to `date` in the middle of the
    view, inside the page, selected. It sizes itself once its cards are
    drawn (SlateWidget.tsx), fitting the whole night to the page. */
export function insertSlate(editor: Editor, date = slateToday()) {
  const { w, h } = editor.getShapeUtil<SlateShape>(SLATE_TYPE).getDefaultProps();
  const view = editor.getViewportPageBounds();
  const at = { x: view.midX - w / 2, y: view.midY - h / 2, w, h };
  const d = insideDelta(at, pageBox.get() ?? SHEET);
  const id = createShapeId();
  editor.markHistoryStoppingPoint("add slate");
  editor.createShape<SlateShape>({ id, type: SLATE_TYPE, x: at.x + d.x, y: at.y + d.y, props: { date } });
  editor.setCurrentTool("select");
  editor.select(id);
  return id;
}
