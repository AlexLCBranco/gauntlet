// Dev only: copies a local Boardkit checkout's src over node_modules/boardkit
// so Boardkit changes can be tried on the whiteboard before they are pushed
// and pinned in package.json. Usage: node scripts/sync-boardkit.mjs [path]
import { cpSync } from "node:fs";
import { resolve } from "node:path";

const from = resolve(process.argv[2] ?? "../Projects/boardkit", "src");
cpSync(from, resolve("node_modules/boardkit/src"), { recursive: true });
console.log(`synced ${from} -> node_modules/boardkit/src`);
