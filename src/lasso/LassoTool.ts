import { atom, StateNode, type Editor, type TLShape, type TLShapeId } from "tldraw";

import { enclosedBy, type Point } from "./loop";

/** The loop being drawn, in page space (empty when none); drawn by
    `LassoOverlay`. */
export const lassoLoop = atom<Point[]>("lasso loop", []);

/** The shapes the lasso `loop` encloses, as the select tool would pick
    them: a shape inside a group selects the group (only when the whole
    group is inside), locked shapes are skipped, and a shape whose parent is
    also picked is left to the parent. */
export function shapesInLasso(editor: Editor, loop: readonly Point[]): TLShapeId[] {
  const outline = (shape: TLShape) => {
    const geometry = editor.getShapeGeometry(shape);
    const points = editor.getShapePageTransform(shape).applyToPoints(geometry.vertices);
    return enclosedBy(points, geometry.isClosed, loop);
  };
  const leaves = (shape: TLShape): TLShape[] =>
    editor.isShapeOfType(shape, "group")
      ? editor.getSortedChildIdsForParent(shape.id).flatMap((id) => leaves(editor.getShape(id)!))
      : [shape];

  const picked = new Set<TLShapeId>();
  const tried = new Set<TLShapeId>();
  for (const shape of editor.getCurrentPageShapesSorted()) {
    if (editor.isShapeOfType(shape, "group")) continue;
    if (!editor.options.selectLockedShapes && editor.isShapeOrAncestorLocked(shape)) continue;
    const target = editor.getOutermostSelectableShape(shape);
    if (tried.has(target.id)) continue;
    tried.add(target.id);
    if (leaves(target).every(outline)) picked.add(target.id);
  }
  return [...picked].filter((id) => !editor.findShapeAncestor(id, (a) => picked.has(a.id)));
}

class Idle extends StateNode {
  static override id = "idle";
  override onEnter() {
    this.editor.setCursor({ type: "cross", rotation: 0 });
  }
  override onPointerDown() {
    this.parent.transition("lassoing");
  }
  override onCancel() {
    this.editor.setCurrentTool("select");
  }
}

class Lassoing extends StateNode {
  static override id = "lassoing";
  /** The selection when the loop started (Escape puts it back). */
  private startSelection: TLShapeId[] = [];
  /** What the loop adds to: the selection with Shift, else nothing. */
  private base: TLShapeId[] = [];
  private loop: Point[] = [];

  override onEnter() {
    const { editor } = this;
    this.startSelection = editor.getSelectedShapeIds();
    this.base = editor.inputs.getShiftKey() ? this.startSelection : [];
    const p = editor.inputs.getOriginPagePoint();
    this.loop = [{ x: p.x, y: p.y }];
    lassoLoop.set(this.loop);
  }
  override onExit() {
    lassoLoop.set([]);
  }
  override onPointerMove() {
    const p = this.editor.inputs.getCurrentPagePoint();
    const last = this.loop[this.loop.length - 1];
    // Skip points closer than 2 screen pixels: a smooth loop, fewer tests.
    if (Math.hypot(p.x - last.x, p.y - last.y) * this.editor.getZoomLevel() < 2) return;
    this.loop = [...this.loop, { x: p.x, y: p.y }];
    lassoLoop.set(this.loop);
    this.select();
  }
  override onPointerUp() {
    this.select();
    // Like any tool after one use: back to Select, with the pick ready to
    // move. Nothing picked: stay on the lasso for another try.
    if (this.editor.getSelectedShapeIds().length > 0) this.editor.setCurrentTool("select");
    else this.parent.transition("idle");
  }
  override onCancel() {
    this.editor.setSelectedShapes(this.startSelection);
    this.parent.transition("idle");
  }
  override onComplete() {
    this.onPointerUp();
  }
  private select() {
    const ids = new Set([...this.base, ...shapesInLasso(this.editor, this.loop)]);
    this.editor.setSelectedShapes([...ids]);
  }
}

/** Lasso selection: draw a free loop; everything wholly inside is selected.
    Shift adds to the current selection. Escape cancels. */
export class LassoTool extends StateNode {
  static override id = "lasso";
  static override initial = "idle";
  static override children() {
    return [Idle, Lassoing];
  }
}
