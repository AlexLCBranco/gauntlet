// Runs the e2e tests against the LIVE site. Only when the owner asks for it:
// a whole run costs thousands of Vercel requests (CLAUDE.md, "Vercel
// requests are a budget"). Before a push use `npm run e2e` (a local copy).
//
//   npm run e2e:live                                  # every e2e, https://gauntlet-home.vercel.app
//   npm run e2e:live -- e2e/slate.e2e.ts              # some of them
//   BRIDGE_SITE=https://<other>.vercel.app npm run e2e:live
//
// The only command that sets E2E_LIVE=1, which playwright.config.ts needs
// for any site not on this PC (scripts/e2e-site.mjs). Afterwards it checks
// that no test browser is left running.

import { spawnSync } from "node:child_process";

import { LIVE_SITE } from "./e2e-site.mjs";
import { killLeftovers } from "./leftovers.mjs";

const site = process.env.BRIDGE_SITE || LIVE_SITE;
console.log(`LIVE e2e against ${site}: every page costs Vercel requests.\n`);
const run = spawnSync(`npx playwright test ${process.argv.slice(2).join(" ")}`, {
  shell: true,
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, BRIDGE_SITE: site, E2E_LIVE: "1" },
});
const left = killLeftovers();
if (left.length) console.error(`Stopped ${left.length} test browser process(es) left running: ${[...new Set(left.map((p) => p.name))].join(", ")}`);
process.exit(run.status ?? 1);
