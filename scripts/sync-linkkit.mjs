// Dev only: copies a local Linkkit checkout's src over node_modules/linkkit
// so Linkkit changes can be tried on the whiteboard before they are pushed
// and pinned in package.json. Usage: node scripts/sync-linkkit.mjs [path]
import { cpSync } from "node:fs";
import { resolve } from "node:path";

const from = resolve(process.argv[2] ?? "../linkkit", "src");
cpSync(from, resolve("node_modules/linkkit/src"), { recursive: true });
console.log(`synced ${from} -> node_modules/linkkit/src`);
