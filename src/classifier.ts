/**
 * Form classifier v2: the TF.js conversion of scripts/form_v2.h5 (Sequential 24->32->16->1, ReLU/sigmoid,
 * trained by scripts/train_form_model.py on the site's own MediaPipe Tasks landmarks), run on the CPU
 * backend. Inputs are the 24 features of ./formFeatures, standardised with scale() from ./scaler. Output
 * is P(good form) for one frame; the tracker consults it at the bottom of a rep only (see ./form).
 */
import * as tf from "@tensorflow/tfjs";

export const INPUTS = 24;

export interface Classifier {
  predict(scaledVector: readonly number[]): number;
  dispose(): void;
}

export async function createClassifier(source: string | tf.io.IOHandler): Promise<Classifier> {
  // The MLP is tiny; the CPU backend avoids fighting MediaPipe for the GPU and has no warm-up cost.
  await tf.setBackend("cpu");
  await tf.ready();
  const model = await tf.loadLayersModel(source);
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

/** Browser entry point: the model files are served by the site itself from public/models/form. */
export function loadClassifier(): Promise<Classifier> {
  return createClassifier("/models/form/model.json");
}
