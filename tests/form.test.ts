/** Geometric form rules on real trace frames (Python landmarks) and synthetic poses. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assessFrame, geometry as geo } from "../src/form";

const geometry = (v: number[]) => geo(v, 16 / 9);

type Trace = { frames: { t: number; features?: number[]; prob?: number }[] };
const trace = (id: string) => JSON.parse(readFileSync(new URL(`./fixtures/traces/${id}.json`, import.meta.url), "utf8")) as Trace;
const at = (tr: Trace, t: number) => tr.frames.filter((f) => f.features).reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));

describe("form rules", () => {
  it("calls the pike in IMG_1512 'hips too high' at the top and the bottom", () => {
    const tr = trace("IMG_1512");
    expect(assessFrame(geometry(at(tr, 32.6).features!), 1).faults).toContain("hips too high");
    expect(assessFrame(geometry(at(tr, 31.6).features!), 1).faults).toContain("hips too high");
  });

  it("calls kneeling in test_video_2 'knees down' and not plank-like", () => {
    const f = assessFrame(geometry(at(trace("test_video_2"), 12.5).features!), 1);
    expect(f.faults).toContain("knees down");
    expect(f.plank).toBe(false);
  });

  it("calls the sag in bad_IMG_4470 'hips sagging'", () => {
    expect(assessFrame(geometry(at(trace("bad_IMG_4470"), 5.5).features!), 0).faults).toContain("hips sagging");
  });

  it("finds no fault in a clean plank (IMG_1305 top, good_IMG_4378 bottom)", () => {
    expect(assessFrame(geometry(at(trace("IMG_1305"), 1.6).features!), 1).faults).toEqual([]);
    expect(assessFrame(geometry(at(trace("good_IMG_4378"), 2.8).features!), 1).faults).toEqual([]);
  });

  it("standing (test_video3 13.4 s) is not plank-like", () => {
    expect(assessFrame(geometry(at(trace("test_video3"), 13.4).features!), 1).plank).toBe(false);
  });

  it("trusts the classifier only in the training orientation (feet left of the shoulders) and with a probability", () => {
    expect(assessFrame(geometry(at(trace("good_IMG_4378"), 2.8).features!), 0.1).classifierBad).toBe(true);
    expect(assessFrame(geometry(at(trace("good_IMG_4378"), 2.8).features!), 0.9).classifierBad).toBe(false);
    expect(assessFrame(geometry(at(trace("IMG_1512"), 32.6).features!), 0.1).classifierBad).toBe(null);
    expect(assessFrame(geometry(at(trace("good_IMG_4378"), 2.8).features!), null).classifierBad).toBe(null);
  });
});
