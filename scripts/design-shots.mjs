// Screenshots every designed state of the "Gym mirror" HUD, including the camera-on states, so a
// reviewer can see them without a webcam and a body on the floor.
//
// Playwright Chromium (playwright-core, reusing the browser already in the Playwright cache) is fed a
// ground-truth clip through Chrome's fake camera, exactly like scripts/e2e-corpus.mjs does:
//   --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture
//
//   npm run build && npx vite preview --port 4177 --strictPort &
//   node scripts/make-mjpeg.mjs                                   # once, builds the fake-camera clips
//   node scripts/design-shots.mjs [url] [outDir]                  # default localhost:4177, docs/images/redesign
//
// The rep-pulse still is taken with the CSS animation paused 40 ms in (its peak) and the page's 1.2 s
// safety timer stubbed out, because the real pulse is 180 ms and a screenshot cannot be that fast. Both
// overrides live in this harness, never in the app; the filename says the frame is frozen.
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.argv[2] ?? "http://localhost:4177/";
const outDir = resolve(process.argv[3] ?? join(root, "docs/images/redesign"));
const camDir = join(root, "tests/fixtures/clips/.mjpeg");
mkdirSync(outDir, { recursive: true });

const WIDE = { width: 1440, height: 900, deviceScaleFactor: 2 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 3 };

async function launch(clip) {
  const args = [
    "--use-gl=angle",
    process.env.GPU ? "--use-angle=metal" : "--use-angle=swiftshader",
    ...(process.env.GPU ? [] : ["--enable-unsafe-swiftshader"]),
    "--autoplay-policy=no-user-gesture-required",
  ];
  if (clip) {
    const file = join(camDir, `${clip}.mjpeg`);
    if (!existsSync(file)) throw new Error(`${file} missing — run: node scripts/make-mjpeg.mjs`);
    args.push("--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${file}`);
  }
  const opts = { headless: true, args };
  try {
    return await chromium.launch(opts);
  } catch {
    // No Playwright-managed Chromium in the cache: fall back to the system Chrome, like the other harnesses.
    return await chromium.launch({ ...opts, channel: "chrome" });
  }
}

const shots = [];

async function shot(name, { clip = null, viewport = WIDE, reducedMotion = "no-preference", init, prepare, waitFor, timeout = 90_000 } = {}) {
  const browser = await launch(clip);
  try {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor, reducedMotion });
    if (init) await context.addInitScript(init);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url, { waitUntil: "networkidle" });
    if (prepare) await prepare(page);
    if (clip) {
      await page.click("#start-camera");
      await page.waitForFunction(() => /pushup position|whole body/i.test(document.getElementById("status").textContent), null, { timeout });
    }
    if (waitFor) await page.waitForFunction(waitFor, null, { timeout, polling: 30 });
    const file = join(outDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: !clip });
    const state = await page.evaluate(() => ({
      good: document.getElementById("stat-good").textContent,
      attempts: document.getElementById("stat-total").textContent,
      form: document.getElementById("stat-form").textContent,
      fps: document.getElementById("stat-fps").textContent,
      hint: document.getElementById("hud-hint").hidden ? null : document.getElementById("hud-hint").textContent,
      tone: document.getElementById("hud-verdict").dataset.tone,
      rep: document.getElementById("stage").dataset.rep ?? null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    shots.push({ name, ...state, errors });
    console.log(name.padEnd(28), JSON.stringify(state), errors.length ? `errors: ${errors.length}` : "");
  } finally {
    await browser.close();
  }
}

// Freeze the 180 ms pulse at its peak so a screenshot can show it. Harness-only, two parts:
//   init  — stop the page's 1.2 s safety timer from clearing [data-rep] (a paused animation never fires
//           animationend, so that timer would otherwise win);
//   style — pause the animation 40 ms in, which is where the keyframe reaches full accent.
const freezePulseInit = () => {
  const real = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...rest) => real(fn, ms === 1200 || ms === 600 ? 600000 : ms, ...rest);
};
// The routed fault annotation is the only thing drawn with roundRect, so hooking it tells the harness
// which frame actually carries one (harness-only; the app has no test hook).
// It also freezes the clip on that frame (the annotation is gated on the frame's own geometry, so the
// next frame often no longer carries one and a screenshot would miss it).
const watchAnnotationInit = () => {
  const real = CanvasRenderingContext2D.prototype.roundRect;
  CanvasRenderingContext2D.prototype.roundRect = function (...a) {
    if (window.__ann == null) {
      window.__ann = performance.now();
      document.getElementById("video")?.pause();
    }
    return real.apply(this, a);
  };
};
const freezePulse = (page) => page.addStyleTag({ content: '.stage[data-rep="counted"]{animation-play-state:paused!important;animation-delay:-40ms!important}' });
const seenRep = () => document.getElementById("stage").dataset.rep === "counted";
const bad = () => document.getElementById("hud-verdict").dataset.tone === "bad";
const counted = () => Number(document.getElementById("stat-total").textContent) >= 1;
const hinted = () => !document.getElementById("hud-hint").hidden && document.getElementById("hud-hint").textContent.length > 0;
const annotated = () => window.__ann != null;
const isPaused = () => document.getElementById("hud-verdict").dataset.tone === "paused";

await shot("idle-1440");
await shot("idle-390", { viewport: PHONE });
await shot("counting-1440", { clip: "good_IMG_4378", waitFor: counted });
await shot("counting-390", { clip: "good_IMG_4378", viewport: PHONE, waitFor: counted });
await shot("rep-pulse-1440-frozen", { clip: "good_IMG_4378", init: freezePulseInit, prepare: freezePulse, waitFor: seenRep });
await shot("fault-1440", { clip: "bad_IMG_4470", waitFor: bad });
await shot("fault-390", { clip: "bad_IMG_4470", viewport: PHONE, waitFor: bad });
await shot("annotation-1440", { clip: "bad_IMG_4470", init: watchAnnotationInit, waitFor: annotated });
await shot("hint-1440", { clip: "IMG_1359", waitFor: hinted });
await shot("paused-1440", { clip: "IMG_1359", waitFor: isPaused });
await shot("reduced-motion-1440-frozen", { clip: "good_IMG_4378", reducedMotion: "reduce", init: freezePulseInit, waitFor: seenRep });

const failed = shots.filter((s) => s.errors.length);
console.log(`\n${shots.length} states captured into ${outDir}; ${failed.length} with console errors`);
if (failed.length) process.exitCode = 1;
