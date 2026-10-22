// Measures how long /boardkit takes to be usable (its "Switch board" button
// showing) in a fresh browser profile, as the e2e helpers wait for it
// (hand-test round item 5, 2026-10-21). Each visit is a new, empty profile
// (cold cache, first-visit dialog), like a test.
//
//   node scripts/boardkit-load.mjs [site] [visits] [at once]
//   node scripts/boardkit-load.mjs https://gauntlet-home.vercel.app 20 1
//
// Prints each visit's time, the median, p90 and max, and the slowest
// visit's requests (count, bytes, slowest ones). Headless; closes
// everything it opens, also on failure.

import { chromium } from "@playwright/test";

const site = process.argv[2] ?? "https://gauntlet-home.vercel.app";
const visits = Number(process.argv[3] ?? 10);
const atOnce = Number(process.argv[4] ?? 1);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
try {
  const results = [];
  let next = 0;
  async function one() {
    const i = next++;
    if (i >= visits) return;
    const context = await browser.newContext();
    let status = 0;
    try {
      const page = await context.newPage();
      const reqs = [];
      page.on("requestfinished", async (r) => {
        const t = r.timing();
        const s = await r.sizes().catch(() => ({ responseBodySize: 0 }));
        reqs.push({ url: r.url(), ms: Math.round(t.responseEnd), bytes: s.responseBodySize });
      });
      const t0 = Date.now();
      const res = await page.goto(`${site}/boardkit/`, { waitUntil: "commit" });
      status = res?.status() ?? 0;
      const html = Date.now() - t0;
      await page.getByRole("button", { name: "Switch board" }).waitFor({ timeout: 60_000 });
      const ms = Date.now() - t0;
      results.push({ i, ms, html, reqs });
      console.log(`visit ${i + 1}: ${ms} ms (html ${html} ms, ${reqs.length} requests)`);
    } catch (e) {
      results.push({ i, ms: Infinity, html: 0, reqs: [] });
      const page = context.pages()[0];
      const text = page ? (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160) : "";
      console.log(`visit ${i + 1}: FAILED (HTTP ${status}) ${String(e).split("\n")[0]} | page: ${text}`);
    } finally {
      await context.close();
    }
    return one();
  }
  await Promise.all(Array.from({ length: atOnce }, one));
  const t = results.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`${site} x${visits}, ${atOnce} at once: median ${pct(t, 0.5)} ms, p90 ${pct(t, 0.9)} ms, max ${t.at(-1)} ms`);
  const slow = results.filter((r) => r.ms !== Infinity).sort((a, b) => b.ms - a.ms)[0];
  if (slow) {
    const bytes = slow.reqs.reduce((n, r) => n + r.bytes, 0);
    console.log(`slowest visit: ${slow.reqs.length} requests, ${Math.round(bytes / 1024)} KB; slowest requests:`);
    for (const r of slow.reqs.sort((a, b) => b.ms - a.ms).slice(0, 5)) console.log(`  ${r.ms} ms ${Math.round(r.bytes / 1024)} KB ${r.url.slice(0, 110)}`);
  }
} finally {
  await browser.close();
}
