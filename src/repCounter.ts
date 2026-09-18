/**
 * Rep counter: a line-for-line port of the shoulder-height state machine in
 * test_pushup_form.py / scripts/real_time_pushup_form.py (KalpKan/AI-Pushup-Form-Tracker).
 *
 * The shoulders' normalised y is tracked; the running min/max define a "top" band (lowest 10 % of
 * the range) and a "bottom" band (highest 10 %). A rep is a top -> bottom -> top cycle. The first
 * 10 samples are ignored while the range settles. The original only counted a rep when the form
 * classifier said "good" at BOTH the top and the bottom; that is `goodReps`. This port also
 * reports the cycles that completed with bad form (`totalReps`, event `{ good: false }`) so the UI
 * can show attempts and analytics can count both, without changing the good-rep count.
 */
export interface RepSample {
  shoulderY: number;
  good: boolean;
}

export interface RepEvent {
  good: boolean;
  goodReps: number;
  totalReps: number;
}

export type Phase = "warming-up" | "top" | "descending" | "bottom" | "ascending";

export interface RepState {
  goodReps: number;
  totalReps: number;
  phase: Phase;
}

const WARMUP_FRAMES = 10;
const BAND = 0.1;

export function createRepCounter() {
  let goodReps = 0;
  let totalReps = 0;
  let topReached = false;
  let bottomReached = false;
  let goodTop = false;
  let goodBottom = false;
  let shoulderMin = Infinity;
  let shoulderMax = -Infinity;
  let thresholdsSet = false;
  let frameCounter = 0;
  let phase: Phase = "warming-up";

  function push(sample: RepSample): RepEvent | null {
    const { shoulderY, good } = sample;
    if (!thresholdsSet) {
      shoulderMin = shoulderY;
      shoulderMax = shoulderY;
      thresholdsSet = true;
    }
    shoulderMin = Math.min(shoulderMin, shoulderY);
    shoulderMax = Math.max(shoulderMax, shoulderY);
    const range = shoulderMax - shoulderMin;
    const topThreshold = shoulderMin + range * BAND;
    const bottomThreshold = shoulderMax - range * BAND;

    if (frameCounter < WARMUP_FRAMES) {
      frameCounter++;
      return null;
    }

    if (shoulderY < topThreshold) {
      if (!topReached) {
        topReached = true;
        goodTop = good;
      }
      phase = bottomReached ? "ascending" : "top";
    } else if (shoulderY > bottomThreshold) {
      if (topReached && !bottomReached) {
        bottomReached = true;
        goodBottom = good;
      }
      phase = "bottom";
    } else {
      phase = bottomReached ? "ascending" : topReached ? "descending" : phase;
    }

    if (topReached && bottomReached && shoulderY < topThreshold) {
      const isGood = goodTop && goodBottom;
      if (isGood) goodReps++;
      totalReps++;
      bottomReached = false;
      goodBottom = false;
      topReached = false;
      phase = "top";
      return { good: isGood, goodReps, totalReps };
    }
    return null;
  }

  function state(): RepState {
    return { goodReps, totalReps, phase };
  }

  return { push, state };
}

export type RepCounter = ReturnType<typeof createRepCounter>;
