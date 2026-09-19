"""Train the form classifier v2 on the site's own landmarks (tests/fixtures/training/*, made by
scripts/make_training_landmarks.py with the MediaPipe Tasks full model) and export it for the page.

Input features (src/formFeatures.ts computes the same 24 numbers in the browser): the 12 landmarks' x, y
in square units (x times the frame aspect), centred on the hip midpoint, divided by the torso length,
mirrored (x negated, left/right swapped) so the feet are always on the left. No z: the Tasks model's z
disagrees with the legacy model's by up to 0.4 and the old network keyed on it. Only frames in the lower
half of each clip's shoulder range are used, because the page consults the classifier at the bottom of a
rep only (form.ts) and a bad clip's top frames are not necessarily bad.

Validation is by clip (20 % of clips held out, fixed seed), never by frame, so a frame's neighbours cannot
leak. Output: scripts/form_v2.h5 (Keras 2) -> public/models/form-v<N>/ via tensorflowjs_converter (a NEW
directory name every time the model changes: /models/* is served immutable for a year, so a browser that
keeps the old files would otherwise run them with the new code; then bump MODEL_URL in src/classifier.ts),
and src/scaler.ts (standardisation baked in).

usage: .venv/bin/python scripts/train_form_model.py
"""
import glob, json, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(os.path.join(HERE, ".."))
import numpy as np
import tensorflow as tf

SEED = 7
random.seed(SEED); np.random.seed(SEED); tf.random.set_seed(SEED)

def form_features(lm, aspect):
    """lm: 12 x [x, y, z, vis] in the order wrist L/R, elbow L/R, shoulder L/R, hip L/R, knee L/R, ankle L/R."""
    pts = np.array([[p[0] * aspect, p[1]] for p in lm], dtype=np.float64)
    shoulder = (pts[4] + pts[5]) / 2; hip = (pts[6] + pts[7]) / 2; ankle = (pts[10] + pts[11]) / 2
    torso = np.linalg.norm(shoulder - hip) or 1e-6
    rel = (pts - hip) / torso
    if ankle[0] > shoulder[0]:  # facing the other way: mirror x and swap left/right
        rel[:, 0] *= -1
        rel = rel.reshape(6, 2, 2)[:, ::-1, :].reshape(12, 2)
    return rel.reshape(-1)

clips = []
for label, y in (("good_form", 1.0), ("bad_form", 0.0)):
    for path in sorted(glob.glob(f"tests/fixtures/training/{label}/*.json")):
        d = json.load(open(path))
        if len(d["frames"]) < 30: continue
        aspect = d["width"] / d["height"]
        ys = np.array([(f["lm"][4][1] + f["lm"][5][1]) / 2 for f in d["frames"]])
        lo, hi = ys.min(), ys.max(); mid = lo + 0.5 * (hi - lo)
        lower = [f["lm"] for f, sy in zip(d["frames"], ys) if sy >= mid]
        X = np.array([form_features(lm, aspect) for lm in lower], dtype=np.float32)
        clips.append((d["id"], label, y, X, lower, aspect))
