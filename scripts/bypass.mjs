// Vercel's "Protection Bypass for Automation" for runs against a deployed
// site (the live e2e and wait-deploy.mjs): Vercel's security checkpoint
// can block a test browser (403 "Security Checkpoint", 2026-10-22), and
// this secret lets it through without touching the firewall settings.
//
// The secret is the owner's, never in git: the environment variable
// VERCEL_AUTOMATION_BYPASS_SECRET, else the line
// `VERCEL_AUTOMATION_BYPASS_SECRET=...` in `.env.e2e` at the repo root
// (git-ignored by `.env*`). It goes only to the deployed site itself
// (a https://*.vercel.app address), never to localhost or another host.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BYPASS_HEADER = "x-vercel-protection-bypass";
export const SECRET_NAME = "VERCEL_AUTOMATION_BYPASS_SECRET";
export const SECRET_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.e2e");

/** The secret from the environment, else from the file's text; "" if none. */
export function secretFrom(env, fileText) {
  if (env[SECRET_NAME]) return env[SECRET_NAME].trim();
  const line = (fileText ?? "").split(/\r?\n/).find((l) => l.trim().startsWith(`${SECRET_NAME}=`));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
}

export function bypassSecret() {
  let text = "";
  try {
    text = fs.readFileSync(SECRET_FILE, "utf8");
  } catch {
    // No file: the environment variable or nothing.
  }
  return secretFrom(process.env, text);
}

/** The site's origin when the secret may be sent to it (a deployed
    https://*.vercel.app site), else null. */
export function bypassOrigin(site) {
  try {
    const u = new URL(site);
    return u.protocol === "https:" && u.hostname.endsWith(".vercel.app") ? u.origin : null;
  } catch {
    return null;
  }
}

/** The header for a request to `site`: {} unless it's a deployed site and
    there is a secret. */
export function bypassHeaders(site, secret = bypassSecret()) {
  return secret && bypassOrigin(site) ? { [BYPASS_HEADER]: secret } : {};
}
