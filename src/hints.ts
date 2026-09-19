/**
 * Camera-placement hints from one pose result (pure; session.ts debounces them for a second before showing).
 * Priority: nothing/too dark > two people > head or feet out of frame > frontal view.
 */
export interface HintLandmark { x: number; y: number; visibility?: number }
export interface HintInput {
  poses: readonly (readonly HintLandmark[])[];
  /** Mean luminance of the frame, 0..1, or null when not measured. */
  luminance: number | null;
}

const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24, L_ANKLE = 27, R_ANKLE = 28;
const EDGE = 0.02;
const MIN_VIS = 0.5;
export const DARK_LUMINANCE = 0.12;

export const HINTS = {
  dark: "Too dark: turn a light on or uncover the camera",
  noPose: "Step back so your whole body is visible",
  head: "Head out of frame: move the camera back or tilt it up",
  feet: "Feet out of frame: move the camera back",
  twoPeople: "Only one person in the frame, please",
  frontal: "Turn side-on to the camera",
} as const;

const outside = (p: HintLandmark) => p.x < EDGE || p.x > 1 - EDGE || p.y < EDGE || p.y > 1 - EDGE || (p.visibility ?? 1) < MIN_VIS;

export function placementHint(input: HintInput): string | null {
  if (!input.poses.length) return input.luminance != null && input.luminance < DARK_LUMINANCE ? HINTS.dark : HINTS.noPose;
  if (input.poses.length > 1) return HINTS.twoPeople;
  const p = input.poses[0];
  if (p.length < 29) return HINTS.noPose;
  if (outside(p[NOSE])) return HINTS.head;
  if (outside(p[L_ANKLE]) && outside(p[R_ANKLE])) return HINTS.feet;
  // Frontal: the shoulders are wide apart compared with the shoulder-hip distance (side-on they overlap).
  const shoulderW = Math.hypot(p[L_SHOULDER].x - p[R_SHOULDER].x, p[L_SHOULDER].y - p[R_SHOULDER].y);
  const torso = Math.hypot((p[L_SHOULDER].x + p[R_SHOULDER].x) / 2 - (p[L_HIP].x + p[R_HIP].x) / 2, (p[L_SHOULDER].y + p[R_SHOULDER].y) / 2 - (p[L_HIP].y + p[R_HIP].y) / 2);
  if (torso > 0 && shoulderW > 0.6 * torso) return HINTS.frontal;
  return null;
}
