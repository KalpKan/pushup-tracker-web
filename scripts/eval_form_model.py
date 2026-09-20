"""Score a form classifier (Keras .h5 + the StandardScaler baked into src/scaler.ts, or another scaler json)
against the hand-labelled bottoms of the ground-truth corpus on all THREE landmark trace sets (Python legacy
landmarks in tests/fixtures/traces, the site's own browser landmarks in tests/fixtures/traces-browser, and the
browser landmarks of the horizontally flipped clips in tests/fixtures/traces-browser-mirrored).
For every labelled rep the mean P(good) over +-0.25 s of the labelled bottom is thresholded at 0.5 and
compared with the label; high-confidence reps are counted, misses are listed. This is what
tests/corpus.test.ts measures through the real counter, minus the counter; use it to iterate on
scripts/train_form_model.py quickly (seconds per run).

usage: .venv/bin/python scripts/eval_form_model.py [model.h5] [scaler.json]
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(os.path.join(HERE, "..")); sys.path.insert(0, HERE)
import numpy as np
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
import tensorflow as tf

model_path = sys.argv[1] if len(sys.argv) > 1 else "scripts/form_v2.h5"
if len(sys.argv) > 2:
    sc = json.load(open(sys.argv[2])); MEAN, SCALE = np.array(sc["mean"]), np.array(sc["scale"])
else:
    ts = open("src/scaler.ts").read()
    MEAN = np.array(json.loads(re.search(r"MEAN: readonly number\[\] = (\[.*?\]);", ts).group(1)))
    SCALE = np.array(json.loads(re.search(r"SCALE: readonly number\[\] = (\[.*?\]);", ts).group(1)))
model = tf.keras.models.load_model(model_path)
ASPECT = 16 / 9

from form_features import form_features as _ff
def form_features(v, aspect):
    """The 36-float trace vector (x, y, z per landmark) -> the classifier's inputs."""
    return _ff([[v[i * 3], v[i * 3 + 1]] for i in range(12)], aspect)

gt = json.load(open("tests/fixtures/clips/ground_truth.json"))
summary = {}
for name, d in (("python", "traces"), ("browser", "traces-browser"), ("mirrored", "traces-browser-mirrored")):
    n = ok = 0; misses = []; rows = []
    for clip in gt["clips"]:
        path = f"tests/fixtures/{d}/{clip['id']}.json"
        if not os.path.exists(path): continue
        tr = json.load(open(path))
        frames = [f for f in tr["frames"] if f.get("features")]
        X = np.array([form_features(f["features"], ASPECT) for f in frames], dtype=np.float32)
        P = model.predict((X - MEAN) / SCALE, verbose=0)[:, 0]
        T = np.array([f["t"] for f in frames])
        for rep in clip["reps"]:
            sel = np.abs(T - rep["bottom_s"]) <= 0.25
            if not sel.any(): continue
            p = float(P[sel].mean())
            verdict = "good" if p > 0.5 else "bad"
            rows.append(f"  {clip['id']:14} {rep['bottom_s']:5}s {rep['form']:4} {rep['confidence'][0]} p={p:.2f} {'ok' if verdict == rep['form'] else 'MISS'}")
            if rep["confidence"] != "high": continue
            n += 1
            if verdict == rep["form"]: ok += 1
            else: misses.append(f"{clip['id']} {rep['bottom_s']}s label {rep['form']} p={p:.2f}")
    summary[name] = (ok, n)
    print(f"[{name}] classifier alone at the labelled bottoms: {ok}/{n} high-confidence reps match")
    for m in misses: print("   MISS", m)
    if os.environ.get("VERBOSE"): print("\n".join(rows))
print(json.dumps(summary))
