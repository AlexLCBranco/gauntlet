import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { DefaultPageMenu, PageRecordType, useEditor, useValue, type Editor, type TLPageId } from "tldraw";

import { showPageStart } from "./keepFilled";
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
  showPageStart(editor);
}

/** "Next": the following page, or a new empty one on the last page when
    `create` (the › button and PageDown; never the → key). */
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

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Keys inside a menu, popover or dialog (e.g. the page list) are theirs. */
const inMenu = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('.tlui-popover__content, [role="menu"], [role="dialog"], [role="listbox"]');

/** A button press must not take the keys away from the whiteboard. */
const keepFocus = (e: ReactPointerEvent) => e.preventDefault();

const GAP = 8;

/** Keeps `ref` on the same row as tldraw's watermark, directly to its left
    and bottom-aligned with it, so it never covers it (the hobby license
    requires it visible). With no watermark, the CSS corner place. Also
    tells the page list where to open: just above (pages.css,
    --gauntlet-pages-right/-bottom on the container). */
function useBesideWatermark(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let last = "";
    const place = () => {
      const el = ref.current;
      const host = el?.offsetParent as HTMLElement | null | undefined;
      if (!el || !host) return;
      const r = document.querySelector(".tl-watermark_SEE-LICENSE")?.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const beside = !!r && r.width > 0 && r.height > 0;
      el.style.right = beside ? `${h.right - r.left + GAP}px` : "";
      el.style.bottom = beside ? `${h.bottom - r.bottom}px` : "";
      el.toggleAttribute("data-beside-watermark", beside);
      const g = el.getBoundingClientRect();
      const above = `${h.right - g.right}px ${h.bottom - g.top + 6}px`;
      if (above === last) return;
      last = above;
      host.style.setProperty("--gauntlet-pages-right", `${h.right - g.right}px`);
      host.style.setProperty("--gauntlet-pages-bottom", `${h.bottom - g.top + 6}px`);
    };
    place();
    // The watermark shows up a moment after the editor, and moves with the
    // window: a cheap check twice a second covers both.
    const timer = setInterval(place, 500);
    window.addEventListener("resize", place);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", place);
    };
  }, [ref]);
}

/** Bottom-right: ‹ previous page, "2 / 4" (opens the page list: jump to,
    rename, reorder, delete, add a page; tldraw's own page menu, moved here
    from the top left), › next page (a new one on the last page).
    Keys: ←/→ previous/next while nothing is selected and nothing is being
    edited (→ never makes a page); PageUp/PageDown as the arrows. */
export function PageArrows() {
  const editor = useEditor();
  const ref = useRef<HTMLDivElement>(null);
  useBesideWatermark(ref);
  const { index, count } = useValue(
    "page position",
    () => {
      const pages = editor.getPages();
      return { index: pages.findIndex((p) => p.id === editor.getCurrentPageId()), count: pages.length };
    },
    [editor],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || inMenu(e.target) || editor.getEditingShapeId()) return;
      const nothingSelected = !e.shiftKey && editor.getSelectedShapeIds().length === 0 && editor.isIn("select.idle");
      let handled = true;
      if (e.key === "PageDown") goNext(editor);
      else if (e.key === "PageUp") goPrevious(editor);
      else if (e.key === "ArrowRight" && nothingSelected) goNext(editor, false);
      else if (e.key === "ArrowLeft" && nothingSelected) goPrevious(editor);
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editor]);

  const click = (fn: () => void) => () => {
    fn();
    editor.focus();
  };

  return (
    <div ref={ref} className="gauntlet-pages" aria-label="Pages" role="group">
      <button
        type="button"
        aria-label="Previous page"
        title="Previous page (← or PageUp)"
        disabled={index <= 0}
        onPointerDown={keepFocus}
        onClick={click(() => goPrevious(editor))}
      >
        ‹
      </button>
      <span className="gauntlet-pages__where" data-testid="page-position">
        {index + 1} / {count}
        {/* tldraw's page menu; its button is laid invisibly over the
            position, so a click on "2 / 4" opens the page list. */}
        <DefaultPageMenu />
      </span>
      <button
        type="button"
        aria-label="Next page"
        title={index + 1 < count ? "Next page (→ or PageDown)" : "Next page: makes a new one (PageDown)"}
        onPointerDown={keepFocus}
        onClick={click(() => goNext(editor))}
      >
        ›
      </button>
    </div>
  );
}
