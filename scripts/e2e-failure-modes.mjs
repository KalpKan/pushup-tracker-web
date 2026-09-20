// Failure modes of the session: (a) an exception thrown inside the frame loop; (b) the pose model file
// missing (a 404 from the host, as a bad deploy would give). Every case must end in a status message the
// visitor can act on, never in silent per-frame exceptions (TEST r2 D1 found 254 of them per play when a
// stale cached classifier was fed to new code; the classifier is gone since FIX r3, the stop-and-tell path
// it forced is kept and exercised here).
//   node scripts/e2e-failure-modes.mjs <url> <outDir>
import puppeteer from "puppeteer-core";
import { join } from "node:path";
const [url, out] = process.argv.slice(2);
async function run(name, setup) {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled", "--use-gl=angle", "--use-angle=metal", "--autoplay-policy=no-user-gesture-required", "--window-size=1000,1400"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1400 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  const requests = [];
  await setup(page, requests);
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.click("#play-demo");
  await new Promise((r) => setTimeout(r, 12000));
  const st = await page.evaluate(() => ({ status: document.getElementById("status").textContent, good: document.getElementById("stat-good").textContent, total: document.getElementById("stat-total").textContent, form: document.getElementById("stat-form").textContent, fps: document.getElementById("stat-fps").textContent, stopHidden: document.getElementById("stop").hidden, stageLive: document.getElementById("stage").classList.contains("live"), startDisabled: document.getElementById("start-camera").disabled }));
  await page.screenshot({ path: join(out, `failure-${name}.png`), fullPage: true });
  console.log(name, JSON.stringify({ st, requests, errors: [...new Set(errors)].slice(0, 6), errorCount: errors.length }, null, 1));
  await browser.close();
}
await run("loop-throws", async (page) => {
  await page.evaluateOnNewDocument(() => {
    let calls = 0;
    const o = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...a) { if (a[0] instanceof HTMLVideoElement && ++calls === 40) throw new Error("injected loop failure"); return o.apply(this, a); };
  });
});
await run("pose-model-404", async (page, requests) => {
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith("/models/")) { requests.push(p); return r.respond({ status: 404, contentType: "text/plain", body: "gone" }); }
    r.continue();
  });
});
