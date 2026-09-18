import { describe, expect, it } from "vitest";
import { features, LANDMARK_INDEXES } from "../src/features";
import fixture from "./fixtures/test_video3_0-160.json";

describe("features", () => {
  it("uses the 12 MediaPipe landmarks in the Python order (wrists, elbows, shoulders, hips, knees, ankles)", () => {
    expect(LANDMARK_INDEXES).toEqual([15, 16, 13, 14, 11, 12, 23, 24, 25, 26, 27, 28]);
  });

  it("reproduces the Python feature vector and shoulder height from the full 33-point pose", () => {
    for (const frame of fixture.frames) {
      if (!frame.landmarks) continue;
      const pts = frame.landmarks.map(([x, y, z]) => ({ x, y, z }));
      const { vector, shoulderY } = features(pts);
      expect(vector).toHaveLength(36);
      for (let i = 0; i < 36; i++) expect(vector[i]).toBeCloseTo(frame.features![i], 6);
      expect(shoulderY).toBeCloseTo(frame.shoulderY!, 6);
    }
  });

  it("throws on a pose with fewer than 29 points", () => {
    expect(() => features([{ x: 0, y: 0, z: 0 }])).toThrow();
  });
});
