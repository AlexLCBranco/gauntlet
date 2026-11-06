import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "./test";

/**
 * GIF / video / sound check (owner, Edges round item 9): REPORT ONLY,
 * nothing built. An animated GIF is pasted and an mp4 with sound dropped
 * onto the whiteboard (both made here); what happens is written to the
 * test's annotations and the run's output ("media" lines). It fails only if
 * the check itself can't run.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

/** A 2-frame animated GIF (red, then blue; 0.1 s each, looping), 8 × 8. */
function animatedGif(): Buffer {
  const w = 8;
  const h = 8;
  const bytes: number[] = [];
  const u16 = (n: number) => [n & 255, n >> 8];
  bytes.push(...Buffer.from("GIF89a"), ...u16(w), ...u16(h), 0x80, 0, 0, 0xff, 0, 0, 0, 0, 0xff);
  bytes.push(0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0"), 0x03, 0x01, 0, 0, 0);
  // LZW, minimum code size 2: a clear code before every 2 pixels keeps every code 3 bits.
  const frame = (color: number) => {
    const codes: number[] = [];
    for (let i = 0; i < w * h; i += 2) codes.push(4, color, color);
    codes.push(5);
    const out: number[] = [];
    let acc = 0;
    let n = 0;
    for (const c of codes) {
      acc |= c << n;
      n += 3;
      while (n >= 8) {
        out.push(acc & 255);
        acc >>= 8;
        n -= 8;
      }
    }
    if (n > 0) out.push(acc & 255);
    const blocks: number[] = [];
    for (let i = 0; i < out.length; i += 255) {
      const chunk = out.slice(i, i + 255);
      blocks.push(chunk.length, ...chunk);
    }
    return [0x21, 0xf9, 0x04, 0x00, ...u16(10), 0, 0, 0x2c, 0, 0, 0, 0, ...u16(w), ...u16(h), 0, 0x02, ...blocks, 0];
  };
  bytes.push(...frame(0), ...frame(1), 0x3b);
  return Buffer.from(bytes);
}

/** An mp4 (H.264 + AAC) of 2 s, a moving square and a 440 Hz tone, recorded by the browser. */
const recordMp4 = (page: Page) =>
  page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const g = canvas.getContext("2d")!;
    const audio = new AudioContext();
    const osc = audio.createOscillator();
    const dest = audio.createMediaStreamDestination();
    osc.frequency.value = 440;
    osc.connect(dest);
    osc.start();
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const type = "video/mp4;codecs=avc1,mp4a.40.2";
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported(type) ? type : "video/mp4" });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    let x = 0;
    const draw = setInterval(() => {
      g.fillStyle = "#222";
      g.fillRect(0, 0, 320, 180);
      g.fillStyle = "#4caf7a";
      g.fillRect((x += 6) % 300, 70, 40, 40);
    }, 33);
    rec.start();
    await new Promise((r) => setTimeout(r, 2000));
    await new Promise((r) => ((rec.onstop = r), rec.stop()));
    clearInterval(draw);
    osc.stop();
    await audio.close();
    const blob = new Blob(parts, { type: "video/mp4" });
    const b = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return { b64: btoa(s), mime: rec.mimeType, size: b.length, audioTracks: stream.getAudioTracks().length };
  });

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

/** Whether the picture on the page changes over 0.6 s: 6 screenshots of
    it (reading it through a canvas only ever gives a GIF's first frame). */
async function animates(page: Page) {
  const img = page.locator(".tl-image").first();
  if (!(await img.count())) return { found: false, frames: 0 };
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    seen.add((await img.screenshot({ animations: "allow" })).toString("base64"));
    await page.waitForTimeout(70);
  }
  return { found: true, frames: seen.size };
}

const videoState = (page: Page) =>
  page.evaluate(async () => {
    const v = document.querySelector<HTMLVideoElement>(".tl-video, video");
    if (!v) return null;
    const t0 = v.currentTime;
    await new Promise((r) => setTimeout(r, 800));
    return { paused: v.paused, muted: v.muted, autoplay: v.autoplay, controls: v.controls, loop: v.loop, advanced: v.currentTime > t0, readyState: v.readyState, duration: v.duration };
  });

/** Frame gaps over 2 s at rest and while zooming (ms, p95 and longest). */
const frames = (page: Page) =>
  page.evaluate(async () => {
    const run = async (zoom: boolean) => {
      const gaps: number[] = [];
      let last = performance.now();
      let on = true;
      const tick = (t: number) => {
        gaps.push(t - last);
        last = t;
        if (on) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      for (let i = 0; i < 20; i++) {
        if (zoom) (window as any).editor.zoomIn(undefined, { animation: { duration: 0 } });
        await new Promise((r) => setTimeout(r, 50));
        if (zoom) (window as any).editor.zoomOut(undefined, { animation: { duration: 0 } });
        await new Promise((r) => setTimeout(r, 50));
      }
      on = false;
      gaps.sort((a, b) => a - b);
      return { p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]! * 10) / 10, longest: Math.round(gaps.at(-1)! * 10) / 10 };
    };
    return { rest: await run(false), zoom: await run(true) };
  });

