// node --test "scripts/*.test.mjs"
//
// `npm run dev:local`: the dev server with the apps from their local dev
// servers. Vite refuses the mode name "local" (it clashes with .env.local
// files), so the script once crashed before serving anything. Starts Vite
// exactly as the script does (its own --mode), on a spare port, with a
// stand-in "local Linkkit", and checks /linkkit/ is answered by it.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf-8")).scripts;

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const freePort = async () => {
  const s = http.createServer();
  const port = await listen(s);
  await new Promise((r) => s.close(r));
  return port;
};

test("npm run dev:local starts, and serves /linkkit from the local Linkkit", { timeout: 90_000 }, async () => {
  const mode = /--mode\s+(\S+)/.exec(scripts["dev:local"])?.[1];
  assert.ok(mode, `dev:local names a mode: ${scripts["dev:local"]}`);

  const linkkit = http.createServer((req, res) => res.end(`local linkkit ${req.url}`));
  const linkkitPort = await listen(linkkit);
  const port = await freePort();
  const vite = spawn(process.execPath, [path.join(ROOT, "node_modules/vite/bin/vite.js"), "--mode", mode, "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    env: { ...process.env, LINKKIT_DEV: `http://127.0.0.1:${linkkitPort}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  vite.stdout.on("data", (d) => (output += d));
  vite.stderr.on("data", (d) => (output += d));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no "ready" in 60 s:\n${output}`)), 60_000);
      vite.stdout.on("data", () => /ready in/i.test(output) && (clearTimeout(timer), resolve()));
      vite.on("exit", (code) => (clearTimeout(timer), reject(new Error(`vite exited (${code}) before it was ready:\n${output}`))));
    });
    const body = await fetch(`http://localhost:${port}/linkkit/`).then((r) => r.text());
    assert.equal(body, "local linkkit /linkkit/");
  } finally {
    vite.kill();
    linkkit.close();
  }
});
