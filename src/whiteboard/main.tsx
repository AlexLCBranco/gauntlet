import { createRoot } from "react-dom/client";

import { startAutoBackup } from "../backup/auto";
import { dropOldCanvasKeys } from "./oldCanvasKeys";
import { Whiteboard } from "./Whiteboard";

dropOldCanvasKeys();
startAutoBackup();
createRoot(document.getElementById("root")!).render(<Whiteboard />);
