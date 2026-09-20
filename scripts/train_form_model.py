"""Train the form classifier (v4) on the site's own landmarks and export it for the page.

Data (both git-ignored, personal recordings):
  - tests/fixtures/training/<label>/<id>.json: the MediaPipe Tasks full model run in Python over Kalp's labelled
    clips (scripts/make_training_landmarks.py);
  - tests/fixtures/training-browser/<label>/<id>[-flip].json: the SAME clips played into the site itself through
    Chrome's fake camera, as recorded and flipped horizontally (scripts/record-training-landmarks.mjs). This is
    what the page really sees: v3, trained on the Python landmarks of one facing, scored the browser's own
    landmarks of the same reps 0.1-0.5 instead of 0.0 and was gated off for the other facing, so a visitor facing
    the other way had every bad rep graded good (TEST r3 D1/D2, 2026-09-19). SOURCES=python,browser (default both).

Input features (src/formFeatures.ts computes the same 24 numbers in the browser): the 12 landmarks' x, y
in square units (x times the frame aspect), centred on the hip midpoint, divided by the torso length,
mirrored (x negated, left/right swapped) so the feet are always on the left. No z: the Tasks model's z
disagrees with the legacy model's by up to 0.4 and the old network keyed on it. Only frames in the lower
half of each clip's shoulder range are used, because the page consults the classifier at the bottom of a
rep only (form.ts) and a bad clip's top frames are not necessarily bad.

Validation is by clip, never by frame, so a frame's neighbours cannot leak; every variant of a clip (Python,
browser, flipped) goes to the same side. The five training clips that are also in the ground-truth corpus
(tests/fixtures/clips/ground_truth.json: IMG_4378, IMG_4409, IMG_4456, IMG_4470, IMG_4451) are ALWAYS held out
(HOLD_OUT=corpus, default) so tests/corpus.test.ts stays an honest test; RANDOM_HOLD_OUT=0.15 more clips join
them for the accuracy number. Output: scripts/form_v4.h5 (Keras 2) -> public/models/form-v<N>/ via tensorflowjs_converter (a NEW
directory name every time the model changes: /models/* is served immutable for a year, so a browser that
keeps the old files would otherwise run them with the new code; then bump MODEL_URL in src/classifier.ts),
and src/scaler.ts (standardisation baked in).

usage: .venv/bin/python scripts/train_form_model.py     (env: SOURCES, HOLD_OUT, RANDOM_HOLD_OUT, AUG_*, ENSEMBLE, EPOCHS, OUT, NO_TS)
"""
import glob, json, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(os.path.join(HERE, "..")); sys.path.insert(0, HERE)
import numpy as np
import tensorflow as tf

SEED = 7
random.seed(SEED); np.random.seed(SEED); tf.random.set_seed(SEED)

from form_features import form_features, N_FEATURES, FEATURES

SOURCES = os.environ.get("SOURCES", "python,browser").split(",")
SOURCE_DIRS = {"python": "tests/fixtures/training", "browser": "tests/fixtures/training-browser"}
CORPUS_CLIPS = {"IMG_4378", "IMG_4409", "IMG_4456", "IMG_4470", "IMG_4451"}
clips = []  # (variant id, label, y, X, lower frames, aspect, clip id)
for source in SOURCES:
    for label, y in (("good_form", 1.0), ("bad_form", 0.0)):
        for path in sorted(glob.glob(f"{SOURCE_DIRS[source]}/{label}/*.json")):
            d = json.load(open(path))
            if len(d["frames"]) < 30: continue
            aspect = d["width"] / d["height"]
            ys = np.array([(f["lm"][4][1] + f["lm"][5][1]) / 2 for f in d["frames"]])
            lo, hi = ys.min(), ys.max(); mid = lo + 0.5 * (hi - lo)
            lower = [f["lm"] for f, sy in zip(d["frames"], ys) if sy >= mid]
            X = np.array([form_features(lm, aspect) for lm in lower], dtype=np.float32)
            clip_id = d["id"]
            clips.append((f"{source}:{os.path.basename(path)[:-5]}", label, y, X, lower, aspect, clip_id))
