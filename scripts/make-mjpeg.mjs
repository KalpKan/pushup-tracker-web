// Converts every clip in tests/fixtures/clips/ground_truth.json into the MJPEG file Chrome's fake camera
// plays (--use-file-for-fake-video-capture), 640x360 @ 30 fps, with 3 s of black frames appended so the
// looping fake device shows "no pose" between plays instead of jumping back to the first frame.
// Output: tests/fixtures/clips/.mjpeg/<id>.mjpeg (git-ignored; ~4-15 MB each). Needs the .venv's ffmpeg.
//   node scripts/make-mjpeg.mjs [id ...]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ffmpeg = execFileSync(join(root, ".venv/bin/python"), ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
const gt = JSON.parse(readFileSync(join(root, "tests/fixtures/clips/ground_truth.json"), "utf8"));
const outDir = join(root, "tests/fixtures/clips/.mjpeg");
mkdirSync(outDir, { recursive: true });
const wanted = new Set(process.argv.slice(2));
for (const clip of gt.clips) {
  if (wanted.size && !wanted.has(clip.id)) continue;
  const src = clip.path.startsWith("/") ? clip.path : join(root, clip.path);
  if (!existsSync(src)) { console.log(`skip ${clip.id}: ${src} not found`); continue; }
  const out = join(outDir, `${clip.id}.mjpeg`);
  // scale to 640x360 (pad if the aspect differs), 30 fps, then 3 s of black.
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", src, "-f", "lavfi", "-i", "color=black:s=640x360:r=30:d=3",
    "-filter_complex", "[0:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuvj420p[a];[a][1:v]concat=n=2:v=1:a=0",
    "-c:v", "mjpeg", "-q:v", "6", "-an", out]);
  console.log(`${clip.id}.mjpeg`);
}
