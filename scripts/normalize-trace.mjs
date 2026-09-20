// Turns a raw page trace saved by scripts/e2e-corpus.mjs (TRACE_DIR) into the committed fixture format of
// tests/fixtures/traces-browser*/: frames with landmarks only, `t` = the clip's own clock (mediaTime, seconds),
// features rounded to 4 decimals, plus a one-line `source` describing how it was recorded.
//   node scripts/normalize-trace.mjs <in.json> <out.json> "<source description>"
import { readFileSync, writeFileSync } from "node:fs";
const [inFile, outFile, source] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(inFile, "utf8"));
const frames = raw.frames.filter((f) => f.features).map((f) => ({ t: Math.round(f.mediaTime * 1000) / 1000, features: f.features }));
writeFileSync(outFile, JSON.stringify({ id: raw.id, source, width: 640, height: 360, frames }));
console.log(`${outFile}: ${frames.length} frames, ${frames[0]?.t}-${frames[frames.length - 1]?.t} s`);