ids = sorted({c[6] for c in clips})
print(f"{len(clips)} clip variants of {len(ids)} clips from {SOURCES}: {sum(1 for c in clips if c[1]=='good_form')} good, {sum(1 for c in clips if c[1]=='bad_form')} bad")
random.shuffle(clips)
rest = [i for i in ids if i not in CORPUS_CLIPS]
random.shuffle(rest)
held_ids = (CORPUS_CLIPS if os.environ.get("HOLD_OUT", "corpus") == "corpus" else set()) | set(rest[: int(round(float(os.environ.get("RANDOM_HOLD_OUT", "0.15")) * len(rest)))])
held = {c[0] for c in clips if c[6] in held_ids}
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
# v4: the classifier also has to work on bodies it never saw (the corpus's other person scored 0.0-0.4 on clean
# reps with v3). Each augmented copy therefore also stretches the limb segments (upper/lower arm, thigh, shin)
# by independent random factors of +-AUG_LIMB and the whole body vertically by +-AUG_STRETCH, imitating other
# proportions and camera heights.
AUG_LIMB = float(os.environ.get("AUG_LIMB", "0.15"))
AUG_STRETCH = float(os.environ.get("AUG_STRETCH", "0.12"))
# A phone lying on the floor close to the head sees the far end of the body smaller and its hips nearer the
# floor line (the corpus's IMG_1360: clean reps whose hips measure 0.10-0.16 torso below the shoulder-ankle
# line, a sag by Kalp's camera's standard). AUG_PERSP shrinks the body towards the floor line (wrist-ankle)
# by a factor that grows linearly from the head end (1) to the feet end (1 / (1 + AUG_PERSP)), per copy.
AUG_PERSP = float(os.environ.get("AUG_PERSP", "0.6"))
rng = np.random.default_rng(SEED)

def perspective(Q):
    """Q: N x 12 x 2 square units. Foreshortens towards the feet as a floor-level camera near the head would."""
    Q = Q.copy()
    N = len(Q)
    W = (Q[:, 0] + Q[:, 1]) / 2; A = (Q[:, 10] + Q[:, 11]) / 2; S = (Q[:, 4] + Q[:, 5]) / 2
    k = rng.uniform(0, AUG_PERSP, (N, 1))
    d = A - W; L = np.linalg.norm(d, axis=1, keepdims=True) + 1e-6; u = d / L  # floor direction, wrist -> ankle
    n = np.stack([-u[:, 1], u[:, 0]], 1)                                          # floor normal
    for j in range(12):
        rel = Q[:, j] - W
        along = (rel * u).sum(1, keepdims=True); height = (rel * n).sum(1, keepdims=True)
        frac = np.clip(along / L, 0, 1.3)                                          # 0 at the hands, 1 at the feet
        scale = 1 / (1 + k * frac)
        Q[:, j] = W + u * along * scale + n * height * scale
    return Q

def stretch_limbs(Q):
    """Q: N x 12 x 2. Moves the elbows/wrists along the arm and the knees/ankles along the leg by random segment scales."""
    Q = Q.copy()
    N = len(Q)
    for side in (0, 1):
        sh, el, wr = 4 + side, 2 + side, 0 + side
        hp, kn, an = 6 + side, 8 + side, 10 + side
        for a, b, c in ((sh, el, wr), (hp, kn, an)):
            s1 = rng.uniform(1 - AUG_LIMB, 1 + AUG_LIMB, (N, 1))
            s2 = rng.uniform(1 - AUG_LIMB, 1 + AUG_LIMB, (N, 1))
            newb = Q[:, a] + (Q[:, b] - Q[:, a]) * s1
            Q[:, c] = newb + (Q[:, c] - Q[:, b]) * s2
            Q[:, b] = newb
    return Q

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
        if AUG_LIMB: Q = stretch_limbs(Q)
        if AUG_PERSP: Q = perspective(Q)
        if AUG_STRETCH:
            hip = (Q[:, 6, :] + Q[:, 7, :]) / 2
            Q[:, :, 1] = hip[:, None, 1] + (Q[:, :, 1] - hip[:, None, 1]) * rng.uniform(1 - AUG_STRETCH, 1 + AUG_STRETCH, (N, 1))
        Q = Q + rng.normal(0, AUG_JITTER, Q.shape)
        for q in Q:
            out.append(form_features([[x / aspect, y] for x, y in q], aspect))  # noqa: the augmented copy has no z/visibility
    return np.array(out, dtype=np.float32)

