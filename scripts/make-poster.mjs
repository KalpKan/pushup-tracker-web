// Regenerates public/poster.webp: the still that fills the stage before anything is started.
//
// It is not a mockup and not stock photography — it is a real frame of the bundled demo clip with the
// real skeleton this app draws on it, produced by driving the app itself. Chrome encodes the WebP
// (canvas.toDataURL), so no image tool is needed; ffmpeg on a Mac usually ships without libwebp.
//
//   npm run build && npx vite preview --port 4177 --strictPort &
//   node scripts/make-poster.mjs [url]        default http://localhost:4177/
//
// GPU=1 uses the Mac's real GPU (ANGLE/Metal); without it Chrome renders with SwiftShader and the pose
// model runs at a few fps, which still works here because we only need one good frame.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.argv[2] ?? "http://localhost:4177/";
const out = process.argv[3] ?? join(root, "public/poster.webp");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  ignoreDefaultArgs: ["--enable-automation"],
  args: [
    "--disable-blink-features=AutomationControlled",
    "--use-gl=angle",
    process.env.GPU ? "--use-angle=metal" : "--use-angle=swiftshader",
    ...(process.env.GPU ? [] : ["--enable-unsafe-swiftshader"]),
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1200,900",
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  await page.goto(`${url}${url.includes("?") ? "&" : "?"}trace`, { waitUntil: "networkidle0" });
  await page.click("#play-demo");

  // Take the first frame where the tracked body is a plank with no fault: that is the frame that shows a
  // visitor exactly what the tool does.
  let best = null;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !best) {
    best = await page.evaluate(() => {
      const trace = window.__pushupsTrace ?? [];
      const last = trace[trace.length - 1];
      if (!last || !last.plank || last.faults || last.shoulderY == null) return null;
      const c = document.getElementById("canvas");
      if (!c.width) return null;
      return { t: last.mediaTime, w: c.width, h: c.height, dataUrl: c.toDataURL("image/webp", 0.82) };
    });
    if (!best) await new Promise((r) => setTimeout(r, 80));
  }
  if (!best) throw new Error("no clean plank frame found in the demo clip");
  writeFileSync(out, Buffer.from(best.dataUrl.split(",")[1], "base64"));
  console.log(JSON.stringify({ out, mediaTime: best.t, size: [best.w, best.h], bytes: best.dataUrl.length }, null, 2));
} finally {
  await browser.close();
}
