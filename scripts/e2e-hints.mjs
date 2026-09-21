// Placement-hint timelines on synthetic fake cameras (TEST r2 S7 / D4 / D5 / D6): black, two people, a body
// with the head cut off, a frontal upper body, a portrait phone, plus real clips, read off the DOM HUD.
// Since the "Gym mirror" redesign the hint and the form verdict are DOM elements (#hud-hint, #stat-form),
// not canvas fillText calls, so this records their changes with a MutationObserver installed by this
// harness — the app carries no test hook. The output format is unchanged. With DUMP_DIR=<dir> the page's
// ?trace=full record (every pose with visibility, raw and shown hint per frame) is saved as
// <dir>/<name>.json for tuning src/hints.ts.
//   node scripts/e2e-hints.mjs <url> <camDir> [name ...]     camDir holds <name>.mjpeg
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [url = "http://localhost:4177/", camDir = "tests/fixtures/clips/.mjpeg"] = process.argv.slice(2);
const only = process.argv.slice(4);
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CLIPS = { black: 4, "two-people": 7, "cropped-right": 6, frontal: 6, portrait: 8, IMG_1359: 19, IMG_1512: 35, ...Object.fromEntries((process.env.EXTRA ?? "").split(",").filter(Boolean).map((n) => [n, 6])) };
const TEXT_HOOK = () => {
  window.__texts = [];
  const WATCH = ["hud-hint", "stat-form"];
  // One sample per animation frame, recorded whether or not the value changed, so the timeline's
  // first/last/frames columns keep the same meaning they had when this read the canvas per draw.
  const sample = () => {
    const now = performance.now();
    for (const id of WATCH) {
      const el = document.getElementById(id);
      // data-state="out" is the 400 ms fade; the hint is already logically gone, so counting those
      // frames over-measured every hint's lastMs by up to 400 ms.
      if (!el || el.hidden || el.dataset.state === "out") continue;
      const text = (el.textContent ?? "").trim();
      if (text) window.__texts.push([now, text]);
    }
  };
  const start = () => {
    const tick = () => { sample(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
for (const [name, waitS] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(name)) continue;
  const file = join(camDir, `${name}.mjpeg`);
  if (!existsSync(file)) { console.log(`${name}: ${file} missing, skipped`); continue; }
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled", "--use-gl=angle", "--use-angle=metal", "--autoplay-policy=no-user-gesture-required", "--window-size=1000,1400",
      "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${file}`] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1400 });
    await page.evaluateOnNewDocument(TEXT_HOOK);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${url}${url.includes("?") ? "&" : "?"}trace=full`, { waitUntil: "networkidle0" });
    await page.click("#start-camera");
    await page.waitForFunction(() => /pushup position|whole body/i.test(document.getElementById("status").textContent), { timeout: 120_000 });
    const start = await page.evaluate(() => performance.now());
    await sleep(waitS * 1000);
    const texts = await page.evaluate((s) => window.__texts.map(([t, x]) => [Math.round(t - s), x]), start);
    const final = await page.evaluate(() => ({ good: document.getElementById("stat-good").textContent, total: document.getElementById("stat-total").textContent, form: document.getElementById("stat-form").textContent, fps: document.getElementById("stat-fps").textContent }));
    const seen = new Map();
    for (const [t, x] of texts) { if (/^\d+$/.test(x) || /^(—|clean|no pose)$/.test(x)) continue; const e = seen.get(x) ?? { first: t, last: t, n: 0 }; e.last = t; e.n++; seen.set(x, e); }
    const timeline = [...seen.entries()].map(([text, e]) => ({ text, firstMs: e.first, lastMs: e.last, frames: e.n })).sort((a, b) => a.firstMs - b.firstMs);
    out[name] = { final, timeline, errors };
    console.log(`${name}: final ${JSON.stringify(final)}\n  ${timeline.map((e) => `${e.firstMs}-${e.lastMs} ms (${e.frames}f) ${e.text}`).join("\n  ")}${errors.length ? `\n  errors: ${errors.join(" | ")}` : ""}`);
    if (process.env.DUMP_DIR) {
      mkdirSync(process.env.DUMP_DIR, { recursive: true });
      const trace = await page.evaluate(() => window.__pushupsTrace ?? []);
      writeFileSync(join(process.env.DUMP_DIR, `${name}.json`), JSON.stringify({ id: name, frames: trace }));
    }
  } finally {
    await browser.close();
  }
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out, null, 2));
