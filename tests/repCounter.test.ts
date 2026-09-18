import { describe, expect, it } from "vitest";
import { createRepCounter } from "../src/repCounter";
import video3 from "./fixtures/test_video3_0-160.json";
import video2 from "./fixtures/test_video_2_1000-1408.json";

function replay(fixture: { frames: { frame: number; shoulderY: number | null; prob?: number }[] }) {
  const counter = createRepCounter();
  const events: { frame: number; good: boolean }[] = [];
  for (const f of fixture.frames) {
    if (f.shoulderY == null || f.prob == null) continue;
    const ev = counter.push({ shoulderY: f.shoulderY, good: f.prob > 0.5 });
    if (ev) events.push({ frame: f.frame, good: ev.good });
  }
  return { events, state: counter.state() };
}

describe("createRepCounter (port of test_pushup_form.py)", () => {
  it("counts a synthetic top-bottom-top wave with good form as good reps", () => {
    const counter = createRepCounter();
    let good = 0;
    // 10 warm-up frames are skipped by the original, so give it 3 slow reps of 40 frames each.
    for (let i = 0; i < 120; i++) {
      const y = 0.4 + 0.2 * (1 - Math.cos((2 * Math.PI * i) / 40)) / 2; // 0.4 at top, 0.6 at bottom
      const ev = counter.push({ shoulderY: y, good: true });
      if (ev?.good) good++;
    }
    expect(good).toBeGreaterThanOrEqual(2);
    expect(counter.state().goodReps).toBe(good);
    expect(counter.state().totalReps).toBe(good);
  });

  it("does not count a rep when the form was bad at the bottom", () => {
    const counter = createRepCounter();
    for (let i = 0; i < 120; i++) {
      const y = 0.4 + 0.2 * (1 - Math.cos((2 * Math.PI * i) / 40)) / 2;
      counter.push({ shoulderY: y, good: y < 0.5 }); // bad whenever low
    }
    expect(counter.state().goodReps).toBe(0);
    expect(counter.state().totalReps).toBeGreaterThanOrEqual(2);
  });

  it("matches the Python state machine on test_video3 frames 0-160 (2 good reps)", () => {
    const { events, state } = replay(video3);
    expect(events).toEqual(video3.events);
    expect(state.goodReps).toBe(video3.goodReps);
    expect(state.totalReps).toBe(video3.totalReps);
  });

  it("matches the Python state machine on test_video_2 frames 1000-1408 (1 bad rep)", () => {
    const { events, state } = replay(video2);
    expect(events).toEqual(video2.events);
    expect(state.goodReps).toBe(video2.goodReps);
    expect(state.totalReps).toBe(video2.totalReps);
  });
});
