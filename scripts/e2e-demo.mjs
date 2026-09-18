// End-to-end check with the real Chrome (headless): open the site, press "Play demo clip", let the
// 8.5 s clip run, print the counts and every host the page talked to. Used because the shared
// automation tab in a background window never loads <video> (Chrome defers media in hidden tabs).
//   node scripts/e2e-demo.mjs [url]        default http://localhost:4177/
//   GPU=1 uses the Mac's real GPU (ANGLE/Metal) instead of SwiftShader, which is what a visitor gets.
//   HOST_RULES="MAP pushups.kalpkan.com 216.198.79.65" works around a stale local DNS cache.
import puppeteer from "puppeteer-core";

const url = process.argv[2] ?? "http://localhost:4177/";
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: [...(process.env.GPU ? ["--use-gl=angle", "--use-angle=metal"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]), "--autoplay-policy=no-user-gesture-required", "--window-size=1000,1400", ...(process.env.HOST_RULES ? [`--host-resolver-rules=${process.env.HOST_RULES}`] : [])],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: process.env.WIDTH ? Number(process.env.WIDTH) : 1000, height: 1400 });
  const hosts = new Set();
  page.on("request", (r) => hosts.add(new URL(r.url()).host));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.click("#play-demo");
  const t0 = Date.now();
  // Headless Chrome renders WebGL in software, so pose detection runs at a few fps; slowing the clip
  // down (PLAYBACK_RATE, default 1) lets the loop see most frames, like a laptop GPU would at 1x.
  const rate = Number(process.env.PLAYBACK_RATE ?? "1");
  if (rate !== 1) {
    await page.waitForFunction(() => document.getElementById("video").currentSrc !== "", { timeout: 60_000 });
    await page.evaluate((r) => { document.getElementById("video").playbackRate = r; }, rate);
  }
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("Clip finished"), { timeout: 90_000 });
  const stats = await page.evaluate(() => ({
    good: document.getElementById("stat-good").textContent,
    attempts: document.getElementById("stat-total").textContent,
    form: document.getElementById("stat-form").textContent,
    fps: document.getElementById("stat-fps").textContent,
    status: document.getElementById("status").textContent,
    canvas: [document.getElementById("canvas").width, document.getElementById("canvas").height],
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  console.log(JSON.stringify({ url, seconds: Math.round((Date.now() - t0) / 100) / 10, ...stats, hosts: [...hosts], errors }, null, 2));
} finally {
  await browser.close();
}
