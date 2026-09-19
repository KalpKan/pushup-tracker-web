// Failure modes of the session (TEST r2 D1): (a) the versioned model path answered with the v1 (36-input)
// files, as a stale browser cache would; (b) the v1 files once, then the real ones (the loader must retry
// past the cache and recover); (c) an exception thrown inside the frame loop. Every case must end in a
// status message the visitor can act on, never in silent per-frame exceptions.
//   node scripts/e2e-failure-modes.mjs <url> <dir with a 36-input model.json + group1-shard1of1.bin> <outDir>
//   (the v1 files: git show 4f0708e:public/models/form/model.json, ...group1-shard1of1.bin)
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const [url, v1, out] = process.argv.slice(2);
async function run(name, setup) {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled", "--use-gl=angle", "--use-angle=metal", "--autoplay-policy=no-user-gesture-required", "--window-size=1000,1400"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1400 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  const modelRequests = [];
  await setup(page, modelRequests);
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.click("#play-demo");
  await new Promise((r) => setTimeout(r, 12000));
  const st = await page.evaluate(() => ({ status: document.getElementById("status").textContent, good: document.getElementById("stat-good").textContent, total: document.getElementById("stat-total").textContent, form: document.getElementById("stat-form").textContent, fps: document.getElementById("stat-fps").textContent, stopHidden: document.getElementById("stop").hidden, stageLive: document.getElementById("stage").classList.contains("live"), startDisabled: document.getElementById("start-camera").disabled }));
  await page.screenshot({ path: join(out, `d1-${name}.png`), fullPage: true });
  console.log(name, JSON.stringify({ st, modelRequests, errors: [...new Set(errors)].slice(0, 6), errorCount: errors.length }, null, 1));
  await browser.close();
}
await run("stale-v1-model", async (page, modelRequests) => {
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith("/models/form")) modelRequests.push(`${p} cache=${r.headers()["cache-control"] ?? "-"}`);
    if (p === "/models/form-v2/model.json") return r.respond({ status: 200, contentType: "application/json", body: readFileSync(join(v1, "model.json")) });
    if (p === "/models/form-v2/group1-shard1of1.bin") return r.respond({ status: 200, contentType: "application/octet-stream", body: readFileSync(join(v1, "group1-shard1of1.bin")) });
    r.continue();
  });
});
await run("stale-then-fresh", async (page, modelRequests) => {
  // First request from "cache" = v1; the reload request (cache: reload) gets the real file -> must self-heal.
  let n = 0;
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith("/models/form")) modelRequests.push(`${p} n=${++n}`);
    if (p === "/models/form-v2/model.json" && n <= 1) return r.respond({ status: 200, contentType: "application/json", body: readFileSync(join(v1, "model.json")) });
    if (p === "/models/form-v2/group1-shard1of1.bin" && n <= 2) return r.respond({ status: 200, contentType: "application/octet-stream", body: readFileSync(join(v1, "group1-shard1of1.bin")) });
    r.continue();
  });
});
await run("loop-throws", async (page) => {
  await page.evaluateOnNewDocument(() => {
    let calls = 0;
    const o = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...a) { if (a[0] instanceof HTMLVideoElement && ++calls === 40) throw new Error("injected loop failure"); return o.apply(this, a); };
  });
});
