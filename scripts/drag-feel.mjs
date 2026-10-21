// Measures how smoothly a drag runs (HANDOFF item 10): frame times, long
// tasks and, for tldraw, whether the shape keeps up with the pointer. A
// measurement to compare apps, not a test.
//
//   node scripts/drag-feel.mjs <url> tldraw|excalidraw [--headed]
//   node scripts/drag-feel.mjs https://gauntlet-home.vercel.app/whiteboard/ tldraw
//   node scripts/drag-feel.mjs https://excalidraw.com/ excalidraw
import { chromium } from "@playwright/test";

// Headless unless --headed; the browser is closed however the script ends.
const [url, kind] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const browser = await chromium.launch({ channel: "msedge", headless: !process.argv.includes("--headed") });
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) process.on(sig, () => browser.close().finally(() => process.exit(130)));
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(url);
  await page.waitForTimeout(kind === "excalidraw" ? 4000 : 2500);

  // Draw 40 rectangles (realistic page), then one to drag.
  const rect = async (x, y, w = 70, h = 40) => {
    await page.keyboard.press(kind === "excalidraw" ? "r" : "2");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + w / 2, y + h / 2, { steps: 3 });
    await page.mouse.move(x + w, y + h, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.press("Escape");
  };
  if (kind === "excalidraw") {
    // Close the welcome screen.
    await page.mouse.click(800, 450);
  }
  for (let i = 0; i < 40; i++) await rect(320 + (i % 10) * 90, 120 + Math.floor(i / 10) * 70);
  await rect(700, 520, 160, 100);
  // Select it, so the drag below moves it.
  if (kind === "tldraw") await page.evaluate(() => { const e = window.editor; e.select(e.getCurrentPageShapesSorted().at(-1).id); });
  else await page.mouse.click(700, 560);
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    window.__frames = [];
    window.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: "longtask", buffered: false });
    let last = performance.now();
    const loop = (t) => {
      window.__frames.push(t - last);
      last = t;
      if (window.__frames.length < 400) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  // Drag: grab the edge, move 600 px in 2 s, one mouse event per 8 ms.
  await page.mouse.move(760, 560);
  await page.mouse.down();
  const lags = [];
  for (let i = 1; i <= 250; i++) {
    await page.mouse.move(760 + i * 2.4, 560 + Math.sin(i / 20) * 80);
    if (kind === "tldraw" && i % 10 === 0) {
      lags.push(await page.evaluate(([px]) => {
        const e = window.editor;
        const s = e.getSelectedShapes()[0];
        const b = e.getShapePageBounds(s);
        return px - e.pageToScreen({ x: b.x, y: b.y }).x;
      }, [760 + i * 2.4]));
    }
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  const r = await page.evaluate(() => ({ frames: window.__frames.slice(5), long: window.__long }));
  const f = r.frames.sort((a, b) => a - b);
  const pct = (p) => f[Math.floor(f.length * p)].toFixed(1);
  console.log(kind, url);
  console.log(`  frames ${f.length}: median ${pct(0.5)} ms, p95 ${pct(0.95)} ms, worst ${f.at(-1).toFixed(1)} ms, over 25 ms: ${f.filter((x) => x > 25).length}`);
  console.log(`  long tasks (>50 ms): ${r.long.length}${r.long.length ? " max " + Math.max(...r.long).toFixed(0) + " ms" : ""}`);
  if (lags.length) {
    const spread = Math.max(...lags) - Math.min(...lags);
    console.log(`  pointer-to-shape offset spread while dragging: ${spread.toFixed(1)} px (0 = shape keeps up with the pointer)`);
  }
} finally {
  await browser.close();
}
