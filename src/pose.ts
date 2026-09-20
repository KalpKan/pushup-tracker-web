/**
 * MediaPipe PoseLandmarker (FULL model), VIDEO mode. Both the WASM runtime (/wasm, copied from
 * node_modules at build time) and the model (/models/pose_landmarker_full.task) are served by the
 * site itself, so nothing is fetched from a CDN. GPU delegate first, CPU if the GPU one fails.
 *
 * Why "full" (9.4 MB) and not "lite" (5.5 MB): the geometry thresholds (form.ts) and the ground-truth
 * traces (tests/fixtures/traces-browser*) were measured with the full network, the same one the Python
 * original's model_complexity=1 used; the lite network placed landmarks 0.05-0.1 off it on the same
 * frames (measured 2026-09-18 when it made the then classifier call every good frame "bad"; incident
 * in the portfolio repo's skills/portfolio-ops/incidents.md).
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
