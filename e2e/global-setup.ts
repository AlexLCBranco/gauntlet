import { chromium, type FullConfig } from "@playwright/test";

/**
 * Before any test against a deployed site (live or a preview): /boardkit
 * and /linkkit must actually work, so a short outage of either app can't
 * fail a run's first tests one after another (hand-test round item 5: the
 * 27 live failures of 2026-10-21 were tests 1-27 in a row, ~1.5 min at the
 * run's start, "Switch board" never showing; every later test passed, and
 * 143 measured visits since, up to 8 at once, all loaded in under 2 s).
 * Waits up to 2 minutes, retrying, and says how long it waited; still
 * broken after that, the run stops with what the page showed.
 */
export default async function globalSetup(config: FullConfig) {
  const site = config.projects[0]?.use.baseURL ?? "";
  if (!site || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(site)) return;
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    for (const [path, button] of [
      ["/boardkit/", "Switch board"],
      ["/linkkit/", /^Switch map/],
    ] as const) {
      const start = Date.now();
      let last = "";
      for (let tries = 1; ; tries++) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await page.goto(site + path, { waitUntil: "commit", timeout: 30_000 });
          await page.getByRole("button", { name: button }).first().waitFor({ timeout: 15_000 });
          const waited = Date.now() - start;
          if (tries > 1) console.log(`${path} works after ${Math.round(waited / 1000)} s and ${tries} tries (last failure: ${last})`);
          break;
        } catch (e) {
          const page = context.pages()[0];
          const text = page ? (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200) : "";
          last = `${String(e).split("\n")[0]} | page: ${text}`;
          if (Date.now() - start > 120_000) throw new Error(`${site}${path} still not working after 2 minutes: ${last}`);
          await new Promise((r) => setTimeout(r, 5_000));
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}
