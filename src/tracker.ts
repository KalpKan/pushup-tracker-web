/**
 * The per-frame pipeline step shared by the page (session.ts) and the corpus test: feature vector +
 * classifier probability -> geometry rules -> rep counter. Keeping it here means the number the tests
 * measure is the number the page shows.
 */
import { assessFrame, geometry, type Geometry } from "./form";
import { CLASSIFIER_FAULT, createRepCounter, type CounterEvent, type RepState } from "./repCounter";

export interface TrackerInput {
  /** Seconds, monotonic. */
  t: number;
  /** The 36-float feature vector (features.ts). */
  vector: readonly number[];
  /** Classifier P(good) for this frame, or null when the classifier did not run. */
  prob: number | null;
  /** Frame width / height (MediaPipe normalises x and y by different lengths). */
  aspect: number;
}

export interface FrameVerdict {
  good: boolean;
  /** Reason shown to the visitor when bad. */
  reason: string | null;
  geometry: Geometry;
  plank: boolean;
}

export type TrackerEvent = CounterEvent;

/** Frames of the live verdict's majority window (about 0.25 s at 30 fps, 3 frames at 10 fps). */
const LIVE_WINDOW_S = 0.25;
const LIVE_MIN_FRAMES = 3;

export function createTracker() {
  const counter = createRepCounter();
  const live: { t: number; faults: string[] }[] = [];

  function push(input: TrackerInput): TrackerEvent | null {
    const g = geometry(input.vector, input.aspect);
    const form = assessFrame(g, input.prob);
    const shoulderY = (input.vector[13] + input.vector[16]) / 2;
    // A plank or a knee plank may serve as the top of a rep (the knee pushup is then graded "knees down").
    return counter.push({ t: input.t, shoulderY, scale: g.torso, plank: form.plank || form.kneePlank, faults: form.faults, bottomFaults: [], bottomProb: form.classifierBad == null ? null : input.prob });
  }

  /** Smoothed per-frame verdict for the overlay: majority of the last LIVE_WINDOW_S seconds (at least 3 frames). */
  function liveVerdict(input: TrackerInput): FrameVerdict {
    const g = geometry(input.vector, input.aspect);
    const form = assessFrame(g, input.prob);
    const faults: string[] = [...form.faults];
    if (form.classifierBad) faults.push(CLASSIFIER_FAULT);
    live.push({ t: input.t, faults });
    while (live.length > LIVE_MIN_FRAMES && live[0].t < input.t - LIVE_WINDOW_S) live.shift();
    const counts = new Map<string, number>();
    let bad = 0;
    for (const f of live) {
      if (f.faults.length) bad++;
      for (const x of f.faults) counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    const isBad = bad * 2 > live.length;
    const reason = isBad ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
    return { good: !isBad, reason, geometry: g, plank: form.plank };
  }

  function state(): RepState {
    return counter.state();
  }

  return { push, liveVerdict, state, counter };
}

export type Tracker = ReturnType<typeof createTracker>;
