/** Local GPU benchmark (dev server): node scripts/benchmark.mjs [output] [--mobile]
 * Mobile emulates a 390×844 screen at DPR 3, not a phone GPU.
 * Records frame times, internal resolution and screenshots at representative stops.
 * --check-only runs just the resize/loop checks without another performance sample.
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const mobile = args.includes("--mobile");
const output = args.find((arg) => !arg.startsWith("--")) ?? "docs/performance/latest";
const executablePath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((file) => fs.existsSync(file));
fs.mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--hide-scrollbars"],
  defaultViewport: {
    width: mobile ? 390 : 1600, height: mobile ? 844 : 900,
    deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile,
  },
});
const errors = [];
const report = { mobile, gpu: "", results: [], errors };
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(process.env.PC_URL ?? "http://127.0.0.1:3000", { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(() => window.__pc && [...document.querySelectorAll("button")]
    .some((button) => button.textContent.includes("silenzio") && !button.disabled), { timeout: 180000 });
  report.gpu = await page.evaluate(() => {
    const gl = window.__pc.gl.getContext();
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  console.log("GPU:", report.gpu);
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent.includes("silenzio")).click());
  await new Promise((resolve) => setTimeout(resolve, 6500));
  const stops = args.includes("--check-only") ? [] : [["hero", 0], ["portal", 0.0473], ["gallery", 0.2703], ["outro", 0.9473]];
  for (const [name, progress] of stops) {
    await page.evaluate((position) => window.__pc.seek(position), progress);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const result = await page.evaluate(() => new Promise((resolve) => {
      const samples = [];
      let first, previous;
      const tick = (now) => {
        first ??= now;
        if (previous !== undefined) samples.push(now - previous);
        previous = now;
        if (now - first < 3000) return requestAnimationFrame(tick);
        const sorted = [...samples].sort((a, b) => a - b);
        const engine = window.__pc;
        resolve({
          fps: +(samples.length * 1000 / (now - first)).toFixed(1),
          p50: +sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
          p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
          portal: [engine.rtPortal.width, engine.rtPortal.height],
          gallery: [engine.rtGallery.width, engine.rtGallery.height],
          ...engine.debug,
        });
      };
      requestAnimationFrame(tick);
    }));
    report.results.push({ name, ...result });
    console.log(name, JSON.stringify(result));
    // Fix portal animation time for before/after visual comparisons.
    await page.evaluate(() => {
      const engine = window.__pc;
      window.__benchmarkFrame = engine.frame;
      window.__benchmarkTime = engine.time;
      engine.time = 12;
      engine.mouse.set(0, 0);
      engine.mouseTarget.set(0, 0);
      engine.frame(0);
      engine.frame = () => {};
    });
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    await page.evaluate(() => {
      window.__pc.frame = window.__benchmarkFrame;
      window.__pc.time = window.__benchmarkTime;
    });
  }
  // Exercise the circular route in both directions and resize after adaptation.
  for (const [width, height] of mobile ? [[844, 390], [390, 844]] : [[1280, 720], [1600, 900]]) {
    await page.setViewport({ width, height, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
    await page.waitForFunction((w, h) => window.__pc.w === w && window.__pc.h === h, {}, width, height);
    for (const position of [0.811, 0.9, 0.994, 1.001, -0.001, 0]) {
      await page.evaluate(async (p) => {
        const engine = window.__pc;
        engine.seek(p);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (!engine.gallery.camera.projectionMatrix.elements.every(Number.isFinite)) throw new Error("Invalid projection after resize");
        if (!(engine.progress >= 0 && engine.progress < 1)) throw new Error("Invalid loop position");
        const gl = engine.gl.getContext();
        if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL error during resize/loop");
      }, position);
    }
  }
  report.resizeAndLoop = "passed";
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(errors.length ? errors : "No console errors");
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
