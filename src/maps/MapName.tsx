import { useEffect, useRef } from "react";
import { atom, useEditor, useValue, type TLShapeId } from "tldraw";

import { pageUndo } from "../whiteboard/pageUndo";
import { renameWhiteboardMap } from "./linkkit";
import { mapListChanged, useMapList } from "./mapList";

/** The map widget whose name is being typed, just after "New map". */
export const namingMap = atom<TLShapeId | null>("map being named", null);

/** The map's name in Linkkit's list, kept current, over the map (shown on
    hover or while selected, as a board's). Just after "New map" it is a
    field, ready to type. */
export function MapName({ shapeId, mapId, shown }: { shapeId: TLShapeId; mapId: string; shown: boolean }) {
  const naming = useValue("naming this map", () => namingMap.get() === shapeId, [shapeId]);
  const name = useMapList().find((m) => m.id === mapId)?.name;
  if (naming && name) return <NameField shapeId={shapeId} mapId={mapId} name={name} shown={shown} />;
  return name ? <div className="gm-name">{name}</div> : null;
}

/**
 * The name, selected so typing replaces it. Enter or a press anywhere else
 * keeps what was typed; Escape, or nothing typed, leaves the name as it was.
 * Keys typed here are the field's, never the whiteboard's shortcuts.
 */
function NameField({ shapeId, mapId, name, shown }: { shapeId: TLShapeId; mapId: string; name: string; shown: boolean }) {
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
        renameWhiteboardMap(mapId, typed);
        mapListChanged();
      }
      if (namingMap.get() === shapeId) namingMap.set(null);
      // Keys go back to the whiteboard (the map stays selected).
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
      // takes the new map off the page. Once typed, it undoes the typing.
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && el.value === name) {
        e.preventDefault();
        finish(false);
        pageUndo(editor);
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
      if (!done.current && namingMap.get() === shapeId) namingMap.set(null);
    };
  }, [editor, shapeId, mapId, name]);

  // A map is hidden until its size is known: focus once it shows.
  useEffect(() => {
    const el = input.current;
    if (!shown || !el || done.current) return;
    el.focus({ preventScroll: true });
    el.select();
  }, [shown]);

  return (
    <input
      ref={input}
      className="gm-name gm-name-field"
      aria-label="Map name"
      data-testid="map-name-field"
      defaultValue={name}
      spellCheck={false}
      onPointerDown={(e) => editor.markEventAsHandled(e)}
    />
  );
}
