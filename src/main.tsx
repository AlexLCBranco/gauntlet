import { createRoot } from "react-dom/client";

import { startAutoBackup } from "./backup/auto";
import { Canvas } from "./canvas/Canvas";
import "./index.css";

startAutoBackup();
createRoot(document.getElementById("root")!).render(<Canvas />);
