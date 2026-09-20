/**
 * Camera-placement hints from one pose result (pure; createHintDebouncer below holds them for 700 ms).
 * Priority: nothing/too dark > two people > head or feet out of frame > frontal view.
 */
export interface HintLandmark { x: number; y: number; visibility?: number }
export interface HintInput {
  poses: readonly (readonly HintLandmark[])[];
  /** Mean luminance of the frame, 0..1, or null when not measured. */
  luminance: number | null;
}

const L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24, L_ANKLE = 27, R_ANKLE = 28;
/** Nose, eyes, ears and mouth: MediaPipe indexes 0-10. */
const HEAD = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const EDGE = 0.02;
const MIN_VIS = 0.5;
export const DARK_LUMINANCE = 0.12;
/**
 * A second pose counts as another person only when its torso is at least this fraction of the first's and
 * its box overlaps the first's by less than SECOND_PERSON_MAX_OVERLAP. Measured on the fake cameras
 * (2026-09-19): two real people side by side give a torso ratio of 0.72-1.0 and no overlap; the phantom
 * MediaPipe returns for one body lying flat (IMG_1512 3.8-5.0 s, TEST r2 D6) is 0.15-0.56x inside the
 * same box (overlap >= 0.94).
 */
export const SECOND_PERSON_MIN_TORSO = 0.4;
export const SECOND_PERSON_MAX_OVERLAP = 0.5;

export const HINTS = {
  dark: "Too dark: turn a light on or uncover the camera",
  noPose: "Step back so your whole body is visible",
  head: "Head out of frame: move the camera back or tilt it up",
  feet: "Feet out of frame: move the camera back",
  twoPeople: "Only one person in the frame, please",
  frontal: "Turn side-on to the camera",
} as const;

/**
 * A landmark this far beyond the frame (or invisible) means the body part is really gone, not just touching
 * the edge: Kalp's own clips dip the nose to x = 1.03 at the bottom of clean reps, which deserves the hint
 * but not a pause.
 */
const FAR = 0.06;
const outside = (p: HintLandmark) => p.x < EDGE || p.x > 1 - EDGE || p.y < EDGE || p.y > 1 - EDGE || (p.visibility ?? 1) < MIN_VIS;
const beyond = (p: HintLandmark) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || (p.visibility ?? 1) < MIN_VIS;
const farOutside = (p: HintLandmark) => p.x < -FAR || p.x > 1 + FAR || p.y < -FAR || p.y > 1 + FAR || (p.visibility ?? 1) < MIN_VIS;
const mid = (a: HintLandmark, b: HintLandmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const torsoLength = (p: readonly HintLandmark[]) => { const s = mid(p[L_SHOULDER], p[R_SHOULDER]), h = mid(p[L_HIP], p[R_HIP]); return Math.hypot(s.x - h.x, s.y - h.y); };
/**
 * A cut-off head cannot be told from a head touching the edge by coordinates alone: MediaPipe guesses the
 * face just past the edge in both cases (IMG_1359 with the head really out of the frame puts the nose at
 * y -0.01; Kalp's test_video with the face at the right edge and still visible puts it at x 1.03). What
 * differs is the guessed head's SIZE: with the head really gone the 11 face landmarks collapse to a cluster
 * 0.04-0.13 torso lengths across (ear midpoint to nose), against 0.15-0.35 for a visible head (measured on
 * the ?trace=full dumps of test_video, test_video_2, good_IMG_4378 and IMG_1359, TEST r3 D3, 2026-09-19).
 */
export const HEAD_MIN_SIZE = 0.13;
const HEAD_MIN_BEYOND = 6;
export function headOut(p: readonly HintLandmark[]): boolean {
  if (HEAD.filter((i) => p[i] && beyond(p[i])).length < HEAD_MIN_BEYOND) return false;
  const nose = p[0], ear = mid(p[7], p[8]);
  const size = Math.hypot(ear.x - nose.x, ear.y - nose.y) / (torsoLength(p) || 1e-6);
  return size < HEAD_MIN_SIZE;
}
const box = (p: readonly HintLandmark[]) => ({ x0: Math.min(...p.map((l) => l.x)), y0: Math.min(...p.map((l) => l.y)), x1: Math.max(...p.map((l) => l.x)), y1: Math.max(...p.map((l) => l.y)) });
/** Intersection area over the smaller box's area (0 = apart, 1 = one inside the other). */
function overlap(a: readonly HintLandmark[], b: readonly HintLandmark[]): number {
  const A = box(a), B = box(b);
  const inter = Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0)) * Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0));
  const smaller = Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (B.x1 - B.x0) * (B.y1 - B.y0));
  return smaller > 0 ? inter / smaller : 0;
}

