import { test as base, type BrowserContext } from "@playwright/test";

import { BYPASS_HEADER, bypassOrigin, bypassSecret } from "../scripts/bypass.mjs";

/**
 * Playwright's `test` and `expect`, with every request to a deployed site
 * carrying Vercel's automation bypass (scripts/bypass.mjs). Every e2e
 * imports from here, not from "@playwright/test".
 */
export * from "@playwright/test";

/** Adds the bypass header to every request this context makes to `site`
    (pages, frames, fetches), and to nothing else: no secret, or not a
    deployed site, and nothing changes. */
export async function sendBypass(context: BrowserContext, site: string | undefined) {
  const origin = bypassOrigin(site ?? "");
  const secret = bypassSecret();
  if (!origin || !secret) return;
  await context.route(`${origin}/**`, (route) => route.continue({ headers: { ...route.request().headers(), [BYPASS_HEADER]: secret } }));
}

export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    await sendBypass(context, baseURL);
    await use(context);
  },
});
