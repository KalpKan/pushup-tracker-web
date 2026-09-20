/** Placement hints from a pose result (pure function, no DOM). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHintDebouncer, HINTS, pausesCounting, placementHint, type HintInput } from "../src/hints";

/** Real MediaPipe poses (33 x [x, y, z, visibility]) recorded from the site with ?trace=full (TEST r3 D3, 2026-09-19). */
const REAL = JSON.parse(readFileSync(new URL("./fixtures/head_edge_poses.json", import.meta.url), "utf8")) as Record<string, number[][]>;
const real = (key: string) => REAL[key].map(([x, y, z, visibility]) => ({ x, y, z, visibility }));

const lm = (over: Partial<Record<number, { x?: number; y?: number; visibility?: number }>> = {}) =>
  Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95, ...(over[i] ?? {}) }));
// A side-on plank: head right, feet left, all inside the frame.
const plank = () => lm({ 0: { x: 0.85, y: 0.45 }, 11: { x: 0.75, y: 0.5 }, 12: { x: 0.76, y: 0.52 }, 23: { x: 0.5, y: 0.55 }, 24: { x: 0.51, y: 0.56 }, 27: { x: 0.2, y: 0.7 }, 28: { x: 0.21, y: 0.71 } });
const input = (over: Partial<HintInput>): HintInput => ({ poses: [plank()], luminance: 0.4, ...over });
/** The plank with its head cut off: MediaPipe then guesses all 11 face landmarks as a tight cluster (a few hundredths of a torso across) at or past the edge. */
const headGone = (at: { x?: number; y?: number; visibility?: number }) => {
  const p = plank();
  for (let i = 0; i <= 10; i++) p[i] = { ...p[i], x: (at.x ?? 0.85) + i * 0.001, y: (at.y ?? 0.45) + i * 0.0005, visibility: at.visibility ?? 0.95 };
  return p;
};

describe("placementHint", () => {
  it("says nothing for a clean side-on plank", () => {
    expect(placementHint(input({}))).toBe(null);
  });
  it("asks for light when there is no pose and the frame is dark", () => {
    expect(placementHint(input({ poses: [], luminance: 0.05 }))).toMatch(/dark|light/i);
  });
  it("asks to step back when there is no pose in a lit frame", () => {
    expect(placementHint(input({ poses: [] }))).toMatch(/whole body/i);
  });
  it("says the head is out of frame (the 11 face landmarks guessed as a collapsed cluster beyond the top edge, as MediaPipe does for a cut-off head)", () => {
    expect(placementHint(input({ poses: [headGone({ y: -0.03 })] }))).toMatch(/head|move back/i);
    expect(placementHint(input({ poses: [headGone({ y: 0.4, visibility: 0.2 })] }))).toMatch(/head|move back/i);
  });
  it("D3: a head at the edge of the frame but still visible (Kalp's test_video: face landmarks at x 1.01-1.05, head size normal) is not out of frame", () => {
    expect(placementHint(input({ poses: [real("test_video@3.2")] }))).toBeNull();
    expect(placementHint(input({ poses: [real("test_video@2.2")] }))).toBeNull();
  });
  it("D3: a head really cut off at the top (IMG_1359: the guessed head collapses to a third of its size at y ~ 0) is out of frame", () => {
    expect(placementHint(input({ poses: [real("IMG_1359@3.0")] }))).toBe(HINTS.head);
    expect(placementHint(input({ poses: [real("IMG_1359@4.5")] }))).toBe(HINTS.head);
  });
  it("says the feet are out of frame", () => {
    const p = plank();
    p[27] = { ...p[27], x: -0.02, visibility: 0.3 };
    p[28] = { ...p[28], x: -0.03, visibility: 0.3 };
    expect(placementHint(input({ poses: [p] }))).toMatch(/feet|move back/i);
  });
  it("asks for one person when two poses of comparable size are found apart", () => {
    // Two bodies side by side (the two-people fake camera: torso ratio 0.72-1.0, boxes not overlapping).
    const other = plank().map((l) => ({ ...l, x: l.x - 0.5 }));
    expect(placementHint(input({ poses: [plank(), other] }))).toMatch(/one person/i);
  });
  it("ignores a phantom second pose inside the first body (D6: IMG_1512 lying flat gave a 0.15-0.5x torso inside the same box)", () => {
    const phantom = plank().map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * 0.25, y: 0.55 + (l.y - 0.55) * 0.25 }));
    expect(placementHint(input({ poses: [plank(), phantom] }))).toBe(null);
  });
  it("says the head is out of frame when the nose was guessed just inside but the rest of the collapsed head is past the edge (r2 D4)", () => {
    const p = headGone({ x: 1.01 });
    p[0] = { ...p[0], x: 0.99 };
    expect(placementHint(input({ poses: [p] }))).toBe(HINTS.head);
  });
  it("asks to turn side-on for a frontal pose (shoulders wide apart, short body line)", () => {
    const p = lm({ 0: { x: 0.5, y: 0.2 }, 11: { x: 0.35, y: 0.35 }, 12: { x: 0.65, y: 0.35 }, 23: { x: 0.4, y: 0.5 }, 24: { x: 0.6, y: 0.5 }, 27: { x: 0.42, y: 0.6 }, 28: { x: 0.58, y: 0.6 } });
    expect(placementHint(input({ poses: [p] }))).toMatch(/side/i);
  });
});

