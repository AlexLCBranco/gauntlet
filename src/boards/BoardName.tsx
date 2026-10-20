import { useEffect, useRef } from "react";
import { atom, useEditor, useValue, type TLShapeId } from "tldraw";

import { renameWhiteboardBoard } from "./boardkit";
import { registryBoards, registryChanged, useRegistry } from "./registry";

/** The board widget whose name is being typed, just after "New board". */
export const namingBoard = atom<TLShapeId | null>("board being named", null);

/** The board's name in Boardkit's list, kept current. Just after "New
    board" it is a field, ready to type. */
export function BoardName({ shapeId, boardId, shown }: { shapeId: TLShapeId; boardId: string; shown: boolean }) {
  const naming = useValue("naming this board", () => namingBoard.get() === shapeId, [shapeId]);
  const name = registryBoards(useRegistry()).find((b) => b.id === boardId)?.name;
  if (naming && name) return <NameField shapeId={shapeId} boardId={boardId} name={name} shown={shown} />;
  return name ? <div className="gb-name">{name}</div> : null;
}

/**
 * The name, selected so typing replaces it. Enter or a press anywhere else
 * keeps what was typed; Escape, or nothing typed, leaves the name as it was.
 * Keys typed here are the field's, never the whiteboard's shortcuts.
 */
function NameField({ shapeId, boardId, name, shown }: { shapeId: TLShapeId; boardId: string; name: string; shown: boolean }) {
  const editor = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const finish = (keep: boolean) => {
      if (done.current) return;
      done.current = true;
      const typed = el.value.trim();
      if (keep && typed && typed !== name) {
        renameWhiteboardBoard(boardId as Parameters<typeof renameWhiteboardBoard>[0], typed);
        registryChanged();
      }
      if (namingBoard.get() === shapeId) namingBoard.set(null);
      // Keys go back to the whiteboard (the board stays selected).
      if (document.activeElement === el) editor.getContainer().focus({ preventScroll: true });
    };
    // tldraw reads keys on its container, before React: stopped here.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      editor.markEventAsHandled(e);
      if (e.type !== "keydown" || e.isComposing) return;
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
      // Nothing typed yet: Ctrl+Z is the whiteboard's, so one Ctrl+Z still
      // takes the new board off the page. Once typed, it undoes the typing.
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && el.value === name) {
        e.preventDefault();
        finish(false);
        editor.undo();
      }
    };
    const onPressElsewhere = (e: PointerEvent) => {
      if (e.target !== el) finish(true);
    };
    const onBlur = () => finish(true);
    el.addEventListener("keydown", onKey);
    el.addEventListener("keyup", onKey);
    el.addEventListener("blur", onBlur);
    window.addEventListener("pointerdown", onPressElsewhere, true);
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("keyup", onKey);
      el.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerdown", onPressElsewhere, true);
      // Gone (undone, deleted) while being named: nothing is renamed.
      if (!done.current && namingBoard.get() === shapeId) namingBoard.set(null);
    };
  }, [editor, shapeId, boardId, name]);

  // A board is hidden until its size is known: focus once it shows.
  useEffect(() => {
    const el = input.current;
    if (!shown || !el || done.current) return;
    el.focus({ preventScroll: true });
    el.select();
  }, [shown]);

  return (
    <input
      ref={input}
      className="gb-name gb-name-field"
      aria-label="Board name"
      data-testid="board-name-field"
      defaultValue={name}
      spellCheck={false}
      onPointerDown={(e) => editor.markEventAsHandled(e)}
    />
  );
}
