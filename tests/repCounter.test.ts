import { describe, expect, it } from "vitest";
import { createRepCounter, type RepSample } from "../src/repCounter";

/** Synthetic shoulder-height wave: top at 0.3, bottom at 0.3 + amp; torso 0.28; plank-like unless said otherwise. */
function wave(opts: { reps: number; period: number; fps: number; amp?: number; faults?: (t: number) => string[]; bottomFaults?: (t: number) => string[]; bottomMetrics?: (t: number) => Record<string, number>; hold?: number }) {
  const { reps, period, fps, amp = 0.3, hold = 0.5 } = opts;
  const samples: RepSample[] = [];
  const n = Math.round((hold + reps * period + hold) * fps);
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const phase = t < hold ? 0 : t > hold + reps * period ? 0 : (t - hold) % period;
    const y = 0.3 + amp * (1 - Math.cos((2 * Math.PI * phase) / period)) / 2;
    samples.push({ t, shoulderY: y, scale: 0.28, plank: true, faults: opts.faults?.(t) ?? [], bottomFaults: opts.bottomFaults?.(t) ?? [], bottomMetrics: opts.bottomMetrics?.(t) });
  }
  return samples;
}

function run(samples: RepSample[], judgeBottom?: (means: Record<string, number>) => string[]) {
  const c = createRepCounter({ judgeBottom });
  const events = [];
  for (const s of samples) {
    const ev = c.push(s);
    if (ev && ev.kind === "rep") events.push(ev);
  }
  return { events, ...c.state() };
}

