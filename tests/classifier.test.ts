import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as tf from "@tensorflow/tfjs";
import { createClassifier, INPUTS, MODEL_URL } from "../src/classifier";
import { MEAN, SCALE, scale } from "../src/scaler";
import probs from "./fixtures/form_v3_probs.json";

// Load the converted TF.js model from disk (the browser fetches MODEL_URL instead).
async function loadFromDisk() {
  const dir = new URL(`../public${MODEL_URL.replace(/model\.json$/, "")}`, import.meta.url);
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

describe("classifier v3 (TF.js port of scripts/form_v3.h5)", () => {
  it("scaler constants have 24 entries and scale() standardises", () => {
    expect(MEAN).toHaveLength(INPUTS);
    expect(SCALE).toHaveLength(INPUTS);
    expect(scale([...MEAN])).toEqual(new Array(INPUTS).fill(0));
  });

  it("reproduces the Keras probabilities on the held-out fixture within 1e-4", async () => {
    const clf = await loadFromDisk();
    let maxDiff = 0;
    for (const f of probs.frames) {
      const p = clf.predict(scale(f.features));
      maxDiff = Math.max(maxDiff, Math.abs(p - f.prob));
      expect(p).toBeCloseTo(f.prob, 4);
    }
    console.log(`classifier: ${probs.frames.length} frames compared, max |tfjs - keras| = ${maxDiff.toExponential(2)}`);
    expect(probs.frames.length).toBeGreaterThanOrEqual(50);
    clf.dispose();
  });

  it("separates the held-out good and bad frames well above chance", async () => {
    const clf = await loadFromDisk();
    const right = probs.frames.filter((f) => (clf.predict(scale(f.features)) > 0.5) === f.label > 0.5).length;
    expect(right / probs.frames.length).toBeGreaterThanOrEqual(0.85);
    clf.dispose();
  });
});
