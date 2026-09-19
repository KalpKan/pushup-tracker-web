/**
 * Geometric form rules on the 12-landmark feature vector (see features.ts for the order), independent of
 * the neural classifier. They exist because (measured on the corpus, 2026-09-18):
 *   - the original classifier called clean planks at the top "bad" (P(good) 0.13-0.25) and keyed on the
 *     legacy model's z; v2 (scripts/train_form_model.py) is consulted at the bottom of a rep only, where
 *     the training labels are meaningful, and only in the training orientation (see assessFrame): it does
 *     not transfer to another person's body (IMG_1359: nine clean reps scored 0.00);
 *   - a pike, kneeling and a frontal view are outside what the classifier saw;
 *   - the visitor needs a reason, which a probability cannot give.
 * Every measure is in units of the 2D torso length (shoulder to hip), so it does not depend on how far
 * the camera is. Thresholds come from the labelled tops/bottoms/not-reps of the 15 ground-truth clips
 * (tests/corpus.test.ts, tests/form.test.ts).
 */

export interface Geometry {
  /** 2D shoulder-hip distance in frame-height units (square pixels / height); the body scale everything is divided by. */
  torso: number;
  /** Angle of the shoulder-ankle line to the horizontal, degrees (plank 2-23, standing 32-81 on the corpus). */
  bodyAngle: number;
  /** Shoulder-hip-ankle angle, degrees (180 = straight). */
  hipAngle: number;
  /** Hip-knee-ankle angle, degrees (180 = straight leg). */
  kneeAngle: number;
  /** Wrist-elbow-shoulder angle, degrees (180 = straight arm). */
  elbowAngle: number;
  /** Signed hip distance from the shoulder-ankle line in torso units; > 0 = hips below the line (sag), < 0 = hips above (pike). */
  hipDev: number;
  /** true when the feet are on the left of the shoulders in the raw frame, which is what the classifier was trained on. */
  trainingOrientation: boolean;
}

export type Fault = "hips sagging" | "hips too high" | "knees down" | "keep your body straight";

export interface FrameForm {
  /** Faults from the geometric rules; apply at the top and the bottom of a rep. */
  faults: Fault[];
  /** Classifier verdict, only meaningful at the bottom; null when there is no probability or the orientation is outside the training data. */
  classifierBad: boolean | null;
  /** Body roughly horizontal with straight legs: eligible as the top (or bottom) of a pushup. */
  plank: boolean;
}

// Tuned on the corpus in square (aspect-corrected) units: good reps keep the hip deviation within
// [-0.21, +0.15]; the pike is -0.27/-0.33, a downward dog -0.54..-0.19, the sagging training clip
// +0.17..+0.25; kneeling knees are <= 116 deg, straight legs >= 155; tops sit at a body angle
// <= 23 deg, standing is 32-81 deg.
export const PIKE_DEV = -0.26;
export const SAG_DEV = 0.18;
export const KNEE_DOWN_DEG = 130;
export const PLANK_MAX_BODY_DEG = 30;

type P = { x: number; y: number };
/** Mean of the left/right pair `i` (0 wrists, 2 elbows, 4 shoulders, 6 hips, 8 knees, 10 ankles) in square units: x is multiplied by the frame aspect (width / height) so a horizontal and a vertical distance mean the same number of pixels. */
const pair = (v: readonly number[], i: number, aspect: number): P => ({ x: (aspect * (v[i * 3] + v[i * 3 + 3])) / 2, y: (v[i * 3 + 1] + v[i * 3 + 4]) / 2 });
const angle = (a: P, b: P, c: P): number => {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (!n) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n))) * 180) / Math.PI;
};

/**
 * Geometry of one frame from the 36-float feature vector (wrists, elbows, shoulders, hips, knees, ankles;
 * L then R; x, y, z). `aspect` = frame width / height, because MediaPipe normalises x by the width and y by
 * the height; without it a 4:3 webcam and a 16:9 clip would measure the same body differently.
 */
export function geometry(v: readonly number[], aspect: number): Geometry {
  const wrist = pair(v, 0, aspect), elbow = pair(v, 2, aspect), shoulder = pair(v, 4, aspect), hip = pair(v, 6, aspect), knee = pair(v, 8, aspect), ankle = pair(v, 10, aspect);
  const torso = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y) || 1e-6;
  const dx = ankle.x - shoulder.x, dy = ankle.y - shoulder.y;
  const L = Math.hypot(dx, dy) || 1e-6;
  // Cross product gives the signed distance of the hip from the shoulder->ankle line; flip the sign with
  // the facing so that "hips below the line" (larger y, since y grows downwards) is always positive.
  const cross = (dx * (hip.y - shoulder.y) - dy * (hip.x - shoulder.x)) / L;
  const facing = ankle.x > shoulder.x ? 1 : -1;
  return {
    torso,
    bodyAngle: (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI,
    hipAngle: angle(shoulder, hip, ankle),
    kneeAngle: angle(hip, knee, ankle),
    elbowAngle: angle(wrist, elbow, shoulder),
    hipDev: (cross * facing) / torso,
    trainingOrientation: facing === -1,
  };
}

/** Rule verdict for one frame. `prob` is the classifier's P(good form) or null. */
export function assessFrame(g: Geometry, prob: number | null): FrameForm {
  const faults: Fault[] = [];
  if (g.kneeAngle < KNEE_DOWN_DEG) faults.push("knees down");
  if (g.hipDev < PIKE_DEV) faults.push("hips too high");
  else if (g.hipDev > SAG_DEV) faults.push("hips sagging");
  // The classifier saw one person from one side: measured on the corpus, it scores the other person's clean
  // reps 0.00-0.05 (IMG_1359, IMG_1512) whichever way the features are mirrored, so it is only trusted when
  // the visitor is set up the way the training clips were (feet on the left of the raw frame); otherwise
  // the geometry rules alone grade the form.
  const classifierBad = prob == null || !g.trainingOrientation ? null : prob <= 0.5;
  const plank = g.bodyAngle <= PLANK_MAX_BODY_DEG && g.kneeAngle >= KNEE_DOWN_DEG;
  return { faults, classifierBad, plank };
}
