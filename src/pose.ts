/**
 * MediaPipe PoseLandmarker (FULL model), VIDEO mode. Both the WASM runtime (/wasm, copied from
 * node_modules at build time) and the model (/models/pose_landmarker_full.task) are served by the
 * site itself, so nothing is fetched from a CDN. GPU delegate first, CPU if the GPU one fails.
 *
 * Why "full" (9.4 MB) and not "lite" (5.5 MB): the form classifier was trained on landmarks from the
 * legacy Python solution at model_complexity=1, which is the "full" network. The lite network puts
 * the z coordinates 0.05-0.1 off (1-2 scaler standard deviations), and on the demo clip the
 * classifier then called every good frame "bad" (p 0.03-0.4 where Python said 0.85-0.98). With the
 * full model the per-frame probabilities agree with Python on 19 of 21 sampled frames
 * (measured 2026-09-18, incident in the portfolio repo's skills/portfolio-ops/incidents.md).
 */
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export type { PoseLandmarker };

export async function loadPoseLandmarker(): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks("/wasm");
  let lastError: unknown;
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/models/pose_landmarker_full.task", delegate },
        runningMode: "VIDEO",
        numPoses: 2, // a second body is reported so the overlay can say "one person"; the biggest body is tracked
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (err) {
      lastError = err;
      console.warn(`PoseLandmarker ${delegate} delegate failed`, err);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("PoseLandmarker failed to start");
}
