/**
 * Cattura preview dell'esperienza con Chrome/Edge locale (headless, GPU reale).
 *
 *   node scripts/capture.mjs [url] [outDir] [--w 1600] [--h 900] [--at 0,0.05,0.2] [--exp 1] [--mobile]
 *
 * Entra "in silenzio", attende l'intro e scatta uno screenshot per ogni posizione del percorso
 * (frazione 0..1 del giro, via window.__pc.seek in sviluppo). Senza --at: hero, attraversamento,
 * ogni stazione e l'ascesa finale. --mobile emula un telefono (390×844, touch).
 * Stampa fps medi ed eventuali errori della console.
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const url = positional[0] ?? "http://localhost:3001";
const outDir = positional[1] ?? "previews";
const mobile = args.includes("--mobile");
const W = Number(opt("w", mobile ? 390 : 1600));
const H = Number(opt("h", mobile ? 844 : 900));
// percorso: hero 2 + 11 tratti tra 12 stazioni + outro 2.8 schermate (vedi stations.ts)
const N = 12;
const T = 2 + (N - 1) + 2.8;
const def = [0, 0.7, 1.3, ...Array.from({ length: N }, (_, k) => 2 + k), ...[0.12, 0.3, 0.5, 0.62, 0.72, 0.85, 0.97].map((o) => 1 + N + o * 2.8)].map((x) => +(x / T).toFixed(4));
const stops = (opt("at", "") ? opt("at", "").split(",") : def).map(Number);
const exp = Number(opt("exp", 1));
const settle = Number(opt("settle", 2600));

const candidates = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = candidates.find((p) => fs.existsSync(p));
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  defaultViewport: { width: W, height: H, isMobile: mobile, hasTouch: mobile },
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
await page.waitForFunction(
  () => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("silenzio") && !b.disabled),
  { timeout: 180000 },
);
const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const e = gl.getExtension("WEBGL_debug_renderer_info");
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?";
});
console.log("GPU:", gpu);
await page.screenshot({ path: path.join(outDir, "00_loader.png") });
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("silenzio")).click());
await page.evaluate((e) => window.__pc && (window.__pc.exposureMul = e), exp);
await new Promise((r) => setTimeout(r, 6500));

const fps = async () =>
  page.evaluate(
    () =>
      new Promise((r) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 < 1500) requestAnimationFrame(f);
          else r(n / 1.5);
        };
        requestAnimationFrame(f);
      }),
  );

let i = 0;
for (const s of stops) {
  await page.evaluate((s) => window.__pc.seek(s), s);
  await new Promise((r) => setTimeout(r, settle));
  await page.mouse.move(W * 0.55, H * 0.45);
  const f = await fps();
  const name = `${String(++i).padStart(2, "0")}_scroll_${String(Math.round(s * 1000)).padStart(4, "0")}.png`;
  await page.screenshot({ path: path.join(outDir, name) });
  const dbg = await page.evaluate(() => window.__pc?.debug);
  console.log(name, `fps=${f.toFixed(1)}`, JSON.stringify(dbg));
}
console.log(errors.length ? errors.join("\n") : "nessun errore in console");
await browser.close();
