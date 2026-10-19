import { useState } from "react";
import {
  ArrowToolbarItem,
  AssetToolbarItem,
  DefaultHelperButtons,
  DefaultToolbar,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  RectangleToolbarItem,
  SelectToolbarItem,
  TextToolbarItem,
  Tldraw,
  ToolbarItem,
  type Editor,
  type TLCameraOptions,
  type TLComponents,
  type TLUiOverrides,
} from "tldraw";
import "tldraw/tldraw.css";

import { AddBoard } from "../boards/AddBoard";
import { BoardShapeUtil } from "../boards/BoardShape";
import { LassoOverlay } from "../lasso/LassoOverlay";
import { LassoTool } from "../lasso/LassoTool";
import { fillWindow, keepFilled } from "../pages/keepFilled";
import { keepInsideSheet } from "../pages/keepInside";
import { PageArrows } from "../pages/PageArrows";
import { SHEET } from "../pages/sheet";
import { SheetBackground } from "../pages/SheetBackground";
import { shapeUtils as styleShapeUtils } from "../style/shapeUtils";
import { applyNextMeta, StylePanel } from "../style/StylePanel";
import { DragOutline } from "./DragOutline";
import { MainMenu } from "./MainMenu";
import { undoSkipsSelection } from "./undoSkipsSelection";
import { ZoomUndo } from "./ZoomUndo";
import "./whiteboard.css";

/** tldraw keeps the whiteboard here (IndexedDB, per origin), and syncs it
    between open tabs. */
const PERSISTENCE_KEY = "gauntlet-whiteboard";
/** Set once the first-visit defaults (dark, wrap selection) are applied, so
    a choice changed later in the menu sticks. */
const DEFAULTS_KEY = "gauntlet:whiteboard:defaults";

const camera: Partial<TLCameraOptions> = {
  // Zoom steps are multiples of "100%", where the whole sheet fits the
  // window, centred, with dark bars where the window isn't 16:9 (see
  // fillZoom): you can zoom in, never out past it. At 100% nothing
  // scrolls; zoomed in, you pan only up to the sheet's edges.
  zoomSteps: [1, 1.5, 2, 3, 4, 6, 8],
  constraints: {
    bounds: SHEET,
    padding: { x: 0, y: 0 },
    origin: { x: 0.5, y: 0.5 },
    initialZoom: "fit-max",
    baseZoom: "fit-max",
    behavior: "contain",
  },
};

const lassoIcon = (
  <div>
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4.5 12.5C2.5 11 1.75 9 2.5 7c1.2-3.2 6-4.8 9.6-3.6 3.4 1.1 4.6 4 3 6.4-1.4 2.1-4.6 3-7.6 2.6" />
      <path d="M5.5 12.5c-.8 1.4-.6 2.9.8 3.5" strokeDasharray="1.6 1.8" />
    </svg>
  </div>
);

// Excalidraw's keys where they don't clash with tldraw's: 1–0 pick the
// tools in Excalidraw's order, D is the diamond and P the pen.
const overrides: TLUiOverrides = {
  tools(editor, tools) {
    tools.lasso = {
      id: "lasso",
      label: "tool.lasso" as never,
      icon: lassoIcon,
      kbd: "w",
      onSelect: () => editor.setCurrentTool("lasso"),
    };
    const keys: Record<string, string> = {
      select: "v,1",
      rectangle: "r,2",
      diamond: "d,3",
      ellipse: "o,4",
      arrow: "a,5",
      line: "l,6",
      draw: "p,7,b,x",
      text: "t,8",
      asset: "cmd+u,ctrl+u,9",
      eraser: "e,0",
    };
    for (const [id, kbd] of Object.entries(keys)) if (tools[id]) tools[id] = { ...tools[id], kbd };
    return tools;
  },
  // Shift+0 and the menu's "Reset zoom": back to 100%, the page filling
  // the window (tldraw's own toggles to its 100% when already there).
  actions(editor, actions) {
    if (actions["reset-zoom"]) actions["reset-zoom"] = { ...actions["reset-zoom"], onSelect: () => fillWindow(editor) };
    // Ctrl+Y redoes too, as in Excalidraw on Windows.
    if (actions.redo) actions.redo = { ...actions.redo, kbd: "cmd+shift+z,ctrl+shift+z,ctrl+y" };
    return actions;
  },
  translations: { en: { "tool.lasso": "Lasso select" } },
};

