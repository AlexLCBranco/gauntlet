// Screenshots of Excalidraw's own toolbar and its open "More tools" menu,
// in dark mode, at the window size e2e/toolbar.e2e.ts uses for ours, so the
// two can be compared side by side (screenshots/, git-ignored).
//
//   node scripts/excalidraw-shots.mjs
//
// Headless; closes the browser however the script ends.

import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, colorScheme: "dark" });
  await page.goto("https://excalidraw.com/");
  const bar = page.locator(".App-toolbar");
  await bar.waitFor();
  // Excalidraw's own dark mode (its menu's toggle key).
  if (!(await page.locator(".excalidraw.theme--dark").count())) await page.keyboard.press("Alt+Shift+D");
  await page.locator(".excalidraw.theme--dark").waitFor();
  await bar.screenshot({ path: "screenshots/excalidraw-toolbar.png" });
  await page.locator(".App-toolbar__extra-tools-trigger").click();
  const menu = page.locator(".App-toolbar__extra-tools-dropdown");
  await menu.waitFor();
  const b = (await bar.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const m = (await menu.boundingBox()) ?? b;
  const x = Math.min(b.x, m.x) - 12;
  const right = Math.max(b.x + b.width, m.x + m.width) + 12;
  await page.screenshot({ path: "screenshots/excalidraw-toolbar-menu.png", clip: { x, y: 0, width: right - x, height: m.y + m.height + 12 } });
  console.log("screenshots/excalidraw-toolbar.png, screenshots/excalidraw-toolbar-menu.png");
} finally {
  await browser.close();
}
