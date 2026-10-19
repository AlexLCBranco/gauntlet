import { createRoot } from "react-dom/client";

import { startAutoBackup } from "./auto";
import { BackupPage } from "./BackupPage";
import "./backup.css";

startAutoBackup();
createRoot(document.getElementById("root")!).render(<BackupPage />);
