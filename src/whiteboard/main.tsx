import { createRoot } from "react-dom/client";

import { startAutoBackup } from "../backup/auto";
import { Whiteboard } from "./Whiteboard";

startAutoBackup();
createRoot(document.getElementById("root")!).render(<Whiteboard />);
