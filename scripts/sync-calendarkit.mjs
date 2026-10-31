// Dev only: copies a local calendarkit checkout's src over node_modules/calendarkit
// so calendarkit changes (its Slate part) can be tried on the whiteboard before they are pushed
// and pinned in package.json. Usage: node scripts/sync-calendarkit.mjs [path]
import { cpSync } from "node:fs";
import { resolve } from "node:path";

const from = resolve(process.argv[2] ?? "../calendarkit", "src");
cpSync(from, resolve("node_modules/calendarkit/src"), { recursive: true });
console.log(`synced ${from} -> node_modules/calendarkit/src`);
