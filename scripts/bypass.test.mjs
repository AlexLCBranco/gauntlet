import assert from "node:assert/strict";
import { test } from "node:test";

import { BYPASS_HEADER, bypassHeaders, bypassOrigin, isCheckpoint, secretFrom, sendBypass } from "./bypass.mjs";

test("the secret comes from the environment first, else from .env.e2e's line", () => {
  assert.equal(secretFrom({ VERCEL_AUTOMATION_BYPASS_SECRET: " abc " }, "VERCEL_AUTOMATION_BYPASS_SECRET=zzz"), "abc");
  assert.equal(secretFrom({}, "# note\r\nOTHER=1\r\nVERCEL_AUTOMATION_BYPASS_SECRET=\"x=y\"\r\n"), "x=y");
  assert.equal(secretFrom({}, ""), "");
  assert.equal(secretFrom({}, undefined), "");
});

test("it goes only to a deployed https://*.vercel.app site", () => {
  assert.equal(bypassOrigin("https://gauntlet-home.vercel.app"), "https://gauntlet-home.vercel.app");
  assert.equal(bypassOrigin("https://gauntlet-home.vercel.app/boardkit/"), "https://gauntlet-home.vercel.app");
  for (const site of ["http://localhost:3000", "http://gauntlet-home.vercel.app", "https://example.com", "https://vercel.app.evil.com", "", "nonsense"])
    assert.equal(bypassOrigin(site), null, site);
  assert.deepEqual(bypassHeaders("https://gauntlet-home.vercel.app", "s3cret"), { [BYPASS_HEADER]: "s3cret" });
  assert.deepEqual(bypassHeaders("http://localhost:3000", "s3cret"), {});
  assert.deepEqual(bypassHeaders("https://gauntlet-home.vercel.app", ""), {});
});

test("a 403 from the deployed site is the checkpoint; from elsewhere, or another status, it isn't", () => {
  const site = "https://gauntlet-home.vercel.app";
  assert.equal(isCheckpoint(site, `${site}/boardkit/`, 403), true);
  assert.equal(isCheckpoint(site, `${site}/`, 200), false);
  assert.equal(isCheckpoint(site, "https://example.com/", 403), false);
  assert.equal(isCheckpoint("http://localhost:3000", "http://localhost:3000/", 403), false);
});

test("no secret: sendBypass adds nothing and doesn't fail", async () => {
  const routes = [];
  const context = { route: async (...a) => routes.push(a) };
  await sendBypass(context, "https://gauntlet-home.vercel.app", "");
  await sendBypass(context, "http://localhost:3000", "s3cret");
  assert.equal(routes.length, 0);
  await sendBypass(context, "https://gauntlet-home.vercel.app", "s3cret");
  assert.equal(routes[0][0], "https://gauntlet-home.vercel.app/**");
});
