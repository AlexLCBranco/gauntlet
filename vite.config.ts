import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { forward, localTargets, readRewrites, rewrite, toLocal } from "./scripts/dev-proxy.mjs";

/**
 * Dev server: the canvas at `/`, and `/boardkit` and `/linkkit` forwarded by
 * `vercel.json`'s own rewrites, so everything shares one origin as on the
 * live site.
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
      const targets = mode === "local" ? localTargets() : null;
      server.middlewares.use((req, res, next) => {
        const { pathname, search } = new URL(req.url ?? "/", "http://dev");
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
  optimizeDeps: { exclude: ["boardkit"] },
  // Watches Boardkit too, for `scripts/sync-boardkit.mjs`.
  server: { port: 5180, watch: { ignored: ["!**/node_modules/boardkit/**"] } },
  // Two pages: the older canvas at `/`, the whiteboard at `/whiteboard/`.
  // tldraw alone is ~1.7 MB (515 kB gzipped), loaded only by the whiteboard.
  build: {
    rolldownOptions: { input: { main: "index.html", whiteboard: "whiteboard/index.html", backups: "backups/index.html" } },
    chunkSizeWarningLimit: 2000,
  },
  test: { include: ["src/**/*.test.ts"] },
}));
