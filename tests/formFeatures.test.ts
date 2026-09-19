/** The browser's 24 form features must equal the trainer's (scripts/train_form_model.py form_features). */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/form_features.json";
import { formFeatures } from "../src/formFeatures";

describe("formFeatures", () => {
  for (const f of fixture) {
    it(`${f.id} at ${f.t}s matches the Python trainer`, () => {
      const got = formFeatures(f.vector, f.aspect);
      expect(got).toHaveLength(24);
      for (let i = 0; i < 24; i++) expect(got[i]).toBeCloseTo(f.expected[i], 5);
    });
  }
  it("is mirror-invariant: flipping the frame horizontally gives the same features", () => {
    const f = fixture[0];
    const flipped = f.vector.slice();
    for (let p = 0; p < 12; p += 2) {
      // swap left/right pair and mirror x
      const a = p * 3, b = (p + 1) * 3;
      flipped[a] = 1 - f.vector[b]; flipped[a + 1] = f.vector[b + 1]; flipped[a + 2] = f.vector[b + 2];
      flipped[b] = 1 - f.vector[a]; flipped[b + 1] = f.vector[a + 1]; flipped[b + 2] = f.vector[a + 2];
    }
    const x = formFeatures(f.vector, f.aspect);
    const y = formFeatures(flipped, f.aspect);
    for (let i = 0; i < 24; i++) expect(y[i]).toBeCloseTo(x[i], 5);
  });
});
