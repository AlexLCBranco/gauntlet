// Finds (and stops) browsers that tests or scripts started and left
// running. Playwright gives every browser it launches a throwaway profile
// (`playwright_chromiumdev_profile-*` in the temp folder, or its own
// `ms-playwright` builds), so a test browser is one whose command line names
// one of those; the owner's own Edge and Chrome never do.
//
//   node scripts/leftovers.mjs          # list them (exit 1 if any)
//   node scripts/leftovers.mjs --kill   # stop them

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MARK = /playwright_chromiumdev_profile|playwright_firefoxdev_profile|[\\/]ms-playwright[\\/]/i;
const BROWSER = /^(msedge|chrome|chromium|chrome-headless-shell|headless_shell|firefox)(\.exe)?$/i;

/** The test browsers among a process list ({ pid, name, cmd }). Pure. */
export function testBrowsers(processes) {
  return processes.filter((p) => BROWSER.test(p.name ?? "") && MARK.test(p.cmd ?? ""));
}

/** Every running process: { pid, name, cmd }. */
export function processes() {
  if (process.platform === "win32") {
    const ps = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"],
      { encoding: "utf-8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    );
    const rows = JSON.parse(ps.stdout || "[]");
    return (Array.isArray(rows) ? rows : [rows]).map((r) => ({ pid: r.ProcessId, name: r.Name, cmd: r.CommandLine ?? "" }));
  }
  const ps = spawnSync("ps", ["-eo", "pid=,comm=,args="], { encoding: "utf-8" });
  return ps.stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [, pid, name, cmd] = l.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/) ?? [];
      return { pid: Number(pid), name: name?.split("/").at(-1), cmd };
    });
}

/** Stops every test browser still running; returns what it found. */
export function killLeftovers() {
  const left = testBrowsers(processes());
  for (const p of left) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(p.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    else {
      try {
        process.kill(p.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
  return left;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const left = process.argv.includes("--kill") ? killLeftovers() : testBrowsers(processes());
  for (const p of left) console.log(`${p.pid} ${p.name} ${p.cmd.slice(0, 160)}`);
  console.log(left.length ? `${left.length} test browser process(es)${process.argv.includes("--kill") ? " stopped" : " still running"}` : "No test browser left running");
  process.exit(left.length && !process.argv.includes("--kill") ? 1 : 0);
}
