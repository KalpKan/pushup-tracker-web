/**
 * Feature extraction, identical to the Python scripts in KalpKan/AI-Pushup-Form-Tracker:
 * 12 MediaPipe pose landmarks, in this exact order, each as (x, y, z) => 36 floats.
 * MediaPipe landmark ids: 11 L shoulder, 12 R shoulder, 13 L elbow, 14 R elbow, 15 L wrist,
 * 16 R wrist, 23 L hip, 24 R hip, 25 L knee, 26 R knee, 27 L ankle, 28 R ankle.
 */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export const LANDMARK_INDEXES: readonly number[] = [15, 16, 13, 14, 11, 12, 23, 24, 25, 26, 27, 28];
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

export interface Features {
  /** 36 floats in the order the model was trained on. */
  vector: number[];
  /** Average of the two shoulders' normalised y (0 = top of the frame); drives the rep counter. */
  shoulderY: number;
}

export function features(landmarks: readonly Point3[]): Features {
  if (landmarks.length < 29) throw new Error(`expected the 33-point MediaPipe pose, got ${landmarks.length} points`);
  const vector: number[] = [];
  for (const i of LANDMARK_INDEXES) {
    const p = landmarks[i];
    vector.push(p.x, p.y, p.z);
  }
  const shoulderY = (landmarks[LEFT_SHOULDER].y + landmarks[RIGHT_SHOULDER].y) / 2;
  return { vector, shoulderY };
}
