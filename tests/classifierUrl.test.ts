/**
 * D1 (TEST r2, 2026-09-19): /models/* is served with `cache-control: immutable, max-age=31536000`, and the
 * retrained classifier (36 -> 24 inputs) was written over the same URL, so every returning browser fed the
 * cached v1 model to v2 code and threw on every frame. These tests pin the two defences: the model URL
 * carries a version that must change with the model, and a model whose input width is not INPUTS is
 * refused at load time with a message that names the problem (never 254 silent exceptions in the loop).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import * as tf from "@tensorflow/tfjs";
import { createClassifier, INPUTS, MODEL_URL } from "../src/classifier";

const modelDir = new URL(`../public${MODEL_URL.replace(/model\.json$/, "")}`, import.meta.url);

describe("form classifier URL (D1: versioned against the immutable cache)", () => {
  it("is versioned and the version is not the one that shipped the 36-input model", () => {
    expect(MODEL_URL).toMatch(/^\/models\/form-v\d+\/model\.json$/);
    expect(MODEL_URL).not.toBe("/models/form/model.json");
  });

  it("points at model files that exist in public/ and carry INPUTS inputs", () => {
    expect(existsSync(new URL("model.json", modelDir))).toBe(true);
    expect(existsSync(new URL("group1-shard1of1.bin", modelDir))).toBe(true);
    const modelJson = JSON.parse(readFileSync(new URL("model.json", modelDir), "utf8"));
    const layers = modelJson.modelTopology.model_config.config.layers;
    expect(layers[0].config.batch_input_shape).toEqual([null, INPUTS]);
  });

  it("the old unversioned path is gone (a stale browser must never find a file there)", () => {
    expect(existsSync(new URL("../public/models/form/model.json", import.meta.url))).toBe(false);
  });
});

describe("createClassifier refuses a model whose input width is not INPUTS", () => {
  async function inMemory(inputs: number) {
    const model = tf.sequential({ layers: [tf.layers.dense({ inputShape: [inputs], units: 4, activation: "relu" }), tf.layers.dense({ units: 1, activation: "sigmoid" })] });
    let artifacts: tf.io.ModelArtifacts | null = null;
    await model.save(tf.io.withSaveHandler(async (a) => { artifacts = a; return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: "JSON" } }; }));
    model.dispose();
    return tf.io.fromMemory(artifacts!);
  }

  it("rejects a 36-input (v1) model with a message naming both widths", async () => {
    await expect(createClassifier(await inMemory(36))).rejects.toThrow(/36 inputs.*24|expects 24.*got 36/);
  });

  it("accepts a model with INPUTS inputs", async () => {
    const clf = await createClassifier(await inMemory(INPUTS));
    expect(clf.predict(new Array(INPUTS).fill(0))).toBeGreaterThanOrEqual(0);
    clf.dispose();
  });
});
