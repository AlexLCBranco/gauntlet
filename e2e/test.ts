import fs from "node:fs";
import path from "node:path";

import { test as base } from "@playwright/test";

import { isCheckpoint, sendBypass } from "../scripts/bypass.mjs";

/**
 * Playwright's `test` and `expect` for runs against a deployed site: every
 * request to it carries Vercel's automation bypass when a secret is set
 * (scripts/bypass.mjs; none set, nothing is sent), and once Vercel's
 * security checkpoint answers (403), the rest of the run is skipped
 * instead of asking again (owner, 2026-10-22). Every e2e imports from
 * here, not from "@playwright/test".
 */
export * from "@playwright/test";
export { sendBypass };

/** Written when the checkpoint answered; global-setup.ts clears it. */
export const CHECKPOINT_FILE = path.resolve("node_modules/.tmp/vercel-checkpoint");

export const test = base.extend({
  context: async ({ context, baseURL }, use, testInfo) => {
    const site = baseURL ?? "";
    if (fs.existsSync(CHECKPOINT_FILE)) testInfo.skip(true, `Vercel's security checkpoint answered 403 earlier in this run (${fs.readFileSync(CHECKPOINT_FILE, "utf8")}): stopped, not retried`);
    await sendBypass(context, site);
    context.on("response", (r) => {
      if (r.request().resourceType() === "document" && isCheckpoint(site, r.url(), r.status())) {
        fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
        fs.writeFileSync(CHECKPOINT_FILE, r.url());
      }
    });
    await use(context);
  },
});
