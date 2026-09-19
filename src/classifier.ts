/**
 * Form classifier v2: the TF.js conversion of scripts/form_v2.h5 (Sequential 24->32->16->1, ReLU/sigmoid,
 * trained by scripts/train_form_model.py on the site's own MediaPipe Tasks landmarks), run on the CPU
 * backend. Inputs are the 24 features of ./formFeatures, standardised with scale() from ./scaler. Output
 * is P(good form) for one frame; the tracker consults it at the bottom of a rep only (see ./form).
 */
import * as tf from "@tensorflow/tfjs";

export const INPUTS = 24;

/**
 * Where the browser fetches the model. vercel.json serves everything under /models/ with
 * `cache-control: immutable, max-age=31536000`, so a retrained model MUST get a new directory name
 * (form-v3, ...): on 2026-09-19 the 24-input model was written over the 36-input one at /models/form/
 * and every returning browser ran the new code against the cached old model (TEST r2 D1). The
 * tests in tests/classifierUrl.test.ts pin this.
 */
export const MODEL_URL = "/models/form-v3/model.json";

export interface Classifier {
  predict(scaledVector: readonly number[]): number;
  dispose(): void;
}

export class ModelShapeError extends Error {
  constructor(got: number, source: string) {
    super(`form classifier at ${source} expects ${got} inputs, this code computes ${INPUTS} (stale cached model?)`);
    this.name = "ModelShapeError";
  }
}

export async function createClassifier(source: string | tf.io.IOHandler, options?: tf.io.LoadOptions): Promise<Classifier> {
  // The MLP is tiny; the CPU backend avoids fighting MediaPipe for the GPU and has no warm-up cost.
  await tf.setBackend("cpu");
  await tf.ready();
  const model = await tf.loadLayersModel(source, options);
  const width = model.inputs[0]?.shape?.[1];
  if (width !== INPUTS) {
    model.dispose();
    throw new ModelShapeError(Number(width), typeof source === "string" ? source : "memory");
  }
  return {
    predict(scaledVector) {
      return tf.tidy(() => {
        const out = model.predict(tf.tensor2d([Array.from(scaledVector)], [1, INPUTS])) as tf.Tensor;
        return out.dataSync()[0];
      });
    },
    dispose() {
      model.dispose();
    },
  };
}

/**
 * Browser entry point. If the browser's cache ever hands back a model of the wrong width (the D1 failure
 * mode), fetch it again bypassing the HTTP cache before giving up; a model that is still wrong is a
 * deploy fault and is reported by the caller.
 */
export async function loadClassifier(): Promise<Classifier> {
  try {
    return await createClassifier(MODEL_URL);
  } catch (err) {
    if (!(err instanceof ModelShapeError)) throw err;
    console.warn(`${err.message}; reloading it past the cache`);
    return createClassifier(MODEL_URL, { requestInit: { cache: "reload" } });
  }
}