print(f"{len(clips)} clips: {sum(1 for c in clips if c[1]=='good_form')} good, {sum(1 for c in clips if c[1]=='bad_form')} bad")
random.shuffle(clips)
held = {c[0] for c in clips[: max(1, len(clips) // 5)]}
def stack(sel):
    X = np.concatenate([c[3] for c in sel]); y = np.concatenate([np.full(len(c[3]), c[2], dtype=np.float32) for c in sel]); return X, y

# Augmentation (v3, 2026-09-19): the v2 model was trained on Python-extracted landmarks and was right on 62/69
# labelled bottoms replayed from those, but only 57/69 from the browser's own landmarks of the same clips
# (MediaPipe on WebGL, MJPEG camera frames): a few pixels of landmark noise flipped clean reps to "bad" and
# floor collapses to "good". Every training frame is therefore also fed through AUG_COPIES random
# perturbations of the raw landmarks: Gaussian jitter (AUG_JITTER of the frame height per coordinate),
# a rotation of the whole body about the hips (+-AUG_ROT_DEG), a scale change (+-AUG_SCALE) and a
# time-neighbour blend, before the features are computed. Set AUG_COPIES=0 to reproduce v2.
AUG_COPIES = int(os.environ.get("AUG_COPIES", "6"))
AUG_JITTER = float(os.environ.get("AUG_JITTER", "0.012"))
AUG_ROT_DEG = float(os.environ.get("AUG_ROT_DEG", "4"))
AUG_SCALE = float(os.environ.get("AUG_SCALE", "0.1"))
rng = np.random.default_rng(SEED)

def augment_clip(lower, aspect):
    """lower: list of 12 x [x, y, z, vis] frames (frame-normalised coordinates). Returns augmented feature rows."""
    out = []
    P = np.array([[[p[0] * aspect, p[1]] for p in lm] for lm in lower], dtype=np.float64)  # N x 12 x 2, square units
    N = len(P)
    for _ in range(AUG_COPIES):
        # blend each frame with a random neighbour (0-2 frames away) to imitate a different frame phase / motion blur
        j = np.clip(np.arange(N) + rng.integers(-2, 3, N), 0, N - 1)
        a = rng.uniform(0, 1, (N, 1, 1))
        Q = a * P + (1 - a) * P[j]
        # rotate about the hip midpoint, scale, jitter
        hip = (Q[:, 6, :] + Q[:, 7, :]) / 2
        th = np.deg2rad(rng.uniform(-AUG_ROT_DEG, AUG_ROT_DEG, N))
        c, s_ = np.cos(th)[:, None], np.sin(th)[:, None]
        R = Q - hip[:, None, :]
        Rx = R[:, :, 0] * c - R[:, :, 1] * s_
        Ry = R[:, :, 0] * s_ + R[:, :, 1] * c
        Q = np.stack([Rx, Ry], -1) * rng.uniform(1 - AUG_SCALE, 1 + AUG_SCALE, (N, 1, 1)) + hip[:, None, :]
        Q = Q + rng.normal(0, AUG_JITTER, Q.shape)
        for q in Q:
            out.append(form_features([[x / aspect, y] for x, y in q], aspect))
    return np.array(out, dtype=np.float32)

train = [c for c in clips if c[0] not in held]; test = [c for c in clips if c[0] in held]
Xtr, ytr = stack(train); Xte, yte = stack(test)
if AUG_COPIES:
    Xa = np.concatenate([augment_clip(c[4], c[5]) for c in train]); ya = np.concatenate([np.full(AUG_COPIES * len(c[3]), c[2], dtype=np.float32) for c in train])
    Xtr = np.concatenate([Xtr, Xa]); ytr = np.concatenate([ytr, ya])
mean = Xtr.mean(0); scale = Xtr.std(0) + 1e-6
Xtr_s = (Xtr - mean) / scale; Xte_s = (Xte - mean) / scale
print(f"train {len(Xtr)} frames from {len(train)} clips, held-out {len(Xte)} frames from {len(test)} clips: {sorted(held)}")

def build(i):
    return tf.keras.Sequential([
        tf.keras.Input(shape=(24,), name=f"form_features_{i}"),
        tf.keras.layers.Dense(32, activation="relu", name=f"dense_{i}a"),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(16, activation="relu", name=f"dense_{i}b"),
        tf.keras.layers.Dense(1, activation="sigmoid", name=f"dense_{i}c"),
    ], name=f"member_{i}")
w = {0: len(ytr) / (2 * (ytr == 0).sum()), 1: len(ytr) / (2 * (ytr == 1).sum())}
EPOCHS = int(os.environ.get("EPOCHS", "60"))
# v3: an ensemble of ENSEMBLE identically shaped MLPs trained from different seeds and averaged inside one
# Keras model (one TF.js file, ~30 KB). Reps whose single-model probability sat at 0.4-0.6 (the ones the
# browser landmarks flipped) get a steadier estimate; ENSEMBLE=1 is the v2 architecture.
ENSEMBLE = int(os.environ.get("ENSEMBLE", "5"))
members = []
for i in range(ENSEMBLE):
    tf.random.set_seed(SEED + i)
    m = build(i)
    m.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="binary_crossentropy", metrics=["accuracy"])
    m.fit(Xtr_s, ytr, epochs=EPOCHS, batch_size=128, verbose=0, class_weight=w, validation_data=(Xte_s, yte), shuffle=True)
    members.append(m)
inp = tf.keras.Input(shape=(24,), name="form_features")
outs = [m(inp) for m in members]
model = tf.keras.Model(inp, outs[0] if len(outs) == 1 else tf.keras.layers.Average(name="average")(outs), name="pushup_form_v3")
p = model.predict(Xte_s, verbose=0)[:, 0]
acc = float(((p > 0.5) == (yte > 0.5)).mean())
per_clip = [(c[0], c[1], float((model.predict((c[3] - mean) / scale, verbose=0)[:, 0] > 0.5).mean())) for c in test]
print(f"held-out frame accuracy {acc:.4f}")
for cid, label, share in per_clip: print(f"  {label:9} {cid:10} P(good)>0.5 on {share:.0%} of lower-half frames")
OUT = os.environ.get("OUT", "scripts/form_v3")
model.save(f"{OUT}.h5")
json.dump({"mean": [float(v) for v in mean], "scale": [float(v) for v in scale]}, open(f"{OUT}_scaler.json", "w"))
scaler_ts = f"""// GENERATED by scripts/train_form_model.py — do not edit by hand.
// StandardScaler of the 24 form features (src/formFeatures.ts) fitted on the training clips' lower-half frames
// (MediaPipe Tasks landmarks, {len(train)} clips, {len(Xtr)} frames). Held-out clip accuracy {acc:.4f} ({len(test)} clips).
export const MEAN: readonly number[] = {json.dumps([float(v) for v in mean])};
export const SCALE: readonly number[] = {json.dumps([float(v) for v in scale])};

/** (x - mean) / scale, feature-wise, like sklearn's StandardScaler.transform. */
export function scale(vector: readonly number[]): number[] {{
  if (vector.length !== MEAN.length) throw new Error(`expected ${{MEAN.length}} features, got ${{vector.length}}`);
  return vector.map((v, i) => (v - MEAN[i]) / SCALE[i]);
}}
"""
if not os.environ.get("NO_TS"): open("src/scaler.ts", "w").write(scaler_ts)
# Port-fidelity fixture: 60 held-out frames with the Keras probability, checked by tests/classifier.test.ts.
pick = np.linspace(0, len(Xte) - 1, 60).astype(int)
json.dump({"note": "24 raw form features (src/formFeatures.ts) and Keras P(good) of form_v3.h5; generated by scripts/train_form_model.py",
           "frames": [{"features": [float(v) for v in Xte[i]], "prob": float(p[i]), "label": float(yte[i])} for i in pick]},
          open(os.environ.get("PROBS_OUT", "tests/fixtures/form_v3_probs.json"), "w"))
json.dump({"held_out_clips": sorted(held), "held_out_accuracy": acc, "train_frames": int(len(Xtr)), "test_frames": int(len(Xte)), "per_clip": per_clip}, open(f"{OUT}_report.json", "w"), indent=1)
print(f"saved {OUT}.h5, {OUT}_scaler.json, {OUT}_report.json" + ("" if os.environ.get("NO_TS") else ", src/scaler.ts"))
