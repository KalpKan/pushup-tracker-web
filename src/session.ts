/**
 * One tracking session: a video source (webcam or the bundled demo clip) -> PoseLandmarker ->
 * 12-landmark features -> tracker (geometry rules + rep counter) -> canvas overlay. Loaded lazily (dynamic
 * import) so the ~20 MB of WASM + pose model only download on the first click.
 */
import { loadPoseLandmarker } from "./pose";
import { features, type Point3 } from "./features";
import { createTracker, type FrameVerdict } from "./tracker";
import { KNEE_DOWN_DEG, PIKE_DEV, SAG_DEV, type Geometry } from "./form";
import type { RepEvent, RepState } from "./repCounter";
import { placementHint, pausesCounting, createHintDebouncer, mainFirst, HINTS } from "./hints";
import { draw } from "./draw";

export type Mode = "camera" | "demo";

export interface SessionOptions {
  mode: Mode;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  onStatus: (text: string) => void;
  onRep: (event: RepEvent) => void;
  /**
   * `hint` is the placement hint on screen; `paused` says the counter is not counting (then `verdict` is
   * null); `result` is the rep that just finished (or a too-shallow dip), held for REP_HOLD_MS so the
   * overlay and the HUD show the same thing for the same length of time.
   */
  onFrame: (state: RepState, verdict: FrameVerdict | null, fps: number, hint: string | null, paused: boolean, result: RepResult | null) => void;
  onEnd: () => void;
  /** The frame loop threw (a bad model, a lost WebGL context, ...): the session is already stopped. */
  onError: (err: Error) => void;
}

export interface Session {
  stop(): void;
}

const DEMO_SRC = "/demo/pushups.mp4";
/** A placement problem must persist this long before the overlay shows it (and be gone this long before it hides). */
const HINT_DEBOUNCE_MS = 700;
/**
 * How long the result of the rep that just finished holds both the skeleton's colour and the HUD's
 * verdict plate. One constant, so the two can never disagree.
 */
export const REP_HOLD_MS = 1500;

/** The rep that just finished. `reason` is null for a clean rep and "go lower" for a dip too shallow to count. */
export interface RepResult {
  good: boolean;
  reason: string | null;
}
/** Landmarks with a lower mean visibility of shoulders + hips are not fed to the counter. */
const MIN_VISIBILITY = 0.5;

type Landmark = Point3 & { visibility?: number };

