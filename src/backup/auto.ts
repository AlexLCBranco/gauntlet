/**
 * Automatic backups: on opening a page of this site (the home page, the
 * whiteboard, the Backups page) and every 10 minutes while it stays open,
 * a backup is made if anything changed since the newest one.
 */
import { backUp } from "./store";

export const EVERY_MS = 10 * 60 * 1000;
/** Lets the page's own apps load (and save their first-visit data) first. */
const FIRST_AFTER_MS = 3000;

let started = false;

export function startAutoBackup(): void {
  if (started || typeof indexedDB === "undefined") return;
  started = true;
  const run = () => {
    backUp("auto").catch((err) => console.error("Gauntlet: the automatic backup failed", err));
  };
  setTimeout(run, FIRST_AFTER_MS);
  setInterval(run, EVERY_MS);
}
