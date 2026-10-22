import assert from "node:assert/strict";
import test from "node:test";

import { testBrowsers } from "./leftovers.mjs";

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

test("the window check runs and finds no test-browser window titled Linkkit, Boardkit or Gauntlet", async () => {
  const { appWindows, processes, testBrowsers } = await import("./leftovers.mjs");
  const test = new Set(testBrowsers(processes()).map((p) => p.pid));
  assert.deepEqual(appWindows().filter((w) => test.has(w.pid)), []);
});
