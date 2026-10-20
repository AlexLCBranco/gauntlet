import { useEffect, useState } from "react";
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

import { BoardPicker, boardToolItem } from "../boards/AddBoard";
import { BoardShapeUtil } from "../boards/BoardShape";
import { BoardkitParts } from "../boards/BoardkitParts";
import { LassoOverlay } from "../lasso/LassoOverlay";
import { LassoTool } from "../lasso/LassoTool";
import { edgeWall } from "../pages/edgeWall";
import { keepFilled, showPageStart, zoomTo100 } from "../pages/keepFilled";
import { keepInsideSheet } from "../pages/keepInside";
import { PageArrows } from "../pages/PageArrows";
import { rememberPage } from "../pages/rememberPage";
import { SHEET } from "../pages/sheet";
import { SheetBackground } from "../pages/SheetBackground";
import { shapeUtils as styleShapeUtils } from "../style/shapeUtils";
import { applyNextMeta, StylePanel } from "../style/StylePanel";
import { DragOutline } from "./DragOutline";
import { MainMenu } from "./MainMenu";
import { toolbarItems } from "./toolbarFit";
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
  // As in Excalidraw: 100% is one page unit per screen pixel. The page is
  // at least the window's size and as big as what's on it (pageForWindow;
  // its bounds and the zoom steps are set by sizePage, SHEET is only the
  // start). You pan only within the page, and zoom out only while it still
  // covers the window, so there are never bars.
  zoomSteps: [1, 1.5, 2, 3, 4, 6, 8],
  constraints: {
    bounds: SHEET,
    padding: { x: 0, y: 0 },
    origin: { x: 0.5, y: 0.5 },
    initialZoom: "default",
    baseZoom: "default",
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
    tools.board = boardToolItem();
    return tools;
  },
  // Shift+0 and the menu's "Reset zoom": back to 100% (tldraw's own
  // toggles to its fit when already there).
  actions(editor, actions) {
    if (actions["reset-zoom"]) actions["reset-zoom"] = { ...actions["reset-zoom"], onSelect: () => zoomTo100(editor) };
    // Ctrl+Y redoes too, as in Excalidraw on Windows.
    if (actions.redo) actions.redo = { ...actions.redo, kbd: "cmd+shift+z,ctrl+shift+z,ctrl+y" };
    return actions;
  },
  translations: { en: { "tool.lasso": "Lasso select", "tool.board": "Board" } },
};

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

/** The toolbar along the top, as in Excalidraw, in Excalidraw's order, then
    the Board button (`src/boards/`). */
function TopToolbar() {
  const width = useWindowWidth();
  return (
    <div className="gauntlet-top-toolbar">
      <DefaultToolbar maxItems={toolbarItems(width)}>
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
        <ToolbarItem tool="board" />
        <HighlightToolbarItem />
        <LaserToolbarItem />
      </DefaultToolbar>
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
      <BoardPicker />
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
  // The page this tab was on before a reload.
  const stopPage = rememberPage(editor);
  // Size the page to the window (and what's on it); open it at 100%, top
  // left. A saved camera (from another window size) may sit outside it.
  showPageStart(editor);
  const stopInside = keepInsideSheet(editor);
  const stopWall = edgeWall(editor);
  const stopNext = applyNextMeta(editor);
  const stopFilled = keepFilled(editor);
  const stopUndo = undoSkipsSelection(editor);
  return () => {
    stopUndo();
    stopPage();
    stopInside();
    stopWall();
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
      <BoardkitParts />
    </div>
  );
}
