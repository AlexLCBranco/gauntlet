// Runs the e2e tests against the gauntlet site on localhost, before a push.
//
//   node scripts/local-e2e.mjs                       # every e2e in Linkkit
//   node scripts/local-e2e.mjs e2e/held.e2e.ts       # some of them
//
// Starts Linkkit's and Boardkit's dev servers from their checkouts (whatever
// branch each has checked out: check it out first), unless one already
// listens on its port, then this repo's proxy (`dev-proxy.mjs`, the same
// rewrites as production), then Playwright in Linkkit with BRIDGE_SITE
// pointing at the proxy. Stops what it started when the tests end, and
// exits with Playwright's exit code.
//
// Folders and ports: LINKKIT_DIR, BOARDKIT_DIR, LINKKIT_PORT (5181),
// BOARDKIT_PORT (5173), PORT (3000, the proxy).

import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { start } from "./dev-proxy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;
const apps = [
  { name: "Linkkit", dir: env.LINKKIT_DIR ?? path.resolve(ROOT, "../linkkit"), port: Number(env.LINKKIT_PORT ?? 5181) },
  { name: "Boardkit", dir: env.BOARDKIT_DIR ?? path.resolve(ROOT, "../Projects/boardkit"), port: Number(env.BOARDKIT_PORT ?? 5173) },
];
const proxyPort = Number(env.PORT ?? 3000);

const listening = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: "localhost" });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });

async function waitFor(port, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await listening(port)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Nothing listening on ${port} after ${ms / 1000} s`);
}

const branch = (dir) => spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout.trim();

const started = [];
function stopAll() {
  for (const child of started) {
    // npm on Windows runs vite under cmd.exe: stop the whole tree.
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else child.kill();
  }
}

let code = 1;
let proxy;
try {
  for (const app of apps) {
    if (await listening(app.port)) {
      console.log(`${app.name}: reusing the dev server already on ${app.port} (${app.dir} is on ${branch(app.dir)})`);
      continue;
    }
    console.log(`${app.name}: starting its dev server on ${app.port} from ${app.dir} (${branch(app.dir)})`);
    const child = spawn(`npm run dev -- --port ${app.port} --strictPort`, { cwd: app.dir, shell: true, stdio: "ignore" });
    started.push(child);
    await waitFor(app.port);
  }

  proxy = await start({
    port: proxyPort,
    targets: {
      "https://linkkit-lake.vercel.app": `http://localhost:${apps[0].port}`,
      "https://boardkit-iota.vercel.app": `http://localhost:${apps[1].port}`,
    },
  });
  const site = `http://localhost:${proxyPort}`;
  console.log(`Proxy at ${site}\n`);

  // Not spawnSync: the proxy runs in this process and must keep answering
  // while the tests run.
  const run = spawn(`npx playwright test ${process.argv.slice(2).join(" ")}`, {
    cwd: apps[0].dir,
    shell: true,
    stdio: "inherit",
    env: { ...env, BRIDGE_SITE: site },
  });
  code = await new Promise((resolve) => run.on("exit", (status) => resolve(status ?? 1)));
} catch (err) {
  console.error(err.message);
} finally {
  proxy?.close();
  stopAll();
}
process.exit(code);
