import { defineConfig } from "@playwright/test";

/**
 * End-to-end checks of the canvas, with the real apps in its frames. Each
 * run gets a fresh, empty browser profile (Edge, which ships with Windows),
 * so the owner's own maps and boards are never in reach.
 *
 *   node scripts/local-e2e.mjs                       # before a push: local copy of the site
 *   npm run e2e                                      # the live site
 *   BRIDGE_SITE=http://localhost:3000 npm run e2e    # another copy of it
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 5 * 60_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  // Against a deployed site: wait until /boardkit and /linkkit work first.
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.BRIDGE_SITE ?? "https://gauntlet-home.vercel.app",
    channel: "msedge",
    // Never a visible window, unless asked for (HEADED=1 or --headed).
    headless: !process.env.HEADED,
    // What the page showed when a test failed (test-results/).
    screenshot: "only-on-failure",
    viewport: { width: 1400, height: 900 },
  },
  // Speed checks (perf.e2e.ts) measure frame times, so they run alone:
  // after every other e2e has finished, even when some failed (a teardown
  // project always runs), one at a time.
  projects: [
    { name: "e2e", testIgnore: "perf.e2e.ts", teardown: "perf" },
    { name: "perf", testMatch: "perf.e2e.ts", workers: 1 },
  ],
});
