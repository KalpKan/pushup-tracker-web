/**
 * MediaPipe PoseLandmarker (lite model), VIDEO mode. Both the WASM runtime (/wasm, copied from
 * node_modules at build time) and the model (/models/pose_landmarker_lite.task) are served by the
 * site itself, so nothing is fetched from a CDN. GPU delegate first, CPU if the GPU one fails.
 */
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export type { PoseLandmarker };

export async function loadPoseLandmarker(): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks("/wasm");
  let lastError: unknown;
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate },
        runningMode: "VIDEO",
        numPoses: 1,
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
