// Runs the LIVE camera path of the site against every ground-truth clip by feeding the clip to Chrome's
// fake camera (--use-file-for-fake-video-capture), then compares the on-screen counts with
// tests/fixtures/clips/ground_truth.json. This is the consumer-grade test for "counts pushups correctly
// in real time from a webcam" (docs/reports/pushups-spec.md in the portfolio repo, stories S2-S5).
//
//   node scripts/make-mjpeg.mjs                         # once: builds tests/fixtures/clips/.mjpeg/*.mjpeg
//   GPU=1 node scripts/e2e-corpus.mjs [url] [clip ...]  # default url http://localhost:4177/
//
// GPU=1 uses the Mac's real GPU (ANGLE/Metal), which is what a visitor gets; without it Chrome renders
// with SwiftShader and the pose model runs at a few fps, so the count is not representative.
// REPORT_ONLY=1 prints the table without failing the process. Results are written to
// tests/fixtures/results/<timestamp>.json (git-ignored) so a fixer can diff rounds.
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gt = JSON.parse(readFileSync(join(root, "tests/fixtures/clips/ground_truth.json"), "utf8"));
const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith("http")) ?? "http://localhost:4177/";
const wanted = new Set(args.filter((a) => !a.startsWith("http")));
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const gl = process.env.GPU ? ["--use-gl=angle", "--use-angle=metal"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const tol = gt.total_tolerance ?? 1;

async function runClip(clip) {
  const mjpeg = join(root, "tests/fixtures/clips/.mjpeg", `${clip.id}.mjpeg`);
  if (!existsSync(mjpeg)) return { id: clip.id, skipped: `${mjpeg} missing (run scripts/make-mjpeg.mjs)` };
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled", ...gl, "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${mjpeg}`, "--autoplay-policy=no-user-gesture-required", "--window-size=1000,1400",
      ...(process.env.HOST_RULES ? [`--host-resolver-rules=${process.env.HOST_RULES}`] : [])],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36");
    await page.setViewport({ width: Number(process.env.WIDTH ?? 1000), height: 1400 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.click("#start-camera");
    // The status flips to the positioning hint right after video.play(); the fake camera started at getUserMedia.
    await page.waitForFunction(() => /pushup position|whole body/i.test(document.getElementById("status").textContent), { timeout: 120_000 });
    const t0 = Date.now();
    const fpsSamples = [];
    const forms = [];
    const budget = clip.duration_s * 1000 + 1500;
    while (Date.now() - t0 < budget) {
      await new Promise((r) => setTimeout(r, 1000));
      const s = await page.evaluate(() => ({ fps: document.getElementById("stat-fps").textContent, form: document.getElementById("stat-form").textContent }));
      const f = parseInt(s.fps, 10);
      if (!Number.isNaN(f)) fpsSamples.push(f);
      forms.push(s.form.split(" ")[0]);
    }
    const stats = await page.evaluate(() => ({
      good: Number(document.getElementById("stat-good").textContent),
      attempts: Number(document.getElementById("stat-total").textContent),
      status: document.getElementById("status").textContent,
    }));
    if (process.env.SHOT_DIR) { mkdirSync(process.env.SHOT_DIR, { recursive: true }); await page.screenshot({ path: join(process.env.SHOT_DIR, `${clip.id}.png`), fullPage: true }); }
    const fpsAvg = fpsSamples.length ? Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length) : null;
    const goodOk = stats.good >= clip.good_min - tol && stats.good <= clip.good_max + tol;
    const totalOk = Math.abs(stats.attempts - clip.total) <= tol;
    return { id: clip.id, committed: clip.committed, expected: { total: clip.total, good: [clip.good_min, clip.good_max] }, got: { total: stats.attempts, good: stats.good },
      fpsAvg, fpsMin: fpsSamples.length ? Math.min(...fpsSamples) : null, formPerSecond: forms.join(""), totalOk, goodOk, pass: totalOk && goodOk, errors };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const clip of gt.clips) {
  if (wanted.size && !wanted.has(clip.id)) continue;
  const r = await runClip(clip);
  results.push(r);
  if (r.skipped) console.log(`${clip.id.padEnd(16)} SKIP ${r.skipped}`);
  else console.log(`${clip.id.padEnd(16)} ${r.pass ? "PASS" : "FAIL"}  total ${r.got.total} (want ${r.expected.total}±${tol})  good ${r.got.good} (want ${r.expected.good[0]}-${r.expected.good[1]}±${tol})  fps avg ${r.fpsAvg} min ${r.fpsMin}${r.errors.length ? `  errors: ${r.errors.length}` : ""}`);
}
const ran = results.filter((r) => !r.skipped);
const passed = ran.filter((r) => r.pass).length;
console.log(`\n${passed}/${ran.length} clips within tolerance (${url}, ${process.env.GPU ? "GPU" : "SwiftShader"})`);
const outDir = join(root, "tests/fixtures/results");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(outFile, JSON.stringify({ url, gpu: Boolean(process.env.GPU), date: new Date().toISOString(), passed, ran: ran.length, results }, null, 2));
console.log(`written ${outFile}`);
if (!process.env.REPORT_ONLY && passed !== ran.length) process.exit(1);
