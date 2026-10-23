import { useEditor, useValue } from "tldraw";

import { clearMarkup, keepMarks, MARKUP_COLOR, markupDraft, markupMarks, type Mark } from "./markup";
import "./markup.css";

/** A mark's width on the page (it zooms with the page, as drawings do). */
const WIDTH = 4;

function MarkPath({ mark }: { mark: Mark }) {
  if (mark.kind === "pen") {
    const d = mark.points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
    return <path d={d} data-mark="pen" />;
  }
  const { from, to } = mark;
  return (
    <>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} data-mark={mark.kind} />
      {mark.kind === "arrow" && <ArrowHead from={from} to={to} />}
    </>
  );
}

function ArrowHead({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const len = 18;
  const side = (t: number) => `${to.x - Math.cos(a + t) * len} ${to.y - Math.sin(a + t) * len}`;
  return <path d={`M${side(0.45)} L${to.x} ${to.y} L${side(-0.45)}`} />;
}

/**
 * The red marks over the page (markup.ts): drawn above every shape, moving
 * and zooming with the page, never taking the pointer. While there are
 * marks, "Clear markup" and "Keep marks" show under the toolbar.
 */
export function MarkupLayer() {
  const editor = useEditor();
  const marks = useValue(markupMarks);
  const draft = useValue(markupDraft);
  const cam = useValue("camera", () => editor.getCamera(), [editor]);
  const all = draft ? [...marks, draft] : marks;
  return (
    <>
      {all.length > 0 && (
        <svg className="gk-markup" data-testid="markup-layer" aria-hidden="true">
          <g transform={`scale(${cam.z}) translate(${cam.x} ${cam.y})`} stroke={MARKUP_COLOR} strokeWidth={WIDTH} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {all.map((m, i) => (
              <MarkPath key={i} mark={m} />
            ))}
          </g>
        </svg>
      )}
      {marks.length > 0 && (
        <div className="gk-markup-bar" data-testid="markup-bar" onPointerDown={(e) => editor.markEventAsHandled(e)}>
          <button type="button" data-testid="markup-clear" onClick={() => clearMarkup()}>
            Clear markup
          </button>
          <button type="button" data-testid="markup-keep" onClick={() => keepMarks(editor)}>
            Keep marks
          </button>
        </div>
      )}
    </>
  );
}