train = [c for c in clips if c[0] not in held]; test = [c for c in clips if c[0] in held]
Xtr, ytr = stack(train); Xte, yte = stack(test)
if AUG_COPIES:
    Xa = np.concatenate([augment_clip(c[4], c[5]) for c in train]); ya = np.concatenate([np.full(AUG_COPIES * len(c[3]), c[2], dtype=np.float32) for c in train])
    Xtr = np.concatenate([Xtr, Xa]); ytr = np.concatenate([ytr, ya])
mean = Xtr.mean(0); scale = Xtr.std(0) + 1e-6
Xtr_s = (Xtr - mean) / scale; Xte_s = (Xte - mean) / scale
print(f"train {len(Xtr)} frames from {len(train)} clip variants, held-out {len(Xte)} frames from {len(test)} variants of {sorted(held_ids)}")

def build(i):
    return tf.keras.Sequential([
        tf.keras.Input(shape=(N_FEATURES,), name=f"form_features_{i}"),
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
inp = tf.keras.Input(shape=(N_FEATURES,), name="form_features")
outs = [m(inp) for m in members]
model = tf.keras.Model(inp, outs[0] if len(outs) == 1 else tf.keras.layers.Average(name="average")(outs), name="pushup_form_v4")
p = model.predict(Xte_s, verbose=0)[:, 0]
acc = float(((p > 0.5) == (yte > 0.5)).mean())
per_clip = [(c[0], c[1], float((model.predict((c[3] - mean) / scale, verbose=0)[:, 0] > 0.5).mean())) for c in sorted(test, key=lambda c: c[0])]
print(f"held-out frame accuracy {acc:.4f}")
for cid, label, share in per_clip: print(f"  {label:9} {cid:10} P(good)>0.5 on {share:.0%} of lower-half frames")
OUT = os.environ.get("OUT", "scripts/form_v4")
model.save(f"{OUT}.h5")
json.dump({"mean": [float(v) for v in mean], "scale": [float(v) for v in scale]}, open(f"{OUT}_scaler.json", "w"))
scaler_ts = f"""// GENERATED by scripts/train_form_model.py — do not edit by hand.
// StandardScaler of the {N_FEATURES} form features (src/formFeatures.ts, FEATURES={FEATURES}) fitted on the training clips' lower-half frames
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
json.dump({"note": f"{N_FEATURES} form features (src/formFeatures.ts, {FEATURES}) and Keras P(good) of form_v4.h5; generated by scripts/train_form_model.py",
           "frames": [{"features": [float(v) for v in Xte[i]], "prob": float(p[i]), "label": float(yte[i])} for i in pick]},
          open(os.environ.get("PROBS_OUT", "tests/fixtures/form_v4_probs.json"), "w"))
json.dump({"features": FEATURES, "sources": SOURCES, "held_out_clips": sorted(held_ids), "held_out_variants": sorted(held), "held_out_accuracy": acc, "train_frames": int(len(Xtr)), "test_frames": int(len(Xte)), "per_clip": per_clip}, open(f"{OUT}_report.json", "w"), indent=1)
print(f"saved {OUT}.h5, {OUT}_scaler.json, {OUT}_report.json" + ("" if os.environ.get("NO_TS") else ", src/scaler.ts"))
