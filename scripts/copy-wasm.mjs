// Copies the MediaPipe vision WASM runtime from node_modules into public/wasm so the site serves
// it itself (no CDN, no network calls after load). Runs before every build.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const dst = join(root, "public/wasm");
mkdirSync(dst, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
  copyFileSync(join(src, f), join(dst, f));
}
console.log("copied MediaPipe WASM runtime to public/wasm");