describe("createRepCounter (time-based, body-scaled)", () => {
  it("counts every rep of a clean set, including the first, as good", () => {
    const r = run(wave({ reps: 5, period: 1.2, fps: 30 }));
    expect(r.totalReps).toBe(5);
    expect(r.goodReps).toBe(5);
  });

  it("gives the same count at 30, 15 and 10 fps for fast reps (0.7 s)", () => {
    for (const fps of [30, 15, 10]) {
      const r = run(wave({ reps: 6, period: 0.7, fps }));
      expect(r.totalReps, `${fps} fps`).toBe(6);
    }
  });

  it("does not count a partial dip (a third of the range) but reports it as a partial", () => {
    const full = wave({ reps: 2, period: 1.2, fps: 30 });
    const partial = wave({ reps: 1, period: 1.2, fps: 30, amp: 0.1, hold: 0 }).map((s) => ({ ...s, t: s.t + full[full.length - 1].t + 1 / 30 }));
    const c = createRepCounter();
    const kinds: string[] = [];
    for (const s of [...full, ...partial]) {
      const ev = c.push(s);
      if (ev) kinds.push(ev.kind);
    }
    expect(c.state().totalReps).toBe(2);
    expect(kinds).toEqual(["rep", "rep", "partial"]);
  });

  it("does not count a rise that starts at the bottom (no top seen first)", () => {
    const s = wave({ reps: 2, period: 1.2, fps: 30, hold: 0 });
    // Start half a period in: the first sample is the bottom.
    const fromBottom = s.filter((x) => x.t >= 0.6).map((x) => ({ ...x, t: x.t - 0.6 }));
    const r = run(fromBottom);
    expect(r.totalReps).toBe(1);
  });

  it("ignores frames that are not plank-like for the top (standing up before and after)", () => {
    const s = wave({ reps: 2, period: 1.2, fps: 30, hold: 1 });
    // Standing: shoulders far above the plank, not plank-like.
    const standing = (t0: number) => Array.from({ length: 30 }, (_, i) => ({ t: t0 + i / 30, shoulderY: 0.05, scale: 0.28, plank: false, faults: [], bottomFaults: [] }));
    const r = run([...standing(-1), ...s, ...standing(s[s.length - 1].t + 1 / 30)]);
    expect(r.totalReps).toBe(2);
  });

  it("does not turn a drop onto the knees (non-plank frames) into a rep", () => {
    const s = wave({ reps: 1, period: 1.2, fps: 30, hold: 1 });
    // After the rep: shoulders drop 0.3 (a full rep's depth) while kneeling, then back up.
    const t0 = s[s.length - 1].t + 1 / 30;
    const kneel = Array.from({ length: 36 }, (_, i) => {
      const y = 0.3 + 0.3 * (1 - Math.cos((2 * Math.PI * i) / 36)) / 2;
      return { t: t0 + i / 30, shoulderY: y, scale: 0.28, plank: false, faults: ["knees down"], bottomFaults: [] };
    });
    const r = run([...s, ...kneel]);
    expect(r.totalReps).toBe(1);
  });

  // D3 (TEST r2): a knee pushup is an attempt (graded "knees down"); dropping from a plank onto the knees is not.
  it("counts a knee pushup (kneeling top, knees down throughout) as an attempt graded 'knees down'", () => {
    const r = run(wave({ reps: 2, period: 1.4, fps: 30, faults: () => ["knees down"] }));
    expect(r.totalReps).toBe(2);
    expect(r.goodReps).toBe(0);
    expect(r.events.map((e) => e.reason)).toEqual(["knees down", "knees down"]);
  });

  it("does not count a plank top that bottoms out on the knees (dropping to the knees to rest)", () => {
    const s = wave({ reps: 1, period: 1.4, fps: 30, hold: 1 });
    // Knees come down on the way down and stay down through the bottom and the rise.
    const bottomT = 1 + 0.7;
    for (const f of s) if (f.t > bottomT - 0.4) f.faults = ["knees down"];
    const r = run(s);
    expect(r.totalReps).toBe(0);
  });

  it("judges each end on the majority of its frames, not a single one", () => {
    // One noisy 'bad' frame at the very bottom of every rep must not flip the verdict.
    const r = run(wave({ reps: 3, period: 1.2, fps: 30, bottomFaults: (t) => (Math.abs(((t - 0.5) % 1.2) - 0.6) < 0.02 ? ["dropped to the floor"] : []) }));
    expect(r.goodReps).toBe(3);
  });

  it("ignores single-frame landmark spikes at the top and at the bottom", () => {
    for (const fps of [30, 10]) {
      const s = wave({ reps: 4, period: 1.0, fps, hold: 1 });
      // A spike during the first hold (shoulders 'jump' to the bottom for one frame) and one at the second rep's bottom (deeper).
      const spiked = s.map((x) => (Math.abs(x.t - 0.5) < 0.5 / fps ? { ...x, shoulderY: 0.9 } : Math.abs(x.t - 2.5) < 0.5 / fps ? { ...x, shoulderY: 0.95 } : x));
      const r = run(spiked);
      expect(r.totalReps, `${fps} fps`).toBe(4);
      expect(r.goodReps, `${fps} fps`).toBe(4);
    }
  });

  it("reports the reason of a bad rep", () => {
    const r = run(wave({ reps: 2, period: 1.2, fps: 30, faults: (t) => (t > 0.5 + 1.2 ? ["hips sagging"] : []) }));
    expect(r.totalReps).toBe(2);
    expect(r.goodReps).toBe(1);
    expect(r.events[1].reason).toBe("hips sagging");
  });

  // FIX r3 (2026-09-19): bottom-only rules run on the MEAN of the bottom window's metrics, so one noisy frame cannot decide them.
  it("judges the bottom-only rules on the mean of the bottom window's metrics, not on single frames", () => {
    // Elbow metric: -0.3 (fine) on every frame except a spike to +0.5 on the deepest frame of each rep -> the mean stays fine.
    const spiky = wave({ reps: 3, period: 1.2, fps: 30, bottomMetrics: (t) => ({ elbowAhead: Math.abs(((t - 0.5) % 1.2) - 0.6) < 0.02 ? 0.5 : -0.3 }) });
    const judge = (m: Record<string, number>) => (m.elbowAhead > -0.09 ? ["dropped to the floor"] : []);
    expect(run(spiky, judge).goodReps).toBe(3);
    // The same metric at 0.0 throughout the second rep's bottom -> that rep is bad with the rule's reason.
    const dropped = wave({ reps: 3, period: 1.2, fps: 30, bottomMetrics: (t) => ({ elbowAhead: t > 0.5 + 1.2 && t < 0.5 + 2.4 ? 0 : -0.3 }) });
    const r = run(dropped, judge);
    expect(r.goodReps).toBe(2);
    expect(r.events.map((e) => e.reason)).toEqual([null, "dropped to the floor", null]);
  });

  it("scales the minimum depth with the body: a rep of 0.35 torso counts, 0.15 torso does not", () => {
    expect(run(wave({ reps: 3, period: 1.2, fps: 30, amp: 0.28 * 0.35 })).totalReps).toBe(3);
    expect(run(wave({ reps: 3, period: 1.2, fps: 30, amp: 0.28 * 0.15 })).totalReps).toBe(0);
  });
});

describe("state().phase (round-4 critique: the Phase union must say what the counter does)", () => {
  it("reports 'bottom' all the way up until the rep counts, 'ascending' on the counting sample and 'top' after it", () => {
    const c = createRepCounter();
    const seen: { t: number; phase: string; rep: boolean }[] = [];
    for (const s of wave({ reps: 1, period: 1.2, fps: 30 })) {
      const ev = c.push(s);
      seen.push({ t: s.t, phase: c.state().phase, rep: ev?.kind === "rep" });
    }
    const repAt = seen.findIndex((x) => x.rep);
    expect(repAt).toBeGreaterThan(0);
    const bottomAt = seen.findIndex((x) => x.phase === "bottom");
    expect(bottomAt).toBeGreaterThan(0);
    expect(bottomAt).toBeLessThan(repAt);
    // Between the deepest point and the count: only "descending" (going deeper) or "bottom" (coming up
    // short of RETURN_FRACTION), never "ascending", which would end the rep in the next sample.
    for (const x of seen.slice(bottomAt, repAt)) expect(["descending", "bottom"], `t=${x.t.toFixed(2)}`).toContain(x.phase);
    expect(seen[repAt].phase).toBe("ascending");
    expect(seen[repAt + 1].phase).toBe("top");
    expect(c.state().totalReps).toBe(1);
  });
});
