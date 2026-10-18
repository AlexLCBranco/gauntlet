import { useState } from "react";
import {
  ArrowToolbarItem,
  AssetToolbarItem,
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

import { LassoOverlay } from "../lasso/LassoOverlay";
import { LassoTool } from "../lasso/LassoTool";
import { keepInsideSheet } from "../pages/keepInside";
import { PageArrows } from "../pages/PageArrows";
import { SHEET } from "../pages/sheet";
import { SheetBackground } from "../pages/SheetBackground";
import "./whiteboard.css";

/** tldraw keeps the whiteboard here (IndexedDB, per origin), and syncs it
    between open tabs. */
const PERSISTENCE_KEY = "gauntlet-whiteboard";
/** Set once the first-visit defaults (dark, wrap selection) are applied, so
    a choice changed later in the menu sticks. */
const DEFAULTS_KEY = "gauntlet:whiteboard:defaults";

const camera: Partial<TLCameraOptions> = {
  // Zoom steps are multiples of "the whole sheet fits": you can zoom in,
  // never out past the sheet.
  zoomSteps: [1, 1.5, 2, 3, 4, 6, 8],
  constraints: {
    bounds: SHEET,
    padding: { x: 24, y: 24 },
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
    </div>
  );
}

const components: TLComponents = {
  Toolbar: null,
  TopPanel: TopToolbar,
  Background: SheetBackground,
  InFrontOfTheCanvas: LassoOverlay,
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
  editor.resetZoom();
  return keepInsideSheet(editor);
}

export function Whiteboard() {
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <div className="gauntlet-whiteboard">
      <Tldraw
        persistenceKey={PERSISTENCE_KEY}
        licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY || undefined}
        tools={[LassoTool]}
        overrides={overrides}
        components={components}
        cameraOptions={camera}
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
