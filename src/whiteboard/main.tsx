import { createRoot } from "react-dom/client";

import { startAutoBackup } from "../backup/auto";
import { watchChanges } from "../backup/save";
import { dropOldCanvasKeys } from "./oldCanvasKeys";
import { Whiteboard } from "./Whiteboard";

dropOldCanvasKeys();
// No folder banner here: the save status (bottom right) says it.
startAutoBackup({ banners: false });
// One save to the folder a few seconds after any change; Ctrl+S (src/backup/save.ts).
watchChanges();
createRoot(document.getElementById("root")!).render(<Whiteboard />);
