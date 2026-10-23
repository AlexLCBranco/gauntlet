// The gauntlet site on one local port, for running e2e tests before a push.
//
// Production: Vercel serves this repo's build (`dist/`, the whiteboard) and forwards each app's
// path to its own deployment with the rewrites in `vercel.json`, so the
// browser only ever sees one origin. This script does the same on
// localhost: it reads the very same rewrites from `vercel.json` and sends
// each one to a local dev server instead of the deployment (see TARGETS).
// A rewrite to a deployment with no local target stops the script, so a new
// app is never silently tested against production.
//
//   node scripts/dev-proxy.mjs            # http://localhost:3000
//   PORT=3100 LINKKIT_DEV=http://localhost:5181 node scripts/dev-proxy.mjs
//
// Needs both apps' dev servers running (Linkkit on 5181, Boardkit on 5173 by
// default) and this repo built (`npm run build`). `scripts/local-e2e.mjs`
// does all of that and runs the e2e. This repo's own Vite dev server
// (`vite.config.ts`) uses the same rules through `forward`.

import { createReadStream, readFileSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { handleUnfurl } from "../api/_lib/unfurl.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** `vercel.json`'s rewrites. */
export const readRewrites = () => JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf-8")).rewrites;

/** `vercel.json`'s redirects. */
export const readRedirects = () => JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf-8")).redirects ?? [];

/** Each deployment named in `vercel.json`, and the local dev server that
    stands in for it. */
export function localTargets(env = process.env) {
  return {
    "https://linkkit-lake.vercel.app": env.LINKKIT_DEV ?? "http://localhost:5181",
    "https://boardkit-iota.vercel.app": env.BOARDKIT_DEV ?? "http://localhost:5173",
  };
}

/** Turns a Vercel `source` pattern (`/linkkit/:path+`) into a matcher that
    returns its parameters, or null. Supports what `vercel.json` uses:
    literal segments, `:name` (one segment), `:name+` (one or more) and
    `:name*` (zero or more). */
export function compileSource(source) {
  const names = [];
  let pattern = "";
  for (const segment of source.split("/").slice(1)) {
    const param = /^:(\w+)([+*]?)$/.exec(segment);
    if (!param) {
      pattern += "/" + segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      continue;
    }
    names.push(param[1]);
    if (param[2] === "+") pattern += "/(.+)";
    else if (param[2] === "*") pattern += "(?:/(.*))?";
    else pattern += "/([^/]+)";
  }
  const re = new RegExp(`^${pattern || "/"}$`);
  return (pathname) => {
    const m = re.exec(pathname);
    if (!m) return null;
    return Object.fromEntries(names.map((name, i) => [name, m[i + 1] ?? ""]));
  };
}

/** The first rewrite matching `pathname`, as the destination URL with its
    parameters filled in; the query string carries over, as on Vercel.
    Null when none matches. */
export function rewrite(rewrites, pathname, search = "") {
  for (const { source, destination } of rewrites) {
    const params = compileSource(source)(pathname);
    if (!params) continue;
    const filled = destination.replace(/:(\w+)[+*]?/g, (whole, name) => (name in params ? params[name] : whole));
    const url = new URL(filled);
    if (search) {
      const extra = new URLSearchParams(search);
      for (const [k, v] of extra) url.searchParams.append(k, v);
    }
    return url;
  }
  return null;
}

/** Where the first redirect matching `pathname` sends the browser (a path,
    with the query string kept, as on Vercel), or null. Vercel applies
    redirects before anything else. */
export function redirect(redirects, pathname, search = "") {
  for (const { source, destination } of redirects) {
    const params = compileSource(source)(pathname);
    if (!params) continue;
    return destination.replace(/:(\w+)[+*]?/g, (whole, name) => (name in params ? params[name] : whole)) + search;
  }
  return null;
}

/** The destination with its deployment's origin swapped for the local dev
    server's. Throws for a deployment with no local target. */
export function toLocal(url, targets) {
  const local = targets[url.origin];
  if (!local) throw new Error(`No local dev server for ${url.origin}: add it to localTargets()`);
  return new URL(url.pathname + url.search, local);
}

const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

/** A file of the build to serve as-is, like Vercel's filesystem step (which
    comes before rewrites), or null. Hidden files are not served. */
function staticFile(root, pathname) {
  // A path ending in "/" is that folder's index.html (`/whiteboard/`).
  const rel = decodeURIComponent(pathname.endsWith("/") ? pathname + "index.html" : pathname);
  if (rel.split("/").some((part) => part.startsWith("."))) return null;
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep)) return null;
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

/** Sends the request on to `target` (an http or https URL) and streams the
    answer back. */
export function forward(req, res, target) {
  const upstream = (target.protocol === "https:" ? https : http).request(
    target,
    { method: req.method, headers: { ...req.headers, host: target.host } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`Server at ${target.origin} not reachable: ${err.message}`);
  });
  req.pipe(upstream);
}

/** `root`: the folder served at `/` (this repo's build). */
export function start({ port = Number(process.env.PORT ?? 3000), targets = localTargets(), root = path.join(ROOT, "dist") } = {}) {
  const rewrites = readRewrites();
  const redirects = readRedirects();
  // Every deployment must have a local stand-in before anything is served.
  for (const { destination } of rewrites) toLocal(new URL(destination.replace(/:\w+[+*]?/g, "x")), targets);

  const route = (reqUrl) => {
    const { pathname, search } = new URL(reqUrl, "http://proxy");
    const dest = rewrite(rewrites, pathname, search);
    return dest ? toLocal(dest, targets) : null;
  };

  const server = http.createServer((req, res) => {
    const { pathname, search } = new URL(req.url, "http://proxy");
    const to = redirect(redirects, pathname, search);
    if (to) {
      res.writeHead(307, { location: to });
      res.end();
      return;
    }
    // The site's own function (api/unfurl.js on Vercel). Local addresses
    // allowed here: the tests' own pages are on localhost.
    if (pathname === "/api/unfurl") {
      handleUnfurl(req, res, { allowPrivate: true });
      return;
    }
    const file = staticFile(root, pathname);
    if (file) {
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
      return;
    }
    const target = route(req.url);
    if (!target) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found (no file in the build and no rewrite in vercel.json)");
      return;
    }
    forward(req, res, target);
  });

  // Vite's hot reload talks over a WebSocket on the page's own origin.
  server.on("upgrade", (req, socket, head) => {
    const target = route(req.url);
    if (!target) return socket.destroy();
    const upstream = http.request(target, { headers: { ...req.headers, host: target.host } });
    upstream.on("upgrade", (up, upSocket, upHead) => {
      const lines = [`HTTP/1.1 101 Switching Protocols`];
      for (let i = 0; i < up.rawHeaders.length; i += 2) lines.push(`${up.rawHeaders[i]}: ${up.rawHeaders[i + 1]}`);
      socket.write(lines.join("\r\n") + "\r\n\r\n");
      if (upHead.length) socket.write(upHead);
      if (head.length) upSocket.write(head);
      upSocket.pipe(socket).pipe(upSocket);
      socket.on("error", () => upSocket.destroy());
      upSocket.on("error", () => socket.destroy());
    });
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await start();
  const { port } = server.address();
  console.log(`Gauntlet (local) at http://localhost:${port}`);
  for (const [from, to] of Object.entries(localTargets())) console.log(`  ${from} -> ${to}`);
}