describe("createHintDebouncer (hysteresis, D4)", () => {
  it("shows a hint after 700 ms of any problem, even when the problem's text keeps changing", () => {
    const d = createHintDebouncer(700);
    // A half-detected body alternates between "no pose" and a pose with the head out: still one problem.
    let shown: string | null = null;
    for (let t = 0; t <= 760; t += 33) shown = d.next(t % 66 === 0 ? HINTS.noPose : HINTS.head, t);
    expect(shown).not.toBe(null);
  });
  it("shows nothing for a problem shorter than 700 ms", () => {
    const d = createHintDebouncer(700);
    let shown: string | null = null;
    for (let t = 0; t <= 600; t += 33) shown = d.next(HINTS.noPose, t);
    expect(shown).toBe(null);
    expect(d.next(null, 633)).toBe(null);
  });
  it("keeps the hint through short clean blips and clears it after 700 ms of clean frames", () => {
    const d = createHintDebouncer(700);
    let t = 0;
    for (; t <= 800; t += 33) d.next(HINTS.feet, t);
    expect(d.next(null, (t += 33))).toBe(HINTS.feet); // one clean frame: still shown
    expect(d.next(HINTS.feet, (t += 33))).toBe(HINTS.feet);
    for (let k = 0; k < 20; k++) d.next(null, (t += 33)); // 660 ms clean
    expect(d.next(null, (t += 33))).toBe(HINTS.feet);
    expect(d.next(null, (t += 66))).toBe(null); // > 700 ms clean
  });
  it("switches the text at once when the problem changes while a hint is up", () => {
    const d = createHintDebouncer(700);
    let t = 0;
    for (; t <= 800; t += 33) d.next(HINTS.head, t);
    expect(d.next(HINTS.feet, (t += 33))).toBe(HINTS.feet);
  });
});

describe("pausesCounting (D4/D5: which placement problems stop the counter)", () => {
  it("pauses for no pose, darkness, two people and a frontal view", () => {
    expect(pausesCounting(input({ poses: [] }))).toBe(true);
    expect(pausesCounting(input({ poses: [], luminance: 0.05 }))).toBe(true);
    const other = plank().map((l) => ({ ...l, x: l.x - 0.5 }));
    expect(pausesCounting(input({ poses: [plank(), other] }))).toBe(true);
    const frontal = lm({ 0: { x: 0.5, y: 0.2 }, 11: { x: 0.35, y: 0.35 }, 12: { x: 0.65, y: 0.35 }, 23: { x: 0.4, y: 0.5 }, 24: { x: 0.6, y: 0.5 }, 27: { x: 0.42, y: 0.6 }, 28: { x: 0.58, y: 0.6 } });
    expect(pausesCounting(input({ poses: [frontal] }))).toBe(true);
  });
  it("keeps counting (and shows no hint) when the head is only just past the edge with its size intact (Kalp's clips dip the nose to x 1.03 at every bottom), keeps counting under the hint when a cut-off head sits at the edge (IMG_1359 counts 9/9), and pauses when the head is well outside or invisible", () => {
    const edge = plank();
    edge[0] = { ...edge[0], x: 1.03 };
    expect(placementHint(input({ poses: [edge] }))).toBeNull();
    expect(pausesCounting(input({ poses: [edge] }))).toBe(false);
    const cutOff = real("IMG_1359@3.0");
    expect(placementHint(input({ poses: [cutOff] }))).toBe(HINTS.head);
    expect(pausesCounting(input({ poses: [cutOff] }))).toBe(false);
    expect(pausesCounting(input({ poses: [headGone({ x: 1.1 })] }))).toBe(true);
    expect(pausesCounting(input({ poses: [headGone({ x: 0.9, visibility: 0.2 })] }))).toBe(true);
  });
  it("pauses when both feet are invisible (a frontal upper body) but not when they merely touch the edge", () => {
    const touch = plank();
    touch[27] = { ...touch[27], x: 0.01 };
    touch[28] = { ...touch[28], x: 0.0 };
    expect(placementHint(input({ poses: [touch] }))).toBe(HINTS.feet);
    expect(pausesCounting(input({ poses: [touch] }))).toBe(false);
    const gone = plank();
    gone[27] = { ...gone[27], visibility: 0.01 };
    gone[28] = { ...gone[28], visibility: 0.0 };
    expect(pausesCounting(input({ poses: [gone] }))).toBe(true);
  });
  it("does not pause a clean plank", () => {
    expect(pausesCounting(input({}))).toBe(false);
  });
});
