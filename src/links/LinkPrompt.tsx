import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditor, useValue, type Editor } from "tldraw";

import { kindOf, linkPrompt, setUrlOf, urlOf, type LinkTarget } from "./targets";
import { checkUrl } from "./url";
import "./links.css";

/**
 * The small field a link is typed or pasted into, on the whiteboard (as
 * Boardkit's and Linkkit's own, in the whiteboard's colours). Enter saves,
 * Escape cancels; a press anywhere outside saves what was typed when it is
 * a link, and otherwise just closes. Only http and https links are kept
 * (`checkUrl`); anything else is refused with a short reason, and the field
 * stays open to fix it. Keys typed here never reach the whiteboard.
 */
export function LinkPrompt() {
  const editor = useEditor();
  const open = useValue("link prompt", () => linkPrompt.get(), []);
  if (!open) return null;
  return <Field key={JSON.stringify(open.target)} editor={editor} target={open.target} at={open.at} />;
}

function Field({ editor, target, at }: { readonly editor: Editor; readonly target: LinkTarget; readonly at: { readonly x: number; readonly y: number } }) {
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(() => urlOf(editor, target) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setPlace({
      left: Math.max(8, Math.min(at.x, window.innerWidth - el.offsetWidth - 8)),
      top: Math.max(8, Math.min(at.y, window.innerHeight - el.offsetHeight - 8)),
    });
  }, [at.x, at.y]);

  const placed = place !== null;
  useEffect(() => {
    if (!placed) return;
    const focus = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    focus();
    // A menu that opened this may hand the focus back as it closes.
    const timer = window.setTimeout(() => {
      if (document.activeElement !== inputRef.current) focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [placed]);

  const close = () => linkPrompt.set(null);
  const save = (url: string) => {
    close();
    if (url !== urlOf(editor, target)) setUrlOf(editor, target, url);
  };

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      const check = checkUrl(latest.current);
      if (check.ok) save(check.url);
      else close();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  });

  const what = kindOf(editor, target);
  const name = target.kind === "shape" ? "" : target.name;
  const heading = `Link for ${what === "item" ? "this item" : what}${name ? ` “${name.length > 32 ? `${name.slice(0, 31)}…` : name}”` : ""}`;

  return (
    <form
      ref={rootRef}
      className="gk-link-prompt"
      role="dialog"
      aria-label={heading}
      data-testid="link-prompt"
      style={place ?? { left: 0, top: 0, visibility: "hidden" }}
      onSubmit={(e) => {
        e.preventDefault();
        const check = checkUrl(value);
        if (check.ok) save(check.url);
        else setError(check.reason);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        editor.markEventAsHandled(e);
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
      onKeyUp={(e) => {
        e.stopPropagation();
        editor.markEventAsHandled(e);
      }}
    >
      <p className="gk-link-prompt__heading">{heading}</p>
      <input
        ref={inputRef}
        className="gk-link-prompt__input"
        type="text"
        inputMode="url"
        spellCheck={false}
        autoComplete="off"
        placeholder="Paste or type a link"
        aria-label="Link"
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        // Pasting an address here is just text: never a web embed.
        onPaste={(e) => e.stopPropagation()}
      />
      {error ? (
        <p className="gk-link-prompt__error" role="alert">
          {error}
        </p>
      ) : (
        <p className="gk-link-prompt__hint">Enter to save · Esc to cancel</p>
      )}
    </form>
  );
}
