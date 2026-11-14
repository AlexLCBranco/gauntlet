import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { atom, createShapeId, useEditor, useValue, type Editor, type TLUiToolItem } from "tldraw";
import { placingLive } from "../widgets/copies";

import { pageBox } from "../pages/keepFilled";
import { insideDelta, SHEET } from "../pages/sheet";
import { BoardBadge } from "../boards/mapLink";
import { useLinkedMaps } from "./linkedMap";
import { createWhiteboardMap } from "./linkkit";
import { mapListChanged, useMapList } from "./mapList";
import { MAP_TYPE, type MapShape } from "./MapShape";
import { namingMap } from "./MapName";

const mapIcon = (
  <div>
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="1.75" y="2.5" width="6" height="4" rx="1" />
      <rect x="10.25" y="11.5" width="6" height="4" rx="1" />
      <path d="M4.75 6.5v4.5a2 2 0 0 0 2 2h3.5" strokeLinecap="round" />
    </svg>
  </div>
);

/** Whether the map list is open. */
const pickerOpen = atom("map picker open", false);
/** A new map could not be stored: the list opens to say so. */
const newFailed = atom("new map failed", false);

/** The main menu's "Add existing map…": the list of maps, under the
    toolbar's Map button. */
export function openMapPicker() {
  newFailed.set(false);
  pickerOpen.set(true);
}

/** A new, empty map on the current page (newMap); when it can't be
    stored, the list opens with the reason. */
function addNewMap(editor: Editor) {
  pickerOpen.set(false);
  if (!newMap(editor)) {
    newFailed.set(true);
    pickerOpen.set(true);
  }
}

/** The toolbar's "Map" button, next to "Board": a click puts a new, empty
    Linkkit map on the current page (owner, 2026-10-22). An existing map is
    added from the main menu (openMapPicker). Wired in the whiteboard's
    `overrides.tools`. */
export function mapToolItem(editor: Editor): TLUiToolItem {
  return {
    id: "map",
    label: "tool.map" as never,
    icon: mapIcon,
    onSelect: () => addNewMap(editor),
  };
}

/** The button, on the toolbar or in its overflow menu. */
const BUTTON = '[data-testid="tools.map"], [data-testid="tools.more.map"]';

/** The list of Linkkit's maps, under the Map button, in the Board picker's style.
    A click puts that map on the current page, in the middle of the view,
    selected. "+ New map" first makes a new one in Linkkit (newMap). */
export function MapPicker() {
  const editor = useEditor();
  const open = useValue(pickerOpen);
  const maps = useMapList();
  const linked = new Set(Object.values(useLinkedMaps()));
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const failed = useValue(newFailed);

  useLayoutEffect(() => {
    if (!open) return;
    // The button on show (tldraw keeps hidden copies for measuring), else
    // the toolbar; kept inside the window.
    const shown = [...document.querySelectorAll(BUTTON), document.querySelector(".gauntlet-top-toolbar")]
      .map((el) => el?.getBoundingClientRect())
      .find((r) => r && r.width > 0);
    const half = 120;
    const left = shown ? shown.left + shown.width / 2 : window.innerWidth / 2;
    setAt({ left: Math.min(Math.max(left, half + 8), window.innerWidth - half - 8), top: shown ? shown.bottom + 6 : 60 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Element;
      // A click on the button keeps it open.
      if (!box.current?.contains(t) && !t.closest?.(BUTTON)) pickerOpen.set(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && pickerOpen.set(false);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  if (!open || !at) return null;
  return (
    <div className="gb-picker" role="menu" data-testid="map-picker" ref={box} style={at}>
      <button role="menuitem" data-testid="new-map" className="gb-picker-new" onClick={() => addNewMap(editor)}>
        + New map
      </button>
      {failed && <div className="gb-picker-empty">The map could not be saved: this browser's storage is full.</div>}
      <div className="gb-picker-title">Linkkit maps</div>
      {maps.length === 0 && <div className="gb-picker-empty">No maps yet.</div>}
      {maps.map((m) => (
        <button key={m.id} role="menuitem" data-map={m.id} onClick={() => place(editor, m.id, "add map")}>
          {m.name}
          {linked.has(m.id) && <BoardBadge />}
        </button>
      ))}
    </div>
  );
}

/**
 * "+ New map": a new, empty Linkkit map made by Linkkit's own code (named
 * as Linkkit's own "New map" names one, stored so /linkkit lists it),
 * placed in the middle of the view, inside the page, selected, with its
 * name ready to type (MapName). One Ctrl+Z takes it off the whiteboard;
 * still empty, the map leaves Linkkit too (emptyNewMaps.ts). Returns false
 * when Linkkit could not store it.
 */
export function newMap(editor: Editor, corner?: { x: number; y: number }): boolean {
  const made = createWhiteboardMap();
  if (!made) return false;
  mapListChanged();
  namingMap.set(placeMap(editor, made.id, "new map", { newMap: made.name }, corner));
  return true;
}

const place = (editor: Editor, mapId: string, step: string) => placeMap(editor, mapId, step);

/** One undo step: the widget for `mapId` in the middle of the view (or its
    top-left corner at `corner`: the widget picker), kept inside the page
    (placed there at once, so keepInside has nothing to move), selected. */
export function placeMap(editor: Editor, mapId: string, step: string, meta: Record<string, string> = {}, corner?: { x: number; y: number }) {
  const { w, h } = editor.getShapeUtil<MapShape>(MAP_TYPE).getDefaultProps();
  const view = editor.getViewportPageBounds();
  if (corner) {
    const at = { x: corner.x, y: corner.y, w, h };
    const d = insideDelta({ ...at, w: 1, h: 1 }, pageBox.get() ?? SHEET);
    const id = createShapeId();
    editor.markHistoryStoppingPoint(step);
    // The live map itself, even if another widget shows it (copies.ts).
    placingLive(() => editor.createShape<MapShape>({ id, type: MAP_TYPE, x: at.x + d.x, y: at.y + d.y, props: { mapId }, meta: { ...meta, corner: Date.now() } }));
    editor.setCurrentTool("select");
    editor.select(id);
    pickerOpen.set(false);
    // A map is drawn where its boxes are (its crop), not at its corner: once
    // its layout has settled, its drawn box is moved onto the cursor (not an
    // undo step: part of placing it).
    const target = { x: at.x + d.x, y: at.y + d.y };
    const align = () => {
      const b = editor.getShapePageBounds(id);
      const s = editor.getShape<MapShape>(id);
      if (!b || !s || Math.abs(b.x - target.x) < 0.5 && Math.abs(b.y - target.y) < 0.5) return;
      editor.run(() => editor.updateShape<MapShape>({ id, type: MAP_TYPE, x: s.x + target.x - b.x, y: s.y + target.y - b.y }), { history: "ignore" });
    };
    for (const ms of [150, 600, 1500]) setTimeout(align, ms);
    return id;
  }
  const at = { x: view.midX - w / 2, y: view.midY - h / 2, w, h };
  const d = insideDelta(at, pageBox.get() ?? SHEET);
  const id = createShapeId();
  editor.markHistoryStoppingPoint(step);
  placingLive(() => editor.createShape<MapShape>({ id, type: MAP_TYPE, x: at.x + d.x, y: at.y + d.y, props: { mapId }, meta }));
  editor.setCurrentTool("select");
  editor.select(id);
  pickerOpen.set(false);
  return id;
}
