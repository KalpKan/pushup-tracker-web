import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as tf from "@tensorflow/tfjs";
import { createClassifier } from "../src/classifier";
import { MEAN, SCALE, scale } from "../src/scaler";
import video3 from "./fixtures/test_video3_0-160.json";
import video2 from "./fixtures/test_video_2_1000-1408.json";

// Load the converted TF.js model from disk (the browser fetches /models/form/model.json instead).
async function loadFromDisk() {
  const dir = new URL("../public/models/form/", import.meta.url);
  const modelJson = JSON.parse(readFileSync(new URL("model.json", dir), "utf8"));
  const bin = readFileSync(new URL("group1-shard1of1.bin", dir));
  const weightData = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const handler = tf.io.fromMemory({
    modelTopology: modelJson.modelTopology,
    weightSpecs: modelJson.weightsManifest[0].weights,
    weightData,
  });
  return createClassifier(handler);
}

describe("classifier (TF.js port of pushup_model_augmented.h5)", () => {
  it("scaler constants have 36 entries and scale() standardises", () => {
    expect(MEAN).toHaveLength(36);
    expect(SCALE).toHaveLength(36);
    expect(scale([...MEAN])).toEqual(new Array(36).fill(0));
  });

  it("reproduces the Keras probabilities (scaled inputs) on both fixtures within 1e-4", async () => {
    const clf = await loadFromDisk();
    let n = 0;
    let maxDiff = 0;
    for (const fx of [video3, video2]) {
      for (const f of fx.frames) {
        if (!f.features || f.prob == null) continue;
        const p = clf.predict(scale(f.features));
        maxDiff = Math.max(maxDiff, Math.abs(p - f.prob));
        expect(p).toBeCloseTo(f.prob, 4);
        n++;
      }
    }
    console.log(`classifier: ${n} frames compared, max |tfjs - keras| = ${maxDiff.toExponential(2)}`);
    expect(n).toBeGreaterThan(500);
  });
});
