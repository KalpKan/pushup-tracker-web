/**
 * Geometric form rules on the 12-landmark feature vector (see features.ts for the order). They are the whole
 * form judgement since FIX r3 (2026-09-19); the neural classifier that used to vote at the bottom was retired:
 *   - trained on one person's 87 clips, it memorised them: held out honestly, it scored Kalp's own unseen bad
 *     clips 0.5-0.9 (a coin) and every clean rep of a second person 0.0-0.4, with raw coordinates or joint
 *     angles, with limb/perspective augmentation, on Python or on the browser's own landmarks;
 *   - its per-frame output swung 0.97 -> 0.01 between neighbouring frames, so the verdict depended on which
 *     frames the device decoded (TEST r3 D2), and the "training orientation" gate that hid the second person
 *     also switched it off for every visitor facing the other way (TEST r3 D1).
 * Every measure here is in units of the 2D torso length (shoulder to hip), so it does not depend on how far
 * the camera is, and every horizontal offset is signed by the facing, so it does not depend on which way the
 * visitor faces. Thresholds come from the labelled tops/bottoms/not-reps of the 15 ground-truth clips on three
 * landmark sets (Python, browser, browser mirrored: tests/corpus.test.ts, tests/form.test.ts).
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
  /** Elbow midpoint's horizontal offset from the shoulder midpoint towards the head, in torso units (a bent-back elbow is negative). */
  elbowAhead: number;
  /** Wrist midpoint below the shoulder midpoint, in torso units (how far the chest is above the hands). */
  wristBelow: number;
  /** Hip midpoint below the shoulder midpoint, in torso units. */
  hipBelowShoulder: number;
}

export type Fault = "hips sagging" | "hips too high" | "knees down" | "dropped to the floor";

export interface FrameForm {
  /** Faults from the geometric rules that apply at the top and the bottom of a rep. */
  faults: Fault[];
  /** Body roughly horizontal with straight legs: eligible as the top (or bottom) of a pushup. */
  plank: boolean;
  /**
   * Body roughly horizontal with the knees on the floor: the knee-pushup position. Eligible as a top too,
   * so a knee pushup is an attempt (graded "knees down"); sitting back on the heels or standing is not
   * (TEST r2 D3, 2026-09-19).
   */
  kneePlank: boolean;
}

// Tuned on the corpus in square (aspect-corrected) units: good reps keep the hip deviation within
// [-0.21, +0.15]; the pike is -0.27/-0.33, a downward dog -0.54..-0.19, the sagging training clip
// +0.17..+0.25; kneeling knees are <= 116 deg, straight legs >= 155; tops sit at a body angle
// <= 23 deg, standing is 32-81 deg.
export const PIKE_DEV = -0.26;
export const SAG_DEV = 0.18;
export const KNEE_DOWN_DEG = 130;
export const PLANK_MAX_BODY_DEG = 30;
/**
 * Bottom-only rules (browser landmarks, both facings; tests/form.test.ts):
 *   - dropped to the floor: the body came down without the elbows bending back, i.e. the elbows are still
 *     level with the shoulders at the bottom. Averaged over the bottom window, clean high-confidence bottoms
 *     put the elbow 0.14-0.54 torso behind the shoulder (the nearest being good_IMG_4409's flared elbows,
 *     mirrored); the collapses of bad_IMG_4451 (browser -0.04..-0.02, mirrored -0.12..-0.07), test_video
 *     3.5 s (-0.04) and test_video_2 8.5 s (+0.17) sit at or above -0.09. The legacy Python landmarks put
 *     bad_IMG_4451's elbows at -0.20..-0.16, so that set misses it (tests/corpus.test.ts says so).
 *   - hips sagging with the chest up: the chest stays 0.54-0.61 torso above the hands while the hips hang
 *     0.23-0.37 below the shoulders (bad_IMG_4470); clean bottoms bring the chest to <= 0.47 above the hands,
 *     and the low close phone of IMG_1360 puts its hips 0.12-0.24 below the shoulders with the chest at 0.44.
 */
export const COLLAPSE_ELBOW_AHEAD = -0.09;
export const CHEST_UP_WRIST_BELOW = 0.5;
export const CHEST_UP_HIP_BELOW = 0.2;

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
  // Unit x direction towards the head: the opposite of the feet.
  const head = -facing;
  return {
    torso,
    bodyAngle: (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI,
    hipAngle: angle(shoulder, hip, ankle),
    kneeAngle: angle(hip, knee, ankle),
    elbowAngle: angle(wrist, elbow, shoulder),
    hipDev: (cross * facing) / torso,
    elbowAhead: ((elbow.x - shoulder.x) * head) / torso,
    wristBelow: (wrist.y - shoulder.y) / torso,
    hipBelowShoulder: (hip.y - shoulder.y) / torso,
  };
}

/** Rule verdict for one frame. */
export function assessFrame(g: Geometry): FrameForm {
  const faults: Fault[] = [];
  const kneesDown = g.kneeAngle < KNEE_DOWN_DEG;
  if (kneesDown) faults.push("knees down");
  // The hip rules read the hip's distance from the shoulder-ankle line, which means nothing once the
  // knees are bent on the floor (a knee pushup measures as a -0.4 "pike"); the knees are the reason then.
  else if (g.hipDev < PIKE_DEV) faults.push("hips too high");
  else if (g.hipDev > SAG_DEV) faults.push("hips sagging");
  const horizontal = g.bodyAngle <= PLANK_MAX_BODY_DEG;
  return { faults, plank: horizontal && !kneesDown, kneePlank: horizontal && kneesDown };
}

/** The per-frame numbers the bottom rules read; the counter averages them over the bottom window of a rep. */
export const BOTTOM_METRICS = ["elbowAhead", "wristBelow", "hipBelowShoulder", "kneeAngle"] as const;
export type BottomMetrics = Record<(typeof BOTTOM_METRICS)[number], number>;
export const bottomMetrics = (g: Geometry): BottomMetrics => ({ elbowAhead: g.elbowAhead, wristBelow: g.wristBelow, hipBelowShoulder: g.hipBelowShoulder, kneeAngle: g.kneeAngle });

/**
 * Faults that only mean something at the bottom of a rep, judged on the MEAN of the bottom window's frames
 * (single frames put the elbow 0.1 torso either side of the mean). On the knees the arm and hip geometry is
 * meaningless, and the knees are already the reason.
 */
export function bottomFaults(m: BottomMetrics): Fault[] {
  if (m.kneeAngle < KNEE_DOWN_DEG) return [];
  if (m.elbowAhead > COLLAPSE_ELBOW_AHEAD) return ["dropped to the floor"];
  if (m.wristBelow > CHEST_UP_WRIST_BELOW && m.hipBelowShoulder > CHEST_UP_HIP_BELOW) return ["hips sagging"];
  return [];
}

/** Mean of several frames' bottom metrics. */
export function meanBottomMetrics(list: readonly BottomMetrics[]): BottomMetrics {
  const out = { elbowAhead: 0, wristBelow: 0, hipBelowShoulder: 0, kneeAngle: 0 };
  for (const m of list) for (const k of BOTTOM_METRICS) out[k] += m[k] / list.length;
  return out;
}
