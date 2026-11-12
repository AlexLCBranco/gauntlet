import { defineConfig } from "@playwright/test";

/**
 * The save measured on a REAL disk folder (e2e/disk-save.manual.ts), not
 * the browser's private one the tests use. Not part of any test run:
 *
 *   node scripts/local-e2e.mjs gauntlet "-c playwright.disk.config.ts"
 *
 * It is the one script that can't run headless: picking a real folder
 * goes through Windows' folder dialog and the browser's own confirmation,
 * which only a visible browser shows (scripts/pick-folder.ps1 answers
 * them). The window opens small, for about two minutes, and is closed.
 * DISK_DIR: the folder to write to (default: "gauntlet-disk-save-test" in
 * the user's home folder; emptied first, deleted after). Not the system's
 * temporary folder: the browser refuses folders with system files.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "disk-save.manual.ts",
  timeout: 20 * 60_000,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  use: {
    baseURL: process.env.BRIDGE_SITE ?? "http://localhost:3000",
    channel: "msedge",
    headless: false,
    viewport: { width: 1920, height: 1080 },
    launchOptions: { args: ["--lang=en-US", "--window-size=900,700"] },
  },
});
