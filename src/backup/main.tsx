import { createRoot } from "react-dom/client";

import "../index.css";
import { startAutoBackup } from "./auto";
import { BackupsPage } from "./BackupsPage";

startAutoBackup();
createRoot(document.getElementById("root")!).render(<BackupsPage />);
