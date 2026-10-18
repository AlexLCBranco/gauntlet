import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PageRecordType, useValue, type Editor, type TLPageId } from "tldraw";

import { nextPage, previousPage } from "./sheet";
import "./pages.css";

/** A page name not used yet: "Page 3", or "Page 4" if that's taken. */
function freshName(editor: Editor) {
  const taken = new Set(editor.getPages().map((p) => p.name));
  let n = editor.getPages().length + 1;
  while (taken.has(`Page ${n}`)) n++;
  return `Page ${n}`;
}

function go(editor: Editor, id: TLPageId) {
  editor.setCurrentPage(id);
  editor.resetZoom();
}

/** "Next": the following page, or a new empty one on the last page (not
    while presenting). */
export function goNext(editor: Editor, create = true) {
  const ids = editor.getPages().map((p) => p.id);
  const next = nextPage(ids, editor.getCurrentPageId());
  if (next !== "create") return go(editor, next.go);
  if (!create) return;
  const id = PageRecordType.createId();
  editor.markHistoryStoppingPoint("new page");
  editor.createPage({ id, name: freshName(editor) });
  go(editor, id);
}

export function goPrevious(editor: Editor) {
  const prev = previousPage(
    editor.getPages().map((p) => p.id),
    editor.getCurrentPageId(),
  );
  if (prev) go(editor, prev);
}

/** Present: the page fills the screen as a slide, no tools, read-only.
    →/Space/PageDown next, ←/PageUp previous, Escape stops. */
function startPresenting(editor: Editor) {
  editor.setCurrentTool("select");
  editor.selectNone();
  editor.updateInstanceState({ isFocusMode: true, isReadonly: true });
  editor.resetZoom();
  document.documentElement.requestFullscreen?.().catch(() => {});
}

function stopPresenting(editor: Editor) {
  editor.updateInstanceState({ isFocusMode: false, isReadonly: false });
  editor.resetZoom();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** A button press must not take the keys away from the whiteboard. */
const keepFocus = (e: ReactPointerEvent) => e.preventDefault();

/** Bottom-right: previous page, where you are, next page, and Present. */
export function PageArrows({ editor }: { editor: Editor }) {
  const [presenting, setPresenting] = useState(false);
  const { index, count, name } = useValue(
    "page position",
    () => {
      const pages = editor.getPages();
      const i = pages.findIndex((p) => p.id === editor.getCurrentPageId());
      return { index: i, count: pages.length, name: pages[i]?.name ?? "" };
    },
    [editor],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || editor.getEditingShapeId()) return;
      const keys = presenting
        ? { next: ["ArrowRight", "ArrowDown", "PageDown", " "], prev: ["ArrowLeft", "ArrowUp", "PageUp"] }
        : { next: ["PageDown"], prev: ["PageUp"] };
      let handled = true;
      if (keys.next.includes(e.key)) goNext(editor, !presenting);
      else if (keys.prev.includes(e.key)) goPrevious(editor);
      else if (presenting && e.key === "Escape") setPresenting(false);
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editor, presenting]);

  useEffect(() => {
    if (!presenting) return;
    startPresenting(editor);
    // Leaving full screen (the browser's own Escape) stops presenting too.
    const onFullscreen = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      stopPresenting(editor);
    };
  }, [editor, presenting]);

  const click = (fn: () => void) => () => {
    fn();
    editor.focus();
  };

  return (
    <div className="gauntlet-pages" data-presenting={presenting || undefined} aria-label="Pages" role="group">
      <button
        type="button"
        aria-label="Previous page"
        title="Previous page (PageUp)"
        disabled={index <= 0}
        onPointerDown={keepFocus}
        onClick={click(() => goPrevious(editor))}
      >
        ‹
      </button>
      <span className="gauntlet-pages__where" data-testid="page-position" title={name}>
        <span className="gauntlet-pages__name">{name}</span> {index + 1} / {count}
      </span>
      <button
        type="button"
        aria-label="Next page"
        title={index + 1 < count ? "Next page (PageDown)" : "Next page: makes a new one (PageDown)"}
        disabled={presenting && index + 1 >= count}
        onPointerDown={keepFocus}
        onClick={click(() => goNext(editor, !presenting))}
      >
        ›
      </button>
      <button
        type="button"
        className="gauntlet-pages__present"
        aria-label={presenting ? "Stop presenting" : "Present"}
        title={presenting ? "Stop presenting (Escape)" : "Present this page as a slide"}
        onPointerDown={keepFocus}
        onClick={click(() => setPresenting((p) => !p))}
      >
        {presenting ? "■" : "▶"}
      </button>
    </div>
  );
}
