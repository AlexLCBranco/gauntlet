import { useCallback, useLayoutEffect, useRef } from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  resizeBox,
  useEditor,
  useIsEditing,
  useValue,
  type RecordProps,
  type TLResizeInfo,
  type TLShape,
} from "tldraw";

import { fitBoard } from "../boards/fit";
import { pageBox } from "../pages/keepFilled";
import { insideDelta } from "../pages/sheet";
import type { PageRect } from "./linkkit";
import { MapName } from "./MapName";
import { useEditedMap } from "./mapEditing";
import { MapView, type MapShift } from "./MapView";
import "./maps.css";

export const MAP_TYPE = "linkkit-map";

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [MAP_TYPE]: {
      /** The Linkkit map shown (its `linkkit:map:<id>` record). */
      mapId: string;
      /** The box on the page: natural size x `scale` (boards/fit.ts). */
      w: number;
      h: number;
      /** How much the map is scaled; 0 until first drawn. */
      scale: number;
      /** Where on Linkkit's page the part shown starts (its boxes' top-left
          corner, less a margin), less the map's shift (MapView.tsx), as
          last drawn: when the boxes reach further left or up, the widget
          grows that way and its content stays where it is on the
          whiteboard. Both -1 until first drawn. */
      cropX: number;
      cropY: number;
    };
  }
}

export type MapShape = TLShape<typeof MAP_TYPE>;

/**
 * A Linkkit map as a whiteboard object: a "live screenshot", as a board is
 * (owner, 2026-10-21). It sits on the page like a picture (select, move,
 * drag a corner to scale it, the whole map with it) and shows the real map,
 * kept current: just the part of Linkkit's page its boxes cover, never
 * scrolled or zoomed inside. Double-click it (or Enter) to edit it in
 * place; Escape or a click outside ends that. The map's data stays in
 * Linkkit's record.
 */
export class MapShapeUtil extends BaseBoxShapeUtil<MapShape> {
  static override type = MAP_TYPE;
  static override props: RecordProps<MapShape> = {
    mapId: T.string,
    w: T.number,
    h: T.number,
    scale: T.number,
    cropX: T.number,
    cropY: T.number,
  };

  override getDefaultProps(): MapShape["props"] {
    return { mapId: "", w: 320, h: 200, scale: 0, cropX: -1, cropY: -1 };
  }
  override canEdit() {
    return true;
  }
  override isAspectRatioLocked() {
    return true;
  }
  override onResize(shape: MapShape, info: TLResizeInfo<MapShape>) {
    const next = resizeBox(shape, info);
    const from = info.initialShape.props;
    return { ...next, props: { ...next.props, scale: (from.scale || 1) * (next.props.w / from.w) } };
  }
  override component(shape: MapShape) {
    return <MapShapeComponent shape={shape} />;
  }
  override getIndicatorPath(shape: MapShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

function MapShapeComponent({ shape }: { shape: MapShape }) {
  const editor = useEditor();
  const editing = useIsEditing(shape.id);
  const active = useValue(
    "map active",
    () => editor.getSelectedShapeIds().includes(shape.id) || editor.getHoveredShapeId() === shape.id,
    [editor, shape.id],
  );
  const content = useRef<HTMLDivElement>(null);
  const { mapId, scale } = shape.props;

  // Keep the box the size of the content (boards/fit.ts). Not an undo step.
  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const measure = () => {
      const current = editor.getShape<MapShape>(shape.id);
      if (!current || el.offsetWidth === 0) return;
      const fit = fitBoard({ w: el.offsetWidth, h: el.offsetHeight }, current.props.scale, pageBox.get() ?? { w: Infinity, h: Infinity });
      const p = current.props;
      if (Math.abs(fit.w - p.w) < 0.5 && Math.abs(fit.h - p.h) < 0.5 && fit.scale === p.scale) return;
      // Placed new: grow from the middle, where it was put, inside the page.
      let move = {};
      if (p.scale === 0) {
        const at = { x: current.x + (p.w - fit.w) / 2, y: current.y + (p.h - fit.h) / 2 };
        const page = pageBox.get();
        const d = page ? insideDelta({ ...at, w: fit.w, h: fit.h }, page) : { x: 0, y: 0 };
        move = { x: at.x + d.x, y: at.y + d.y };
      }
      editor.run(() => editor.updateShape<MapShape>({ id: shape.id, type: MAP_TYPE, ...move, props: fit }), { history: "ignore" });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, shape.id]);

  // The part of Linkkit's page shown moved its top-left corner (a box
  // further left or up, or the left-most one moved in): the widget moves by
  // as much, so the boxes stay where they are on the whiteboard. Where
  // Linkkit moved every box (its shift, for a box past its page's corner),
  // the boxes stayed where they were: that part is left out.
  const onContent = useCallback(
    (box: PageRect, shift: MapShift) => {
      const current = editor.getShape<MapShape>(shape.id);
      if (!current) return;
      const p = current.props;
      const left = box.left - shift.x;
      const top = box.top - shift.y;
      if (left === p.cropX && top === p.cropY) return;
      const s = p.scale || 1;
      const move = p.cropX === -1 && p.cropY === -1 ? {} : { x: current.x + (left - p.cropX) * s, y: current.y + (top - p.cropY) * s };
      editor.run(() => editor.updateShape<MapShape>({ id: shape.id, type: MAP_TYPE, ...move, props: { cropX: left, cropY: top } }), {
        history: "ignore",
      });
    },
    [editor, shape.id],
  );
  // While edited, the whole page is the map's (mapEditing.tsx).
  useEditedMap(editing ? { shapeId: shape.id, mapId } : null);

  return (
    <HTMLContainer id={shape.id} style={{ pointerEvents: editing ? "all" : "none", overflow: "visible" }}>
      <div
        ref={content}
        className="gm-scaled"
        data-active={active || editing ? "" : undefined}
        data-editing={editing ? "" : undefined}
        style={{ transform: `scale(${scale || 1})`, visibility: scale ? "visible" : "hidden" }}
      >
        <MapName shapeId={shape.id} mapId={mapId} shown={scale > 0} />
        <MapView mapId={mapId} editing={editing} onContent={onContent} />
      </div>
    </HTMLContainer>
  );
}
