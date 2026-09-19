/**
 * Rep counter: a time-based zig-zag on the shoulders' normalised height, scaled by the body.
 *
 * The original (KalpKan/AI-Pushup-Form-Tracker) used 10 % bands on the all-time min/max after a 10-frame
 * warm-up. On the ground-truth corpus that lost the first rep of almost every set (the plank at the start
 * never registered as a top), let one overshoot make the bands unreachable, and made the count depend on
 * the frame rate. This version:
 *   - has no warm-up: the first plank-like sample is the top reference;
 *   - confirms a descent once the shoulders have dropped by at least MIN_DEPTH torso lengths below the
 *     top (later: half of the median depth of the last reps), so a partial dip is not a rep;
 *   - counts the rep when the shoulders have come back up RETURN_FRACTION of that rep's own depth, so a
 *     deeper or shallower rep, a drifting top or a moved camera cannot poison the next one;
 *   - only lets plank-like samples move the top reference or open a descent, so standing up, kneeling
 *     to rest, sitting back or walking into the frame never look like a rep;
 *   - judges the form at each end on the majority of the frames spent there, not one frame;
 *   - holds back a sample that jumps by more than a rep's minimum depth until the next one agrees, so a
 *     single glitched landmark frame is neither a rep nor a new top.
 * All decisions are on time (seconds) and body-scaled distances, never on frame counts.
 */
export interface RepSample {
  /** Seconds (any monotonic clock). */
  t: number;
  /** Mean shoulder y in normalised frame units (0 = top of the frame). */
  shoulderY: number;
  /** Body scale: 2D torso length in the same units. */
  scale: number;
  /** Whether this frame may serve as the top of a pushup (see form.ts). */
  plank: boolean;
  /** Faults that apply at the top and the bottom. */
  faults: readonly string[];
  /** Faults that apply only at the bottom (the classifier's verdict). */
  bottomFaults: readonly string[];
  /** Classifier P(good) for this frame, averaged over the bottom window (null = not consulted). */
  bottomProb?: number | null;
}

export interface RepEvent {
  kind: "rep";
  t: number;
  good: boolean;
  /** The most frequent fault of the failing end, or null for a good rep. */
  reason: string | null;
  goodReps: number;
  totalReps: number;
  /** Depth of this rep in torso lengths (diagnostics). */
  depth: number;
}

export interface PartialEvent {
  kind: "partial";
  t: number;
}

export type CounterEvent = RepEvent | PartialEvent;

export type Phase = "waiting" | "top" | "descending" | "bottom" | "ascending";

export interface RepState {
  goodReps: number;
  totalReps: number;
  phase: Phase;
}

/** Minimum depth of a rep in torso lengths before any rep has been seen (corpus, square units: real reps 0.33-0.86, partials and kneel bounces <= 0.15, one 0.30 partial that flows into a full rep). */
export const MIN_DEPTH = 0.25;
/** Once reps have been seen, a rep must be at least this fraction of their median depth. */
export const LEARNED_DEPTH_FRACTION = 0.5;
/** A rep is complete when the shoulders are back up this fraction of the rep's own depth. */
export const RETURN_FRACTION = 0.65;
/** Frames within this fraction of the depth from an extreme make up that end's form window. */
const END_WINDOW = 0.2;
/** A dip of at least this fraction of the minimum depth that turns back up is reported as a partial. */
const PARTIAL_FRACTION = 0.5;
const MAX_WINDOW = 400;
/** Fault name for a classifier "bad" at the bottom (shared with tracker.ts). */
export const CLASSIFIER_FAULT = "keep your body straight";

interface Frame { t: number; y: number; faults: readonly string[]; bottomFaults: readonly string[]; prob: number | null }

