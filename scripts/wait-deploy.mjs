// Waits until Vercel has deployed a commit, then checks the site answers.
//
//   node scripts/wait-deploy.mjs                 # HEAD, https://gauntlet-home.vercel.app
//   node scripts/wait-deploy.mjs <sha> <site>
//
// Asks GitHub for the commit's "Vercel" status (gh CLI) every 30 s, for up
// to 15 minutes: no requests to the site while waiting (a burst of ~40 in
// a few minutes, 2026-10-22, may have tripped Vercel's security
// checkpoint). Once Vercel says success, one request to the site, with the
// automation bypass (bypass.mjs); its status is printed. Exits non-zero if
// the deploy failed, timed out, or the site doesn't answer 200.

import { execFileSync } from "node:child_process";

import { bypassHeaders, bypassSecret } from "./bypass.mjs";

const POLL_MS = 30_000;
const LIMIT_MS = 15 * 60_000;

const sha = process.argv[2] ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const site = process.argv[3] ?? "https://gauntlet-home.vercel.app";
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" }).trim();
const repo = gh("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner");

const start = Date.now();
for (;;) {
  const state = gh("api", `repos/${repo}/commits/${sha}/status`, "--jq", '[.statuses[] | select(.context == "Vercel") | .state][0] // "none"');
  const secs = Math.round((Date.now() - start) / 1000);
  if (state === "success") {
    console.log(`Vercel deployed ${sha.slice(0, 7)} (${secs} s).`);
    break;
  }
  if (state === "failure" || state === "error") {
    console.error(`Vercel's deploy of ${sha.slice(0, 7)}: ${state}.`);
    process.exit(1);
  }
  if (Date.now() - start > LIMIT_MS) {
    console.error(`Vercel still "${state}" for ${sha.slice(0, 7)} after ${secs} s.`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}

const res = await fetch(site + "/", { headers: bypassHeaders(site) });
console.log(`${site}/ answers ${res.status}${bypassSecret() ? " (with the bypass)" : " (no bypass secret set)"}.`);
if (res.status !== 200) process.exit(1);
