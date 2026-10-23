import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { forward, localTargets, readRedirects, readRewrites, redirect, rewrite, toLocal } from "./scripts/dev-proxy.mjs";
import { handleUnfurl } from "./api/_lib/unfurl.js";

/**
 * Dev server: the whiteboard at `/`, and `/boardkit` and `/linkkit`
 * forwarded by `vercel.json`'s own rewrites (its redirects too), so
 * everything shares one origin as on the live site.
 *
 *   npm run dev          # apps from their live deployments (everyday dev)
 *   npm run dev:local    # apps from their local dev servers (5181, 5173)
 *
 * The apps keep their data per origin, so localhost has its own maps and
 * boards, apart from the live site's.
 */
function apps(mode: string): Plugin {
  return {
    name: "gauntlet-apps",
    configureServer(server) {
      const rewrites = readRewrites();
      const redirects = readRedirects();
      const targets = mode === "local" ? localTargets() : null;
      server.middlewares.use((req, res, next) => {
        const { pathname, search } = new URL(req.url ?? "/", "http://dev");
        const to = redirect(redirects, pathname, search);
        if (to) {
          res.writeHead(307, { location: to });
          res.end();
          return;
        }
        // The site's own function (api/unfurl.js on Vercel).
        if (pathname === "/api/unfurl") return void handleUnfurl(req, res, { allowPrivate: true });
        const dest = rewrite(rewrites, pathname, search);
        if (!dest) return next();
        forward(req, res, targets ? toLocal(dest, targets) : dest);
      });
    },
  };
}

const BOARDKIT_SRC = fileURLToPath(new URL("./node_modules/boardkit/src/", import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), apps(mode)],
  // Boardkit (an npm git dependency, `src/boards/`) is imported as source:
  // its own "@/..." imports point into it, and it is not pre-bundled.
  // Its stylesheet imports shadcn's: src/boards/vendor/shadcn, a local
  // css-only package.
  resolve: { alias: [{ find: /^@\//, replacement: BOARDKIT_SRC }] },
  // Linkkit is not pre-bundled either, so what it uses is named here (React
  // Flow ships CommonJS parts that must be pre-bundled).
  optimizeDeps: { exclude: ["boardkit", "linkkit"], include: ["@xyflow/react", "html-to-image", "radix-ui", "lucide-react", "zustand"] },
  // Watches Boardkit and Linkkit too, for `scripts/sync-boardkit.mjs` and
  // `scripts/sync-linkkit.mjs`.
  server: { port: 5180, watch: { ignored: ["!**/node_modules/boardkit/**", "!**/node_modules/linkkit/**"] } },
  // Two pages: the whiteboard at `/`, the backup page at `/backup/`.
  // tldraw alone is ~1.7 MB (515 kB gzipped), loaded only by the whiteboard.
  build: {
    rolldownOptions: { input: { main: "index.html", backup: "backup/index.html" } },
    // The whiteboard chunk is ~2 MB, most of it tldraw (~1.7 MB, 515 kB
    // gzipped), and only the whiteboard loads it. That size is known and
    // accepted (no code splitting for now), so the limit sits well above
    // it: set once, not raised to just above the bundle on every build. A
    // warning means the bundle grew a lot: find out why.
    chunkSizeWarningLimit: 3000,
  },
  test: { include: ["src/**/*.test.ts"] },
}));
