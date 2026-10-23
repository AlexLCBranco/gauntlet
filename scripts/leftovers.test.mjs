import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { appWindows, finishedRun, leftoverWindows, processes, testBrowsers } from "./leftovers.mjs";

test("a browser with a Playwright profile or build is a test browser; the owner's own browsers are not", () => {
  const ps = [
    { pid: 1, name: "msedge.exe", cmd: '"msedge.exe" --headless --user-data-dir=C:\\Temp\\playwright_chromiumdev_profile-AbC --remote-debugging-pipe' },
    { pid: 2, name: "msedge.exe", cmd: '"msedge.exe" --type=renderer --user-data-dir="C:\\Users\\alexc\\AppData\\Local\\Microsoft\\Edge\\User Data"' },
    { pid: 3, name: "chrome.exe", cmd: '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"' },
    { pid: 4, name: "chrome-headless-shell.exe", cmd: "C:\\Users\\alexc\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1248\\chrome-headless-shell.exe" },
    { pid: 5, name: "node.exe", cmd: "node playwright_chromiumdev_profile" },
  ];
  assert.deepEqual(testBrowsers(ps).map((p) => p.pid), [1, 4]);
});

test("a Playwright profile folder no running process names is stale; one in use and other folders are not", async () => {
  const { staleProfiles } = await import("./leftovers.mjs");
  const names = ["playwright_chromiumdev_profile-AbC", "playwright_chromiumdev_profile-XyZ", "playwright-transform-cache", "other"];
  const ps = [{ pid: 1, name: "msedge.exe", cmd: "msedge.exe --user-data-dir=C:/Temp/playwright_chromiumdev_profile-XyZ" }];
  assert.deepEqual(staleProfiles(names, ps), ["playwright_chromiumdev_profile-AbC"]);
});

test("a test browser belongs to a running run only while the node process that launched it lives (not a newer process reusing its pid)", () => {
  const ps = [
    { pid: 10, ppid: 1, name: "node.exe", cmd: "node playwright test", created: 100 },
    // a running run: node 10 launched browser 11, which started renderer 12
    { pid: 11, ppid: 10, name: "msedge.exe", cmd: "msedge --user-data-dir=playwright_chromiumdev_profile-A", created: 200 },
    { pid: 12, ppid: 11, name: "msedge.exe", cmd: "msedge --type=renderer --user-data-dir=playwright_chromiumdev_profile-A", created: 210 },
    // a finished run: its node (pid 20) is gone
    { pid: 21, ppid: 20, name: "msedge.exe", cmd: "msedge --user-data-dir=playwright_chromiumdev_profile-B", created: 300 },
    { pid: 22, ppid: 21, name: "msedge.exe", cmd: "msedge --type=gpu-process --user-data-dir=playwright_chromiumdev_profile-B", created: 310 },
    // a finished run whose node pid (30) now belongs to a newer process
    { pid: 30, ppid: 1, name: "node.exe", cmd: "node something-else", created: 900 },
    { pid: 31, ppid: 30, name: "msedge.exe", cmd: "msedge --user-data-dir=playwright_chromiumdev_profile-C", created: 400 },
  ];
  assert.deepEqual(finishedRun(ps).map((p) => p.pid), [21, 22, 31]);
});

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function waitUntil(fn, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
}

test("a hidden window of a headless test browser left by a finished run is reported (hidden ones went unnoticed, owner 2026-10-23)", { skip: process.platform !== "win32" }, async () => {
  const profile = mkdtempSync(path.join(tmpdir(), "playwright_chromiumdev_profile-leftovertest-"));
  // A short-lived node "test run" launches a headless Edge with a Playwright
  // profile and exits without closing it, as a crashed or killed run would.
  const args = ["--headless=new", "--no-first-run", `--user-data-dir=${profile}`, "data:text/html,<title>Gauntlet</title>"];
  const launcher = `require("child_process").spawn(${JSON.stringify(EDGE)}, ${JSON.stringify(args)}, { detached: true, stdio: "ignore", windowsHide: true }).unref()`;
  spawnSync(process.execPath, ["-e", launcher], { windowsHide: true });
  const mine = () => processes().filter((p) => p.cmd.includes(path.basename(profile)));
  try {
    const found = await waitUntil(() => leftoverWindows().find((w) => /Gauntlet/.test(w.title) && mine().some((p) => p.pid === w.pid)));
    assert.ok(found, "the leftover browser's hidden window was not reported");
    assert.equal(found.visible, false);
  } finally {
    for (const p of mine()) spawnSync("taskkill", ["/pid", String(p.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    await waitUntil(() => mine().length === 0, 5000);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test("a hidden window of a test browser whose run is still going is seen but not reported (it failed while tests ran, 2026-10-22)", { skip: process.platform !== "win32" }, async () => {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<title>Gauntlet</title>");
    // The browser processes this node process launched, and theirs.
    const ours = () => {
      const all = processes();
      const pids = new Set([process.pid]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const p of all) {
          if (pids.has(p.ppid) && !pids.has(p.pid)) {
            pids.add(p.pid);
            grew = true;
          }
        }
      }
      pids.delete(process.pid);
      return pids;
    };
    const seen = await waitUntil(() => appWindows().find((w) => /Gauntlet/.test(w.title) && ours().has(w.pid)));
    assert.ok(seen, "headless Edge's hidden window wasn't seen at all");
    assert.equal(seen.visible, false);
    assert.deepEqual(leftoverWindows().filter((w) => ours().has(w.pid)), []);
  } finally {
    await browser.close();
  }
});

test("the window check runs and finds no leftover test-browser window titled Linkkit, Boardkit or Gauntlet", () => {
  assert.deepEqual(leftoverWindows(), []);
});
