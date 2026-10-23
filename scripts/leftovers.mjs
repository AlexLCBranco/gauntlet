// Finds (and stops) browsers that tests or scripts started and left
// running. Playwright gives every browser it launches a throwaway profile
// (`playwright_chromiumdev_profile-*` in the temp folder, or its own
// `ms-playwright` builds), so a test browser is one whose command line names
// one of those; the owner's own Edge and Chrome never do.
//
// It also looks for what such browsers leave after a crash or a kill: their
// throwaway profile folders in the temp folder (removed by --kill once no
// process uses them) and top-level windows titled Linkkit, Boardkit or
// Gauntlet owned by a test browser (hand-test round item 4, 2026-10-21),
// hidden ones too (a headless browser's window never shows), except those
// of a run still going: a browser whose launching node process still lives.
//
//   node scripts/leftovers.mjs          # list them (exit 1 if any)
//   node scripts/leftovers.mjs --kill   # stop them, remove stale profile folders

import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARK = /playwright_chromiumdev_profile|playwright_firefoxdev_profile|[\\/]ms-playwright[\\/]/i;
const BROWSER = /^(msedge|chrome|chromium|chrome-headless-shell|headless_shell|firefox)(\.exe)?$/i;

/** The test browsers among a process list ({ pid, name, cmd }). Pure. */
export function testBrowsers(processes) {
  return processes.filter((p) => BROWSER.test(p.name ?? "") && MARK.test(p.cmd ?? ""));
}

/** Every running process: { pid, ppid, name, cmd, created } (created: ms
    since 1970, Windows only). */
export function processes() {
  if (process.platform === "win32") {
    // Once in a while the list doesn't read as JSON (a process that came
    // and went with an odd command line, 2026-10-22): asked again.
    for (let tries = 1; ; tries++) {
      const ps = spawnSync(
        "powershell",
        ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate| ConvertTo-Json -Compress"],
        { encoding: "utf-8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      );
      try {
        const rows = JSON.parse(ps.stdout || "[]");
        return (Array.isArray(rows) ? rows : [rows]).map((r) => ({ pid: r.ProcessId, ppid: r.ParentProcessId, name: r.Name, cmd: r.CommandLine ?? "", created: created(r.CreationDate) }));
      } catch (e) {
        if (tries >= 3) throw e;
      }
    }
  }
  const ps = spawnSync("ps", ["-eo", "pid=,ppid=,comm=,args="], { encoding: "utf-8" });
  return ps.stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [, pid, ppid, name, cmd] = l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/) ?? [];
      return { pid: Number(pid), ppid: Number(ppid), name: name?.split("/").at(-1), cmd };
    });
}

// Windows PowerShell writes dates as "/Date(ms)/", PowerShell 7 as ISO.
function created(d) {
  const ms = /Date\((\d+)/.exec(d ?? "")?.[1];
  return ms ? Number(ms) : d ? Date.parse(d) : undefined;
}

/** The test browsers among a process list whose run has finished: the
    node process that launched them (the first non-browser up the parent
    chain) is gone, or its pid now belongs to a newer process. A browser
    still held by a running test (or script) is not a leftover yet. Pure. */
export function finishedRun(processes) {
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const running = (p) => {
    for (let child = p, steps = 0; steps < 64; steps++) {
      const parent = byPid.get(child.ppid);
      if (!parent || (parent.created != null && child.created != null && parent.created > child.created)) return false;
      if (!BROWSER.test(parent.name ?? "")) return /^node(\.exe)?$/i.test(parent.name ?? "");
      child = parent;
    }
    return false;
  };
  return testBrowsers(processes).filter((p) => !running(p));
}

const PROFILE = /^playwright_(chromiumdev|firefoxdev)_profile-/;

/** Playwright profile folders that no running process uses. Pure. */
export function staleProfiles(names, processes) {
  return names.filter((n) => PROFILE.test(n) && !processes.some((p) => (p.cmd ?? "").includes(n)));
}

function tempProfiles(running) {
  let names = [];
  try {
    names = readdirSync(tmpdir());
  } catch {
    return [];
  }
  return staleProfiles(names, running).map((n) => path.join(tmpdir(), n));
}

/** Top-level windows titled Linkkit, Boardkit or Gauntlet, hidden ones
    too, with their process: { hwnd, pid, title, visible }. Windows only. A
    headless test browser keeps a hidden one, titled after its page, for as
    long as it runs. */
export function appWindows() {
  if (process.platform !== "win32") return [];
  const script = `
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public class LW {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(P f, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  public static List<string> All() { var o = new List<string>(); EnumWindows((h, l) => { var b = new StringBuilder(512); GetWindowText(h, b, 512); uint p; GetWindowThreadProcessId(h, out p); if (b.Length > 0) o.Add(h.ToInt64() + "\t" + p + "\t" + (IsWindowVisible(h) ? 1 : 0) + "\t" + b); return true; }, IntPtr.Zero); return o; }
}
"@
[LW]::All()`;
  const ps = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf-8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  return (ps.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.split("\t"))
    .filter((c) => c.length >= 4 && /\b(Linkkit|Boardkit|Gauntlet)\b/.test(c.slice(3).join("\t")))
    .map(([hwnd, pid, visible, ...t]) => ({ hwnd: Number(hwnd), pid: Number(pid), title: t.join("\t"), visible: visible === "1" }));
}

/** Windows (see appWindows) of test browsers left by a finished run. Not
    those of a run still going: its browsers' hidden windows are expected
    (the check failed when run during an e2e run, 2026-10-22). */
export function leftoverWindows() {
  const left = new Set(finishedRun(processes()).map((p) => p.pid));
  return left.size ? appWindows().filter((w) => left.has(w.pid)) : [];
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
  // Their throwaway profiles, once nothing uses them any more.
  for (const dir of tempProfiles(processes())) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // in use or locked: next time
    }
  }
  return left;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const left = process.argv.includes("--kill") ? killLeftovers() : testBrowsers(processes());
  for (const p of left) console.log(`${p.pid} ${p.name} ${p.cmd.slice(0, 160)}`);
  console.log(left.length ? `${left.length} test browser process(es)${process.argv.includes("--kill") ? " stopped" : " still running"}` : "No test browser left running");
  const all = processes();
  const windows = leftoverWindows();
  for (const w of windows) console.log(`window ${w.hwnd} (pid ${w.pid}${w.visible ? "" : ", hidden"}): ${w.title}`);
  const profiles = tempProfiles(all);
  if (profiles.length) console.log(`${profiles.length} stale Playwright profile folder(s) in ${tmpdir()}${process.argv.includes("--kill") ? " left (in use or locked)" : ""}`);
  const bad = left.length + windows.length + profiles.length;
  process.exit(bad && !process.argv.includes("--kill") ? 1 : 0);
}
