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

export default defineConfig(({ mode }) => ({
  plugins: [react(), apps(mode)],
  server: { port: 5180 },
  // Two pages: the older canvas at `/`, the whiteboard at `/whiteboard/`.
  // tldraw alone is ~1.7 MB (515 kB gzipped), loaded only by the whiteboard.
  build: {
    rolldownOptions: { input: { main: "index.html", whiteboard: "whiteboard/index.html" } },
    chunkSizeWarningLimit: 2000,
  },
  test: { include: ["src/**/*.test.ts"] },
}));
