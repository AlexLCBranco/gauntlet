// Which site the Playwright tests may open (playwright.config.ts and
// playwright.disk.config.ts ask this, never process.env.BRIDGE_SITE alone).
//
// Vercel requests are a budget (CLAUDE.md): a whole run against a deployed
// site costs thousands of them. So there is no default site: BRIDGE_SITE
// must be given, and a site that isn't on this PC also needs E2E_LIVE=1,
// which only `npm run e2e:live` (scripts/live-e2e.mjs) sets.

export const LIVE_SITE = "https://gauntlet-home.vercel.app";

/** True for a site served from this PC (localhost, 127.0.0.1, [::1]). */
export function isLocalSite(site) {
  try {
    const u = new URL(site);
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** The site to test, from the environment; throws, saying what to run, if it isn't allowed. */
export function e2eSite(env = process.env) {
  const site = (env.BRIDGE_SITE ?? "").trim();
  if (!site)
    throw new Error(
      "No site to test. Run `npm run e2e` (builds and serves a local copy, then tests it), " +
        "or set BRIDGE_SITE to a local copy (http://localhost:<port>). " +
        "The live site only with `npm run e2e:live`, and only when the owner asks.",
    );
  if (!isLocalSite(site) && env.E2E_LIVE !== "1")
    throw new Error(
      `BRIDGE_SITE=${site} is not on this PC. Every page a test opens there costs Vercel requests. ` +
        "Use `npm run e2e` for a local copy; the live site only with `npm run e2e:live`, and only when the owner asks.",
    );
  return site;
}
