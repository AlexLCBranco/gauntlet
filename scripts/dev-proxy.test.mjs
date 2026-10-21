// node --test "scripts/*.test.mjs"
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { test } from "node:test";

import { compileSource, localTargets, rewrite, start, toLocal } from "./dev-proxy.mjs";

const { rewrites } = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf-8"));
const targets = localTargets({});
const local = (p) => {
  const u = new URL(p, "http://x");
  const dest = rewrite(rewrites, u.pathname, u.search);
  return dest && toLocal(dest, targets).href;
};

test("matches Vercel source patterns", () => {
  assert.deepEqual(compileSource("/boardkit")("/boardkit"), {});
  assert.equal(compileSource("/boardkit")("/boardkit/"), null);
  assert.deepEqual(compileSource("/a/:path+")("/a/b/c.js"), { path: "b/c.js" });
  assert.equal(compileSource("/a/:path+")("/a/"), null);
  assert.deepEqual(compileSource("/a/:id")("/a/b"), { id: "b" });
  assert.equal(compileSource("/a/:id")("/a/b/c"), null);
});

test("vercel.json's rewrites go to the local dev servers", () => {
  assert.equal(local("/linkkit"), "http://localhost:5181/linkkit/");
  assert.equal(local("/linkkit/"), "http://localhost:5181/linkkit/");
  assert.equal(local("/linkkit/src/main.tsx"), "http://localhost:5181/linkkit/src/main.tsx");
  assert.equal(local("/boardkit"), "http://localhost:5173/boardkit/");
  assert.equal(local("/boardkit/"), "http://localhost:5173/boardkit/");
  assert.equal(local("/boardkit/assets/a.js"), "http://localhost:5173/boardkit/assets/a.js");
  assert.equal(local("/elsewhere"), null);
});

test("the query string carries over, as on Vercel", () => {
  assert.equal(local("/linkkit/?embed=1&id=abc"), "http://localhost:5181/linkkit/?embed=1&id=abc");
  assert.equal(local("/boardkit?embed=1&id=b1"), "http://localhost:5173/boardkit/?embed=1&id=b1");
});

test("a deployment with no local dev server is refused", () => {
  assert.throws(() => toLocal(new URL("https://other.vercel.app/x"), targets), /No local dev server/);
});

test("serves the home page and forwards each app to its own server", async (t) => {
  const fake = (name) =>
    new Promise((resolve) => {
      const s = http.createServer((req, res) => res.end(`${name} ${req.url}`));
      s.listen(0, () => resolve(s));
    });
  const lk = await fake("linkkit");
  const bk = await fake("boardkit");
  const root = mkdtempSync(path.join(os.tmpdir(), "gauntlet-dist-"));
  writeFileSync(path.join(root, "index.html"), "<!doctype html><html><body>whiteboard</body></html>");
  mkdirSync(path.join(root, "backup"));
  writeFileSync(path.join(root, "backup", "index.html"), "<!doctype html><html><body>backup</body></html>");
  const proxy = await start({
    port: 0,
    root,
    targets: {
      "https://linkkit-lake.vercel.app": `http://localhost:${lk.address().port}`,
      "https://boardkit-iota.vercel.app": `http://localhost:${bk.address().port}`,
    },
  });
  t.after(() => [lk, bk, proxy].forEach((s) => s.close()));
  const base = `http://localhost:${proxy.address().port}`;
  const get = async (p) => {
    const r = await fetch(base + p);
    return [r.status, await r.text()];
  };

  const [homeStatus, home] = await get("/");
  assert.equal(homeStatus, 200);
  assert.match(home, /<html/i);
  // A folder with an index.html is served as a page, as on Vercel.
  assert.deepEqual(await get("/backup/"), [200, "<!doctype html><html><body>backup</body></html>"]);
  // vercel.json's redirects, before anything else, query kept: the old
  // whiteboard address goes to the home page (the whiteboard now).
  const where = async (p) => {
    const r = await fetch(base + p, { redirect: "manual" });
    return [r.status, r.headers.get("location")];
  };
  assert.deepEqual(await where("/whiteboard"), [307, "/"]);
  assert.deepEqual(await where("/whiteboard/"), [307, "/"]);
  assert.deepEqual(await where("/whiteboard/?x=1"), [307, "/?x=1"]);
  assert.deepEqual(await where("/backup"), [307, "/backup/"]);
  assert.deepEqual(await get("/whiteboard"), [200, "<!doctype html><html><body>whiteboard</body></html>"]);
  assert.deepEqual(await get("/linkkit?embed=1&id=m1"), [200, "linkkit /linkkit/?embed=1&id=m1"]);
  assert.deepEqual(await get("/boardkit/assets/x.js"), [200, "boardkit /boardkit/assets/x.js"]);
  assert.equal((await get("/nowhere"))[0], 404);
  assert.equal((await get("/scripts/dev-proxy.mjs"))[0], 404);
  assert.equal((await get("/.env"))[0], 404);
});
