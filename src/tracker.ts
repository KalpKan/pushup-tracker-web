/**
 * The per-frame pipeline step shared by the page (session.ts) and the corpus test: feature vector ->
 * geometry rules -> rep counter. Keeping it here means the number the tests measure is the number the page
 * shows. There is no neural classifier in the loop any more (form.ts explains why).
 */
import { assessFrame, bottomFaults, bottomMetrics, geometry, type Geometry } from "./form";
import { createRepCounter, type CounterEvent, type RepState } from "./repCounter";

export interface TrackerInput {
  /** Seconds, monotonic. */
  t: number;
  /** The 36-float feature vector (features.ts). */
  vector: readonly number[];
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

/** The live verdict is the majority of the last LIVE_WINDOW_S seconds (at least 3 frames). */
const LIVE_WINDOW_S = 0.25;
const LIVE_MIN_FRAMES = 3;

export function createTracker() {
  const counter = createRepCounter({ judgeBottom: (means) => bottomFaults({ elbowAhead: means.elbowAhead, wristBelow: means.wristBelow, hipBelowShoulder: means.hipBelowShoulder, kneeAngle: means.kneeAngle }) });
  const live: { t: number; faults: string[] }[] = [];

  function push(input: TrackerInput): TrackerEvent | null {
    const g = geometry(input.vector, input.aspect);
    const form = assessFrame(g);
    const shoulderY = (input.vector[13] + input.vector[16]) / 2;
    // A plank or a knee plank may serve as the top of a rep (the knee pushup is then graded "knees down").
    return counter.push({ t: input.t, shoulderY, scale: g.torso, plank: form.plank || form.kneePlank, faults: form.faults, bottomFaults: [], bottomMetrics: bottomMetrics(g) });
  }

  /**
   * Smoothed per-frame verdict for the overlay: the geometry faults that apply anywhere in a rep (sag, pike,
   * knees), by majority over the last LIVE_WINDOW_S seconds. The bottom-only rules are judged per rep by the
   * counter on the bottom window's mean and shown with the rep's result, never frame by frame.
   */
  function liveVerdict(input: TrackerInput): FrameVerdict {
    const g = geometry(input.vector, input.aspect);
    const form = assessFrame(g);
    live.push({ t: input.t, faults: [...form.faults] });
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
