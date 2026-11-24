import { defineConfig } from "@playwright/test";

import { e2eSite } from "./scripts/e2e-site.mjs";

/**
 * End-to-end checks of the canvas, with the real apps in its frames. Each
 * run gets a fresh, empty browser profile (Edge, which ships with Windows),
 * so the owner's own maps and boards are never in reach.
 *
 *   npm run e2e                          # before a push: builds and serves a local copy, tests it
 *   npm run e2e -- e2e/slate.e2e.ts      # some of them, on the local copy
 *   node scripts/local-e2e.mjs           # this repo's e2e, then Linkkit's
 *   npm run e2e:live                     # the LIVE site: only when the owner asks
 *
 * There is no default site: Vercel requests are a budget (CLAUDE.md), and a
 * whole run on the live site costs thousands. BRIDGE_SITE must be given (a
 * copy on this PC, http://localhost:<port>); any other site also needs
 * E2E_LIVE=1, which only `npm run e2e:live` sets (scripts/e2e-site.mjs).
 * A bare `npx playwright test` stops at once and says what to run.
 */
const site = e2eSite();

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 5 * 60_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  // Against a deployed site: wait until /boardkit and /linkkit work first.
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: site,
    channel: "msedge",
    // Never a visible window, unless asked for (HEADED=1 or --headed).
    headless: !process.env.HEADED,
    // What the page showed when a test failed (test-results/).
    screenshot: "only-on-failure",
    viewport: { width: 1400, height: 900 },
  },
  // Two browsers at once against a deployed site, whatever this PC's
  // cores, so a run never sends Vercel a burst (owner, 2026-10-22).
  workers: /^https:\/\/[^/]+\.vercel\.app/.test(site) ? 2 : undefined,
  // Speed checks (perf.e2e.ts) measure frame times, so they run alone:
  // after every other e2e has finished, even when some failed (a teardown
  // project always runs), one at a time.
  projects: [
    { name: "e2e", testIgnore: /perf[^/\\]*\.e2e\.ts$/, teardown: "perf" },
    { name: "perf", testMatch: /perf[^/\\]*\.e2e\.ts$/, workers: 1 },
  ],
});
