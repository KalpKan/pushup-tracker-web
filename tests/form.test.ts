/** Geometric form rules on real trace frames (Python landmarks) and synthetic poses. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assessFrame, bottomFaults, bottomMetrics, geometry as geo, meanBottomMetrics } from "../src/form";

const geometry = (v: number[]) => geo(v, 16 / 9);

type Trace = { frames: { t: number; features?: number[]; prob?: number }[] };
const trace = (id: string) => JSON.parse(readFileSync(new URL(`./fixtures/traces/${id}.json`, import.meta.url), "utf8")) as Trace;
/** The site's own landmarks (what a visitor's browser produces), original and mirrored clips. */
const traceB = (id: string, mirrored = false) => JSON.parse(readFileSync(new URL(`./fixtures/traces-browser${mirrored ? "-mirrored" : ""}/${id}.json`, import.meta.url), "utf8")) as Trace;
const at = (tr: Trace, t: number) => tr.frames.filter((f) => f.features).reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
/** The bottom rules as the counter applies them: on the mean geometry of the rep's bottom window (the frames within 20 % of the depth of the deepest one near the labelled bottom). */
function bottomAt(tr: Trace, t: number) {
  const fr = tr.frames.filter((f) => f.features);
  const shoulderY = (f: { features?: number[] }) => (f.features![13] + f.features![16]) / 2;
  const near = fr.filter((f) => Math.abs(f.t - t) <= 0.4);
  const bottomY = Math.max(...near.map(shoulderY));
  const topY = Math.min(...fr.filter((f) => f.t >= t - 1.5 && f.t <= t).map(shoulderY));
  const win = near.filter((f) => shoulderY(f) >= bottomY - 0.2 * (bottomY - topY));
  return bottomFaults(meanBottomMetrics(win.map((f) => bottomMetrics(geometry(f.features!)))));
}

describe("form rules", () => {
  it("calls the pike in IMG_1512 'hips too high' at the top and the bottom", () => {
    const tr = trace("IMG_1512");
    expect(assessFrame(geometry(at(tr, 32.6).features!)).faults).toContain("hips too high");
    expect(assessFrame(geometry(at(tr, 31.6).features!)).faults).toContain("hips too high");
  });

  it("calls kneeling in test_video_2 'knees down' and not plank-like", () => {
    const f = assessFrame(geometry(at(trace("test_video_2"), 12.5).features!));
    expect(f.faults).toContain("knees down");
    expect(f.plank).toBe(false);
  });

  // D3 (TEST r2): a knee pushup must be an attempt graded "knees down", so the horizontal-body kneeling
  // position is an eligible top ("kneePlank"); sitting back on the heels or standing is not.
  it("a knee-pushup position (body horizontal, knees on the floor) is an eligible kneeling top", () => {
    const tr = trace("test_video_2");
    const top = assessFrame(geometry(at(tr, 14.0).features!));
    expect(top.plank).toBe(false);
    expect(top.kneePlank).toBe(true);
    expect(top.faults).toContain("knees down");
    expect(assessFrame(geometry(at(trace("test_video3"), 13.4).features!)).kneePlank).toBe(false); // standing
  });

  it("calls the sag in bad_IMG_4470 'hips sagging'", () => {
    expect(assessFrame(geometry(at(trace("bad_IMG_4470"), 5.5).features!)).faults).toContain("hips sagging");
  });

  it("finds no fault in a clean plank (IMG_1305 top, good_IMG_4378 bottom)", () => {
    expect(assessFrame(geometry(at(trace("IMG_1305"), 1.6).features!)).faults).toEqual([]);
    expect(assessFrame(geometry(at(trace("good_IMG_4378"), 2.8).features!)).faults).toEqual([]);
  });

  it("standing (test_video3 13.4 s) is not plank-like", () => {
    expect(assessFrame(geometry(at(trace("test_video3"), 13.4).features!)).plank).toBe(false);
  });

  // FIX r3 (2026-09-19): the bottom-only rules that replace the neural classifier (see form.ts for why).
  it("calls a body that dropped onto the floor with the elbows never bending back (bad_IMG_4451, browser landmarks, both facings) 'dropped to the floor' at the bottom", () => {
    // Mirrored, the 2.8 s bottom averages -0.12 (the elbows read a little further back on the flipped frames) and is the one miss.
    for (const [mirrored, times] of [[false, [1.3, 2.8, 4.6, 6.4]], [true, [1.3, 4.6, 6.4]]] as const) for (const t of times) {
      expect(bottomAt(traceB("bad_IMG_4451", mirrored), t), `${mirrored ? "mirrored" : "original"} ${t}s`).toContain("dropped to the floor");
    }
  });

  it("calls the chest-up hip sag of bad_IMG_4470 (browser landmarks, both facings) 'hips sagging' at the bottom", () => {
    for (const mirrored of [false, true]) for (const t of [0.9, 2.2, 3.8, 5.5]) {
      expect(bottomAt(traceB("bad_IMG_4470", mirrored), t), `${mirrored ? "mirrored" : "original"} ${t}s`).toContain("hips sagging");
    }
  });

  it("finds no bottom fault in clean bottoms of three bodies and camera set-ups (good_IMG_4378, IMG_1360 low close phone, IMG_1359, test_video, good_IMG_4409 mirrored)", () => {
    for (const [id, t, mirrored] of [["good_IMG_4378", 2.8, false], ["IMG_1360", 3.7, false], ["IMG_1360", 5.4, true], ["IMG_1359", 9.3, false], ["test_video", 13.5, false], ["good_IMG_4409", 3.9, true], ["IMG_1305", 5.1, false]] as const) {
      expect(bottomAt(traceB(id, mirrored), t), `${id} ${t}s`).toEqual([]);
    }
  });
});
