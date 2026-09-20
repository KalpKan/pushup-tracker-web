// Records the site's OWN landmarks for the form classifier's training clips: every clip in Kalp's labelled
// data folders (data/good_form, data/bad_form; personal, not in the repo) is played into headless Chrome's
// fake camera against a build of the site (?trace), as is and flipped horizontally, and the 12-landmark
// vectors the page computed are written to tests/fixtures/training-browser/<label>/<id>[-flip].json in the
// format of scripts/make_training_landmarks.py (visibility is not recorded by ?trace and is written as 1).
//
// Why: v3 was trained on Python-extracted landmarks of one facing; on the browser's own landmarks (WebGL
// delegate, camera frames) the same reps scored 0.1-0.5 instead of 0.0, and facing the other way every
// bad rep was graded good (TEST r3 D1/D2, 2026-09-19). Training on what the page really sees, in both
// facings, removes that train/serve gap.
//
//   npm run build && npx vite preview --port 4177 --strictPort &
//   node scripts/record-training-landmarks.mjs [url] [--data DIR] [--lanes 3] [id ...]
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith("http")) ?? "http://localhost:4177/";
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const dataDir = opt("--data", "/Users/kalp/Desktop/Out and About/Sidequest/AI_Pushup_Tracking/data");
const lanes = Number(opt("--lanes", "3"));
const wanted = new Set(args.filter((a, i) => !a.startsWith("http") && !a.startsWith("--") && args[i - 1] !== "--data" && args[i - 1] !== "--lanes"));
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ffmpeg = execFileSync(join(root, ".venv/bin/python"), ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
const camDir = process.env.CAM_DIR ?? join(tmpdir(), "pushups-training-cams");
mkdirSync(camDir, { recursive: true });
const outRoot = join(root, "tests/fixtures/training-browser");

const jobs = [];
for (const label of ["good_form", "bad_form"]) {
  mkdirSync(join(outRoot, label), { recursive: true });
  for (const name of readdirSync(join(dataDir, label)).sort()) {
    if (!name.toLowerCase().endsWith(".mp4") || name.includes("(1)")) continue;
    const id = name.replace("Copy of ", "").replace(".mp4", "");
    if (wanted.size && !wanted.has(id)) continue;
    for (const flip of [false, true]) {
      const out = join(outRoot, label, `${id}${flip ? "-flip" : ""}.json`);
      if (existsSync(out)) continue;
      jobs.push({ label, id, flip, src: join(dataDir, label, name), out });
    }
  }
}
console.log(`${jobs.length} recordings to make (${lanes} lanes) via ${url}`);

function makeCam(job) {
  const file = join(camDir, `${job.id}${job.flip ? "-flip" : ""}.mjpeg`);
  if (!existsSync(file)) {
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", job.src, "-vf", `scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,${job.flip ? "hflip," : ""}fps=30,format=yuvj420p`, "-c:v", "mjpeg", "-q:v", "6", "-an", file]);
  }
  // Duration of the source clip from ffmpeg's own header dump (imageio's bundle has no ffprobe; raw MJPEG has no header).
  let info = "";
  try { execFileSync(ffmpeg, ["-i", job.src], { stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { info = String(e.stderr); }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const secs = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 15;
  return { file, secs };
}

async function record(job) {
  const { file, secs } = makeCam(job);
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled", "--use-gl=angle", "--use-angle=metal", "--autoplay-policy=no-user-gesture-required", "--window-size=1000,1400",
      "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${file}`] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1400 });
    await page.goto(`${url}${url.includes("?") ? "&" : "?"}trace`, { waitUntil: "networkidle0" });
    await page.click("#start-camera");
    await page.waitForFunction(() => /pushup position|whole body/i.test(document.getElementById("status").textContent), { timeout: 120_000 });
    await new Promise((r) => setTimeout(r, secs * 1000 + 300));
    const trace = await page.evaluate(() => window.__pushupsTrace ?? []);
    // The fake camera loops: keep the first pass only (mediaTime grows monotonically within it).
    const frames = [];
    let last = -1;
    for (const f of trace) {
      if (f.mediaTime < last) break;
      last = f.mediaTime;
      if (!f.features) continue;
      const lm = [];
      for (let i = 0; i < 12; i++) lm.push([f.features[i * 3], f.features[i * 3 + 1], f.features[i * 3 + 2], 1]);
      frames.push({ t: Math.round(f.mediaTime * 1000) / 1000, lm });
    }
    writeFileSync(job.out, JSON.stringify({ id: job.id, label: job.label, flip: job.flip, source: "browser (MediaPipe Tasks full, GPU delegate, fake camera 640x360 30 fps, scripts/record-training-landmarks.mjs)", fps: 30, width: 640, height: 360, frames }));
    console.log(`${job.label}/${job.id}${job.flip ? "-flip" : ""}: ${frames.length} frames over ${secs.toFixed(1)} s`);
  } finally {
    await browser.close();
  }
}

let next = 0;
async function lane() {
  while (next < jobs.length) {
    const job = jobs[next++];
    try { await record(job); } catch (err) { console.log(`${job.id}${job.flip ? "-flip" : ""}: FAILED ${err}`); }
  }
}
await Promise.all(Array.from({ length: lanes }, lane));
console.log("ALLDONE");