/** True when `other` is a different body from `main`, not a phantom detection inside it. */
export function isSecondPerson(main: readonly HintLandmark[], other: readonly HintLandmark[]): boolean {
  if (main.length < 29 || other.length < 29) return false;
  const tm = torsoLength(main), to = torsoLength(other);
  const ratio = Math.min(tm, to) / (Math.max(tm, to) || 1e-6);
  return ratio >= SECOND_PERSON_MIN_TORSO && overlap(main, other) < SECOND_PERSON_MAX_OVERLAP;
}

export function placementHint(input: HintInput): string | null {
  if (!input.poses.length) return input.luminance != null && input.luminance < DARK_LUMINANCE ? HINTS.dark : HINTS.noPose;
  const [p, ...rest] = input.poses;
  if (p.length < 29) return HINTS.noPose;
  if (rest.some((q) => isSecondPerson(p, q))) return HINTS.twoPeople;
  // Most of the head past the edge AND collapsed to a fraction of its size (see headOut): a face merely
  // touching the edge keeps its size and gets no hint (TEST r3 D3: a permanent false hint on test_video).
  if (headOut(p)) return HINTS.head;
  if (outside(p[L_ANKLE]) && outside(p[R_ANKLE])) return HINTS.feet;
  // Frontal: the shoulders are wide apart compared with the shoulder-hip distance (side-on they overlap).
  const shoulderW = Math.hypot(p[L_SHOULDER].x - p[R_SHOULDER].x, p[L_SHOULDER].y - p[R_SHOULDER].y);
  const torso = torsoLength(p);
  if (torso > 0 && shoulderW > 0.6 * torso) return HINTS.frontal;
  return null;
}

/**
 * Holds hints with hysteresis: ANY problem present for `holdMs` shows the latest hint (a half-detected body
 * that alternates between "no pose" and "head out" every frame used to reset a per-text timer and never
 * showed anything, TEST r2 D4); while a hint is up, a changed problem replaces the text at once and only
 * `holdMs` of continuous clean frames clears it.
 */
export function createHintDebouncer(holdMs: number) {
  let problemSince: number | null = null;
  let cleanSince: number | null = null;
  let shown: string | null = null;
  return {
    next(raw: string | null, now: number): string | null {
      if (raw != null) {
        cleanSince = null;
        if (problemSince == null) problemSince = now;
        if (shown != null || now - problemSince >= holdMs) shown = raw;
      } else {
        problemSince = null;
        if (shown != null) {
          if (cleanSince == null) cleanSince = now;
          if (now - cleanSince >= holdMs) {
            shown = null;
            cleanSince = null;
          }
        }
      }
      return shown;
    },
  };
}

/**
 * Whether the placement problem makes any count meaningless, so the session pauses the counter while the
 * (debounced) hint is up: no body, two bodies, a frontal view, or a head or both feet well outside the
 * frame (MediaPipe then guesses the shoulders or ankles the counter reads; TEST r2 D4 counted "Rep 1: good"
 * on a body with no head in the frame). A head or foot merely touching the edge shows the hint only.
 */
export function pausesCounting(input: HintInput): boolean {
  if (!input.poses.length) return true;
  const [p, ...rest] = input.poses;
  if (p.length < 29) return true;
  if (rest.some((q) => isSecondPerson(p, q))) return true;
  if (headOut(p) && HEAD.some((i) => p[i] && farOutside(p[i]))) return true;
  if (farOutside(p[L_ANKLE]) && farOutside(p[R_ANKLE])) return true;
  return placementHint({ poses: [p], luminance: input.luminance }) === HINTS.frontal;
}