export function createRepCounter() {
  let goodReps = 0;
  let totalReps = 0;
  let phase: Phase = "waiting";
  let topY = 0;
  let topT = 0;
  let bottomY = 0;
  let bottomT = 0;
  let maxDip = 0;
  let partialSent = false;
  let upFrames: Frame[] = [];
  let downFrames: Frame[] = [];
  const depths: number[] = [];
  let lastY: number | null = null;
  let pending: RepSample | null = null;

  function minDepth(scale: number): number {
    const base = MIN_DEPTH * scale;
    if (!depths.length) return base;
    const sorted = [...depths].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return Math.max(base, LEARNED_DEPTH_FRACTION * median);
  }

  /**
   * Outlier rejection: a sample that jumps by more than the minimum rep depth from the last accepted one
   * is held back until the next sample says whether the body really moved (the next sample is nearer the
   * held one than the old level: accept both, one sample late) or the frame was a glitch (the next sample
   * is back near the old level: drop it). No lag on normal movement, unlike a 3-sample median, which
   * clipped the extremes of a fast rep at 10-15 fps and made the count frame-rate dependent on IMG_1305.
   */
  function push(sample: RepSample): CounterEvent | null {
    const need = minDepth(sample.scale);
    const y = sample.shoulderY;
    if (pending) {
      const held = pending;
      pending = null;
      if (lastY == null || Math.abs(y - held.shoulderY) <= Math.abs(y - lastY)) {
        const ev = process(held);
        // Two events one sample apart cannot happen (a rep needs a descent and an ascent), so one return is enough.
        return process(sample) ?? ev;
      }
    } else if (lastY != null && Math.abs(y - lastY) > need) {
      pending = sample;
      return null;
    }
    return process(sample);
  }

  /**
   * Majority verdict over a window of frames: the most frequent fault when more than half the frames
   * carry one, else null. At the bottom the classifier's probability is averaged over the window (a mean
   * is steadier than a per-frame vote near 0.5) and counts as CLASSIFIER_FAULT when <= 0.5.
   */
  function verdict(frames: Frame[], bottom: boolean): string | null {
    if (!frames.length) return null;
    const counts = new Map<string, number>();
    let badFrames = 0;
    for (const f of frames) {
      const faults = bottom ? [...f.faults, ...f.bottomFaults] : f.faults;
      if (faults.length) badFrames++;
      for (const x of faults) counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    if (badFrames * 2 > frames.length) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (bottom) {
      const probs = frames.map((f) => f.prob).filter((p): p is number => p != null);
      if (probs.length * 2 >= frames.length && probs.reduce((a, b) => a + b, 0) / probs.length <= 0.5) return CLASSIFIER_FAULT;
    }
    return null;
  }

  function keep(list: Frame[], f: Frame): void {
    list.push(f);
    if (list.length > MAX_WINDOW) list.splice(0, list.length - MAX_WINDOW);
  }

  function process(sample: RepSample): CounterEvent | null {
    const y = sample.shoulderY;
    const need = minDepth(sample.scale);
    lastY = y;
    const frame: Frame = { t: sample.t, y, faults: sample.faults, bottomFaults: sample.bottomFaults, prob: sample.bottomProb ?? null };

    if (phase === "waiting") {
      if (!sample.plank) return null;
      phase = "top";
      topY = y;
      topT = sample.t;
      upFrames = [frame];
      return null;
    }

    if (phase === "top" || phase === "ascending") {
      // Following the shoulders up: only plank-like frames may raise the top reference.
      if (y < topY) {
        if (!sample.plank) return null;
        topY = y;
        topT = sample.t;
        maxDip = 0;
        partialSent = false;
      }
      keep(upFrames, frame);
      const dip = y - topY;
      // Only a plank-like frame can open a descent: shoulders dropping while kneeling or sitting back
      // are not a pushup (IMG_1513 7.7 s counted as an attempt in the browser without this).
      if (dip >= need && sample.plank) {
        phase = "descending";
        bottomY = y;
        bottomT = sample.t;
        downFrames = [frame];
        maxDip = 0;
        partialSent = false;
        return null;
      }
      if (dip > maxDip) maxDip = dip;
      if (!partialSent && maxDip >= PARTIAL_FRACTION * need && dip <= maxDip * 0.5) {
        partialSent = true;
        return { kind: "partial", t: sample.t };
      }
      phase = "top";
      return null;
    }

    // descending / bottom / ascending-back-up: track the deepest point, count on the way back.
    keep(downFrames, frame);
    if (y > bottomY) {
      bottomY = y;
      bottomT = sample.t;
      phase = "descending";
    }
    const depth = bottomY - topY;
    const rise = bottomY - y;
    if (rise >= RETURN_FRACTION * depth) {
      const topWindow = upFrames.filter((f) => f.y <= topY + END_WINDOW * depth);
      const bottomWindow = downFrames.filter((f) => f.y >= bottomY - END_WINDOW * depth);
      const reason = verdict(topWindow.length ? topWindow : upFrames.slice(-3), false) ?? verdict(bottomWindow, true);
      const good = reason == null;
      totalReps++;
      if (good) goodReps++;
      depths.push(depth);
      if (depths.length > 5) depths.shift();
      phase = "ascending";
      topY = y;
      topT = sample.t;
      upFrames = [frame];
      downFrames = [];
      maxDip = 0;
      partialSent = false;
      return { kind: "rep", t: sample.t, good, reason, goodReps, totalReps, depth: depth / sample.scale };
    }
    phase = rise > 0.1 * depth ? "ascending" : "bottom";
    // Back near the top while ascending is handled above; a rise that never reaches RETURN_FRACTION but
    // then goes deeper simply extends the same rep.
    if (phase === "ascending") phase = "bottom";
    return null;
  }

  function state(): RepState {
    return { goodReps, totalReps, phase };
  }

  /** Diagnostics for the overlay/tests. */
  function debug() {
    return { topY, topT, bottomY, bottomT, depths: [...depths] };
  }

  return { push, state, debug };
}

export type RepCounter = ReturnType<typeof createRepCounter>;