/** The toolbar along the top, as in Excalidraw, in Excalidraw's order. */
function TopToolbar() {
  return (
    <div className="gauntlet-top-toolbar">
      <DefaultToolbar maxItems={14}>
        <SelectToolbarItem />
        <ToolbarItem tool="lasso" />
        <HandToolbarItem />
        <RectangleToolbarItem />
        <DiamondToolbarItem />
        <EllipseToolbarItem />
        <ArrowToolbarItem />
        <LineToolbarItem />
        <DrawToolbarItem />
        <TextToolbarItem />
        <AssetToolbarItem />
        <EraserToolbarItem />
        <NoteToolbarItem />
        <FrameToolbarItem />
        <HighlightToolbarItem />
        <LaserToolbarItem />
      </DefaultToolbar>
      <AddBoard />
    </div>
  );
}

/** tldraw's shapes with our extra styles (`src/style/`), and Boardkit boards
    as whiteboard objects (`src/boards/`). */
const shapeUtils = [...styleShapeUtils, BoardShapeUtil];

/** Under the main menu (top left): the style panel, as in Excalidraw. */
function UnderMenu() {
  return (
    <>
      <StylePanel />
      <DefaultHelperButtons />
    </>
  );
}

function InFront() {
  return (
    <>
      <LassoOverlay />
      <DragOutline />
    </>
  );
}

/** Excalidraw's layout: main menu top left with the style panel under it,
    tools top centre, zoom and undo/redo bottom left, page arrows bottom
    right (PageArrows). */
const components: TLComponents = {
  MainMenu,
  QuickActions: null,
  ActionsMenu: null,
  StylePanel: null,
  HelperButtons: UnderMenu,
  Toolbar: null,
  TopPanel: TopToolbar,
  NavigationPanel: ZoomUndo,
  HelpMenu: null,
  Background: SheetBackground,
  InFrontOfTheCanvas: InFront,
};

function setUp(editor: Editor) {
  try {
    if (!localStorage.getItem(DEFAULTS_KEY)) {
      // Dark by default (owner's rule). Box select picks only what is
      // wholly inside the box, as in Excalidraw.
      editor.user.updateUserPreferences({ colorScheme: "dark", isWrapMode: true });
      localStorage.setItem(DEFAULTS_KEY, "1");
    }
  } catch {
    editor.user.updateUserPreferences({ colorScheme: "dark", isWrapMode: true });
  }
  // For the e2e tests (and the console).
  (window as unknown as { editor: Editor }).editor = editor;
  // A saved camera (from before a resize, or from a tab) may sit outside
  // the sheet's limits: start with the whole sheet in view.
  fillWindow(editor);
  const stopInside = keepInsideSheet(editor);
  const stopNext = applyNextMeta(editor);
  const stopFilled = keepFilled(editor);
  const stopUndo = undoSkipsSelection(editor);
  return () => {
    stopUndo();
    stopInside();
    stopNext();
    stopFilled();
  };
}

export function Whiteboard() {
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <div className="gauntlet-whiteboard">
      <Tldraw
        persistenceKey={PERSISTENCE_KEY}
        licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY || undefined}
        shapeUtils={shapeUtils}
        tools={[LassoTool]}
        overrides={overrides}
        components={components}
        cameraOptions={camera}
        // tldraw's own "1–9 press the nth toolbar button" would override
        // the Excalidraw number keys above.
        options={{ enableToolbarKeyboardShortcuts: false }}
        onMount={(e) => {
          const stop = setUp(e);
          setEditor(e);
          return stop;
        }}
      />
      {editor && <PageArrows editor={editor} />}
    </div>
  );
}
