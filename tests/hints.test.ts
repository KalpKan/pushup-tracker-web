/** Placement hints from a pose result (pure function, no DOM). */
import { describe, expect, it } from "vitest";
import { placementHint, type HintInput } from "../src/hints";

const lm = (over: Partial<Record<number, { x?: number; y?: number; visibility?: number }>> = {}) =>
  Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95, ...(over[i] ?? {}) }));
// A side-on plank: head right, feet left, all inside the frame.
const plank = () => lm({ 0: { x: 0.85, y: 0.45 }, 11: { x: 0.75, y: 0.5 }, 12: { x: 0.76, y: 0.52 }, 23: { x: 0.5, y: 0.55 }, 24: { x: 0.51, y: 0.56 }, 27: { x: 0.2, y: 0.7 }, 28: { x: 0.21, y: 0.71 } });
const input = (over: Partial<HintInput>): HintInput => ({ poses: [plank()], luminance: 0.4, ...over });

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
  it("says the head is out of frame", () => {
    const p = plank();
    p[0] = { ...p[0], y: -0.05, visibility: 0.2 };
    expect(placementHint(input({ poses: [p] }))).toMatch(/head|move back/i);
  });
  it("says the feet are out of frame", () => {
    const p = plank();
    p[27] = { ...p[27], x: -0.02, visibility: 0.3 };
    p[28] = { ...p[28], x: -0.03, visibility: 0.3 };
    expect(placementHint(input({ poses: [p] }))).toMatch(/feet|move back/i);
  });
  it("asks for one person when two poses are found", () => {
    expect(placementHint(input({ poses: [plank(), plank()] }))).toMatch(/one person/i);
  });
  it("asks to turn side-on for a frontal pose (shoulders wide apart, short body line)", () => {
    const p = lm({ 0: { x: 0.5, y: 0.2 }, 11: { x: 0.35, y: 0.35 }, 12: { x: 0.65, y: 0.35 }, 23: { x: 0.4, y: 0.5 }, 24: { x: 0.6, y: 0.5 }, 27: { x: 0.42, y: 0.6 }, 28: { x: 0.58, y: 0.6 } });
    expect(placementHint(input({ poses: [p] }))).toMatch(/side/i);
  });
});