export async function startSession(opts: SessionOptions): Promise<Session> {
  const { mode, video, canvas } = opts;
  opts.onStatus("Loading the pose model (about 20 MB the first time, then cached)…");
  const pose = await loadPoseLandmarker();

  // Compile the GPU shaders on a blank frame now, not on the visitor's first rep (the first
  // detectForVideo used to take ~1 s, during which the demo clip's first rep went by unseen).
  const warm = document.createElement("canvas");
  warm.width = 64;
  warm.height = 64;
  let lastStamp = performance.now();
  try {
    pose.detectForVideo(warm, lastStamp);
  } catch (err) {
    console.warn("pose warm-up failed", err);
  }

  let stream: MediaStream | null = null;
  if (mode === "camera") {
    opts.onStatus("Asking for the camera…");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = stream;
    video.loop = false;
  } else {
    video.srcObject = null;
    video.src = DEMO_SRC;
    video.loop = false;
  }
  video.muted = true;
  video.playsInline = true;
  await video.play();
  await new Promise<void>((resolve) => {
    if (video.videoWidth) resolve();
    else video.addEventListener("loadedmetadata", () => resolve(), { once: true });
  });
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  const aspect = video.videoWidth / video.videoHeight;

  const lum = document.createElement("canvas");
  lum.width = 16;
  lum.height = 9;
  const lumCtx = lum.getContext("2d", { willReadFrequently: true });
  let lastLumAt = 0;
  let luminance: number | null = null;
  function measureLuminance(now: number): number | null {
    if (!lumCtx || now - lastLumAt < 500) return luminance;
    lastLumAt = now;
    lumCtx.drawImage(video, 0, 0, 16, 9);
    const d = lumCtx.getImageData(0, 0, 16, 9).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    luminance = sum / (d.length / 4) / 255;
    return luminance;
  }

  const tracker = createTracker();
  // ?trace in the URL records every analysed frame (time, shoulder height, landmarks, faults) into
  // window.__pushupsTrace so scripts/e2e-corpus.mjs can save it next to the Python traces. Nothing leaves the page.
  const traceMode = new URLSearchParams(location.search).get("trace");
  const trace: TraceFrame[] | null = traceMode != null ? [] : null;
  // ?trace=full also keeps every detected pose (33 x [x, y, z, visibility]) and the raw hint per frame, for tuning hints.ts.
  const fullTrace = traceMode === "full";
  if (trace) window.__pushupsTrace = trace;
  const mirror = mode === "camera";
  let running = true;
  let frames = 0;
  let fpsStart = performance.now();
  let fps = 0;
  const hints = createHintDebouncer(HINT_DEBOUNCE_MS);
  const pauseGate = createHintDebouncer(HINT_DEBOUNCE_MS);
  let held: { good: boolean; reason: string | null; until: number } | null = null;
  opts.onStatus(mode === "camera" ? "Get into pushup position side-on to the camera, whole body in frame." : "Running the bundled clip.");

  function pickPose(poses: Landmark[][]): Landmark[] | null {
    if (!poses.length) return null;
    // With a bystander in the frame, track the biggest body (the one nearest the camera).
    let best = poses[0];
    let bestSize = -1;
    for (const p of poses) {
      const size = Math.hypot(aspect * (p[11].x - p[23].x), p[11].y - p[23].y) + Math.hypot(aspect * (p[12].x - p[24].x), p[12].y - p[24].y);
      if (size > bestSize) {
        bestSize = size;
        best = p;
      }
    }
    return best;
  }

  function visible(p: Landmark[]): boolean {
    const v = [11, 12, 23, 24].reduce((a, i) => a + (p[i].visibility ?? 1), 0) / 4;
    return v >= MIN_VISIBILITY;
  }

  function step(now: number) {
    const stamp = Math.max(now, lastStamp + 1); // detectForVideo needs strictly increasing timestamps
    lastStamp = stamp;
    const result = pose.detectForVideo(video, stamp);
    const poses = result.landmarks as Landmark[][];
    const landmarks = pickPose(poses);
    // Placement first (both held with hysteresis, see hints.ts): the hint tells the visitor what to fix; while
    // the problem is one that makes a count meaningless (no body, two bodies, frontal, head or feet gone)
    // nothing is counted or graded, so a cropped or crowded frame cannot produce a silent wrong count
    // (TEST r2 D4/D5). A head merely touching the edge shows the hint and keeps counting.
    // The hint and the pause are judged on the body the counter tracks (mainFirst), not on whichever body
    // MediaPipe happened to list first.
    const hintInput = { poses: mainFirst(poses, landmarks), luminance: poses.length ? null : measureLuminance(now) };
    const rawHint = placementHint(hintInput);
    const hint = hints.next(rawHint, now);
    const paused = pauseGate.next(rawHint != null && pausesCounting(hintInput) ? "pause" : null, now) != null;
    let verdict: FrameVerdict | null = null;
    const seen = landmarks != null && visible(landmarks);
    if (landmarks && seen && !paused) {
      const f = features(landmarks);
      const input = { t: stamp / 1000, vector: f.vector, aspect };
      verdict = tracker.liveVerdict(input);
      const ev = tracker.push(input);
      if (trace) trace.push({ t: input.t, mediaTime: video.currentTime, shoulderY: f.shoulderY, features: f.vector.map((x) => Math.round(x * 1e4) / 1e4), faults: verdict.reason, plank: verdict.plank, event: ev ? (ev.kind === "rep" ? (ev.good ? "good" : `bad:${ev.reason}`) : "partial") : null, poses: poses.length });
      if (ev?.kind === "rep") {
        held = { good: ev.good, reason: ev.reason, until: now + REP_HOLD_MS };
        opts.onRep(ev);
      } else if (ev?.kind === "partial") {
        held = { good: false, reason: "go lower", until: now + REP_HOLD_MS };
      }
    }
    // Every analysed frame leaves a trace row, including a found-but-invisible body (round-4 critique: those
    // frames were missing from ?trace, so a replay had fewer frames than the page analysed).
    if (trace && (!seen || paused)) trace.push({ t: stamp / 1000, mediaTime: video.currentTime, shoulderY: null, features: null, faults: null, plank: false, event: null, poses: poses.length });
    if (trace && fullTrace) {
      const last = trace[trace.length - 1];
      if (last && last.t === stamp / 1000) {
        last.rawHint = rawHint;
        last.hint = hint;
        last.allPoses = poses.map((p) => p.map((l) => [Math.round(l.x * 1e3) / 1e3, Math.round(l.y * 1e3) / 1e3, Math.round(l.z * 1e3) / 1e3, Math.round((l.visibility ?? 1) * 1e3) / 1e3]));
      }
    }
    const st = tracker.state();
    const repResult: RepResult | null = held && held.until > now ? { good: held.good, reason: held.reason } : null;
    const shown = repResult ?? (verdict ? { good: verdict.good, reason: verdict.reason } : null);
    draw(ctx!, video, {
      landmarks,
      // While a rep's result is held, the skeleton shows that result: a red "hips sagging" plate over a
      // green body would be two answers to the same question.
      verdict: shown,
      mirror,
      paused: paused && landmarks != null,
      // The annotation explains whatever the plate is currently saying, so the two never disagree.
      annotation: !paused && verdict && landmarks && shown && !shown.good ? annotationFor(shown.reason, verdict.geometry, landmarks) : null,
    });
    frames++;
    if (now - fpsStart >= 1000) {
      fps = Math.round((frames * 1000) / (now - fpsStart));
      frames = 0;
      fpsStart = now;
    }
    opts.onFrame(st, verdict, fps, hint, paused, repResult);
  }

  // One analysis per decoded video frame: requestVideoFrameCallback where it exists (Chrome, Safari,
  // Edge), otherwise requestAnimationFrame gated on currentTime (Firefox). The old rAF loop analysed the
  // demo clip twice per frame ("60 fps" for a 30 fps file).
  const rvfc = typeof (video as HTMLVideoElement & { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === "function";
  let lastTime = -1;
  function schedule() {
    if (!running) return;
    if (rvfc) (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: (now: number) => void) => void }).requestVideoFrameCallback(loop);
    else requestAnimationFrame(loop);
  }
  function loop() {
    if (!running) return;
    if (video.ended) {
      stop();
      opts.onEnd();
      return;
    }
    // Ask for the next frame before doing this one's work, otherwise Chrome hands out only every other
    // frame of a 30 fps file (measured 67 ms between analyses with the request made afterwards).
    schedule();
    if (rvfc || (video.currentTime !== lastTime && video.readyState >= 2)) {
      lastTime = video.currentTime;
      // An exception here used to be swallowed by requestVideoFrameCallback: 254 of them per demo play, a
      // black stage and "0 good of 0" (TEST r2 D1). Stop and tell the visitor instead.
      try {
        step(performance.now());
      } catch (err) {
        stop();
        opts.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
  // The demo clip's `ended` can fire between frame callbacks; make sure the session closes.
  video.addEventListener("ended", () => { if (running) { stop(); opts.onEnd(); } }, { once: true });

  function stop() {
    if (!running) return;
    running = false;
    video.pause();
    if (stream) for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
    video.removeAttribute("src");
    pose.close();
  }

  schedule();
  return { stop };
}

/**
 * The joint that a held live fault is about, plus the number that made it one, for the one routed
 * annotation on the canvas (docs/design/spec.md §6, `technical-wireframe-info-layout`). Presentation
 * only: it reads the geometry the tracker already computed and changes no judgement. The bottom-window
 * faults ("dropped to the floor") are deliberately not annotated — no single frame's joint explains them.
 */
function annotationFor(reason: string | null, g: Geometry, p: readonly Landmark[]): { jx: number; jy: number; text: string } | null {
  const mid = (a: number, b: number) => ({ jx: (p[a].x + p[b].x) / 2, jy: (p[a].y + p[b].y) / 2 });
  // The verdict is a majority over the last 0.25 s, so a single frame can carry a fault whose joint is
  // momentarily back inside the threshold. Annotating that frame would print a number that contradicts
  // the page's own threshold table, so the annotation is shown only while THIS frame trips the rule.
  if (reason === "knees down" && g.kneeAngle < KNEE_DOWN_DEG) return { ...mid(25, 26), text: `KNEE ${Math.round(g.kneeAngle)} DEG` };
  if ((reason === "hips sagging" && g.hipDev > SAG_DEV) || (reason === "hips too high" && g.hipDev < PIKE_DEV)) {
    const sign = g.hipDev >= 0 ? "+" : "-";
    // Three decimals, not two: the annotation only appears once the threshold is passed, and "+0.18 T"
    // rounded down onto the table's own "> +0.18 T" read as if the rule had not been tripped.
    return { ...mid(23, 24), text: `HIP ${sign}${Math.abs(g.hipDev).toFixed(3)} T` };
  }
  return null;
}

export { HINTS };

export interface TraceFrame {
  t: number;
  /** ?trace=full only. */
  rawHint?: string | null;
  hint?: string | null;
  allPoses?: number[][][];
  mediaTime: number;
  shoulderY: number | null;
  features: number[] | null;
  faults: string | null;
  plank: boolean;
  event: string | null;
  poses: number;
}

// Exposed for manual diagnosis from the browser console (no effect on the app).
declare global {
  interface Window {
    __pushups?: { loadPoseLandmarker: typeof loadPoseLandmarker };
    __pushupsTrace?: TraceFrame[];
  }
}
window.__pushups = { loadPoseLandmarker };