test("an animated GIF pasted and an mp4 with sound dropped: animation, playback, sound, speed, reload, backup/restore (report)", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  const report: Record<string, unknown> = {};
  await open(page);
  report.emptyPage = await frames(page);

  // The GIF, pasted (a test can't put a file on the real clipboard: the
  // paste event carries it, as the browser's would).
  const gif = animatedGif().toString("base64");
  await page.mouse.move(500, 400);
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "spin.gif", { type: "image/gif" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, gif);
  await expect.poll(() => page.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).filter((s) => s.type === "image").length), { timeout: 10_000 }).toBe(1);
  await page.waitForTimeout(500);
  report.gifAsset = await page.evaluate(() => { const e = (window as any).editor; const s = e.getCurrentPageShapes().find((x: any) => x.type === "image"); const a = e.getAsset(s.props.assetId); return { isAnimated: a.props.isAnimated, mimeType: a.props.mimeType }; });
  report.gifAnimates = await animates(page);

  // The mp4, dropped.
  const mp4 = await recordMp4(page);
  report.mp4 = { mime: mp4.mime, bytes: mp4.size, audioTracks: mp4.audioTracks };
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "clip.mp4", { type: "video/mp4" }));
    const canvas = document.querySelector(".tl-canvas")!;
    for (const type of ["dragenter", "dragover", "drop"]) canvas.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 1000, clientY: 500 }));
  }, mp4.b64);
  await expect.poll(() => page.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).filter((s) => s.type === "video").length), { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(1000);
  report.video = await videoState(page);
  report.videoShapeProps = await page.evaluate(() => { const s = ((window as any).editor.getCurrentPageShapes() as any[]).find((x) => x.type === "video"); return { autoplay: s.props.autoplay, playing: s.props.playing, time: s.props.time }; });
  // Can sound be turned on? A double-click opens the video (tldraw's edit
  // mode): the browser's own controls show, with the speaker button.
  const v = page.locator("video").first();
  const vb = (await v.boundingBox())!;
  await page.mouse.dblclick(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await page.waitForTimeout(300);
  report.doubleClick = await page.evaluate(() => { const el = document.querySelector("video")!; return { editing: (window as any).editor.getEditingShapeId() !== null, controls: el.controls, widthOnScreen: Math.round(el.getBoundingClientRect().width) }; });
  report.soundOn = await page.evaluate(async () => {
    const el = document.querySelector("video")!;
    el.muted = false;
    el.volume = 1;
    try {
      await el.play();
      return { played: true, muted: el.muted, volume: el.volume, hasAudio: (el as any).mozHasAudio ?? ((el as any).webkitAudioDecodedByteCount > 0 || null) };
    } catch (e) {
      return { played: false, error: String(e) };
    }
  });
  report.withBoth = await frames(page);

  // Reload.
  await page.waitForTimeout(1000);
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await page.waitForTimeout(1500);
  report.afterReload = {
    shapes: await page.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).map((s) => s.type).sort()),
    gifAnimates: await animates(page),
    video: await videoState(page),
  };

  // Backup → restore into a fresh browser.
  await page.goto("/backup/");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save a backup" }).click()]);
  const file = await readFile((await download.path())!, "utf-8");
  report.backupBytes = file.length;
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
  const fresh = await ctx.newPage();
  await fresh.goto("/backup/");
  await fresh.getByLabel("Backup file").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(file) });
  const dialog = fresh.getByRole("dialog", { name: "Replace what's here with this backup?" });
  await Promise.all([fresh.waitForEvent("download"), dialog.getByRole("button", { name: "Replace with this backup" }).click()]);
  await expect(fresh.getByRole("status")).toContainText("Restored");
  await open(fresh);
  await fresh.waitForTimeout(1500);
  report.afterRestore = {
    shapes: await fresh.evaluate(() => ((window as any).editor.getCurrentPageShapes() as any[]).map((s) => s.type).sort()),
    gifAsset: await fresh.evaluate(() => { const e = (window as any).editor; const s = e.getCurrentPageShapes().find((x: any) => x.type === "image"); const a = e.getAsset(s.props.assetId); const img = document.querySelector<HTMLImageElement>(".tl-image"); return { isAnimated: a.props.isAnimated, src: String(a.props.src).slice(0, 30), imgSrc: img?.src.slice(0, 30), shown: img?.naturalWidth }; }),
    gifAnimates: await animates(fresh),
    gifAnimatesLater: await (async () => { await fresh.waitForTimeout(2000); return animates(fresh); })(),
    video: await videoState(fresh),
  };
  await ctx.close();

  console.log("media", JSON.stringify(report));
  test.info().annotations.push({ type: "media", description: JSON.stringify(report) });
});
