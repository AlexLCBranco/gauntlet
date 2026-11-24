import assert from "node:assert/strict";
import { test } from "node:test";

import { e2eSite, isLocalSite, LIVE_SITE } from "./e2e-site.mjs";

test("no BRIDGE_SITE: no default site, the run stops with what to run", () => {
  for (const env of [{}, { BRIDGE_SITE: "" }, { BRIDGE_SITE: "  " }, { E2E_LIVE: "1" }])
    assert.throws(() => e2eSite(env), /npm run e2e/);
});

test("a local copy is allowed", () => {
  for (const site of ["http://localhost:3000", "http://127.0.0.1:5180", "http://[::1]:3000", "http://localhost"])
    assert.equal(e2eSite({ BRIDGE_SITE: site }), site);
});

test("the live site, or any other deployed site, needs E2E_LIVE=1", () => {
  for (const site of [LIVE_SITE, "https://gauntlet-git-x.vercel.app", "https://localhost.evil.com", "https://localhost:3000"]) {
    assert.throws(() => e2eSite({ BRIDGE_SITE: site }), /npm run e2e:live/, site);
    assert.throws(() => e2eSite({ BRIDGE_SITE: site, E2E_LIVE: "true" }), /npm run e2e:live/, site);
    assert.equal(e2eSite({ BRIDGE_SITE: site, E2E_LIVE: "1" }), site);
  }
});

test("isLocalSite", () => {
  assert.equal(isLocalSite("http://localhost:3000"), true);
  for (const site of [LIVE_SITE, "nonsense", "", "http://localhostx:3000"]) assert.equal(isLocalSite(site), false, site);
});
