// Linkkit, the app (an npm git dependency pinned in package.json): the
// whiteboard draws and edits maps with Linkkit's own components. Every
// import from Linkkit goes through this file.
import "./linkkit.css";

export {
  WhiteboardMap,
  MapParts,
  onMapHistory,
  undoMap,
  redoMap,
  createLinkedWhiteboardMap,
  createWhiteboardMap,
  restoreWhiteboardMapRecord,
  unlinkWhiteboardMap,
  deleteEmptyWhiteboardMap,
  doubleClickOnWhiteboardMap,
  renameWhiteboardMap,
  linkedMapOf,
  linkedMaps,
  mapTakesEscape,
  whiteboardMaps,
  keyStoredElsewhere,
  onKeyChanged,
  onWroteHere,
  flushMap,
  type PageRect,
} from "linkkit/src/app/whiteboard";
