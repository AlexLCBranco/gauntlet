// Boardkit, the app (an npm git dependency pinned in package.json): the
// whiteboard draws and edits boards with Boardkit's own components. Every
// import from Boardkit goes through this file.
import "./boardkit.css";

export { WhiteboardBoard, createWhiteboardBoard, deleteEmptyWhiteboardBoard, renameWhiteboardBoard, flushBoard, useSelectionStore, useThemeStore, IconSprite, Toaster, SaveFailedBanner, onBoardHistory, undoBoard, redoBoard, keyStoredElsewhere, onWroteHere, setWhiteboardItemUrl, whiteboardItemUrl, useWhiteboardBoardUrl, type WhiteboardLinkTarget } from "boardkit/src/app/whiteboard";
