/**
 * One tracking session: a video source (webcam or the bundled demo clip) -> PoseLandmarker ->
 * 12-landmark features -> scaler -> TF.js classifier -> rep counter -> canvas overlay.
 * Loaded lazily (dynamic import) so the ~20 MB of WASM + models only download on the first click.
 */
import { loadPoseLandmarker } from "./pose";
import { loadClassifier } from "./classifier";
import { features, type Point3 } from "./features";
import { scale } from "./scaler";
import { createRepCounter, type RepEvent, type RepState } from "./repCounter";
import { draw } from "./draw";

export type Mode = "camera" | "demo";

export interface SessionOptions {
  mode: Mode;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  onStatus: (text: string) => void;
  onRep: (event: RepEvent) => void;
  onFrame: (state: RepState, prob: number | null, fps: number) => void;
  onEnd: () => void;
}

export interface Session {
  stop(): void;
}

const DEMO_SRC = "/demo/pushups.mp4";

export async function startSession(opts: SessionOptions): Promise<Session> {
  const { mode, video, canvas } = opts;
  opts.onStatus("Loading the pose model (about 20 MB the first time, then cached)…");
  const [pose, classifier] = await Promise.all([loadPoseLandmarker(), loadClassifier()]);

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

  const counter = createRepCounter();
  const mirror = mode === "camera";
  let running = true;
  let lastTime = -1;
  let lastStamp = 0;
  let frames = 0;
  let fpsStart = performance.now();
  let fps = 0;
  opts.onStatus(mode === "camera" ? "Get into pushup position side-on to the camera, whole body in frame." : "Running the bundled clip.");

  function loop() {
    if (!running) return;
    if (video.ended) {
      stop();
      opts.onEnd();
      return;
    }
    if (video.currentTime !== lastTime && video.readyState >= 2) {
      lastTime = video.currentTime;
      // detectForVideo needs strictly increasing timestamps.
      const stamp = Math.max(performance.now(), lastStamp + 1);
      lastStamp = stamp;
      const result = pose.detectForVideo(video, stamp);
      const landmarks: Point3[] | null = result.landmarks[0] ?? null;
      let prob: number | null = null;
      if (landmarks) {
        const f = features(landmarks);
        prob = classifier.predict(scale(f.vector));
        const ev = counter.push({ shoulderY: f.shoulderY, good: prob > 0.5 });
        if (ev) opts.onRep(ev);
      }
      const st = counter.state();
      draw(ctx!, video, {
        landmarks,
        goodReps: st.goodReps,
        totalReps: st.totalReps,
        prob,
        mirror,
        hint: landmarks ? undefined : "Step back so your whole body is visible",
      });
      frames++;
      const now = performance.now();
      if (now - fpsStart >= 1000) {
        fps = Math.round((frames * 1000) / (now - fpsStart));
        frames = 0;
        fpsStart = now;
      }
      opts.onFrame(st, prob, fps);
    }
    requestAnimationFrame(loop);
  }

  function stop() {
    if (!running) return;
    running = false;
    video.pause();
    if (stream) for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
    video.removeAttribute("src");
    pose.close();
    classifier.dispose();
  }

  requestAnimationFrame(loop);
  return { stop };
}

// Exposed for manual diagnosis from the browser console (no effect on the app).
declare global {
  interface Window {
    __pushups?: { loadPoseLandmarker: typeof loadPoseLandmarker; loadClassifier: typeof loadClassifier };
  }
}
window.__pushups = { loadPoseLandmarker, loadClassifier };
