"""Rebuild pushup_model_augmented.h5 (saved by Keras 3.7) in the Keras 2 runtime that
tensorflowjs_converter understands. The architecture is fixed (Sequential 36->128->64->32->1,
ReLU, sigmoid; dropout is training-only) and the weights are read straight from the HDF5 file."""
import h5py
import numpy as np
import tensorflow as tf

OLD_REPO = "/Users/kalp/projects/pushups-python"
H5_PATH = f"{OLD_REPO}/model/pushup_model_augmented.h5"
CSV_PATH = f"{OLD_REPO}/outputs/pushup_keypoints_augmented.csv"

LAYERS = [("dense", 128), ("dense_1", 64), ("dense_2", 32), ("dense_3", 1)]


def load_weights():
    with h5py.File(H5_PATH, "r") as f:
        g = f["model_weights"]
        return [(np.array(g[f"{n}/sequential/{n}/kernel"]), np.array(g[f"{n}/sequential/{n}/bias"])) for n, _ in LAYERS]


def build_model():
    model = tf.keras.Sequential(name="pushup_form")
    model.add(tf.keras.Input(shape=(36,), name="keypoints"))
    for i, (name, units) in enumerate(LAYERS):
        act = "sigmoid" if units == 1 else "relu"
        model.add(tf.keras.layers.Dense(units, activation=act, name=name))
    for layer, (k, b) in zip([l for l in model.layers if isinstance(l, tf.keras.layers.Dense)], load_weights()):
        layer.set_weights([k, b])
    return model
