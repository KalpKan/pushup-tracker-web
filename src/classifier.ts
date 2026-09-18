/**
 * Form classifier: the TF.js conversion of pushup_model_augmented.h5 (Sequential 36->128->64->32->1,
 * ReLU/sigmoid, 15 105 parameters), run on the CPU backend. Inputs must already be standardised
 * with scale() from ./scaler. Output is P(good form) for one frame.
 */
import * as tf from "@tensorflow/tfjs";

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
        const out = model.predict(tf.tensor2d([Array.from(scaledVector)], [1, 36])) as tf.Tensor;
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
