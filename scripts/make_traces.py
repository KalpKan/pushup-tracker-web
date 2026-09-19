"""Run the ORIGINAL Python pipeline (legacy mediapipe.solutions.pose, model_complexity=1, plus the Keras
form model with the baked scaler) over every clip in tests/fixtures/clips/ground_truth.json and write a
slim per-frame trace to tests/fixtures/traces/<id>.json: frame, t, shoulderY, prob, features (36).
tests/corpus.test.ts replays these through the TypeScript rep counter against the hand-labelled counts,
so the counter can be tuned in vitest without a browser. Frames are downscaled to 640 px wide (what the
browser gets from the camera). Needs the .venv described in README "Regenerating the exports".

usage: .venv/bin/python scripts/make_traces.py [clip-id ...]   (default: every clip)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.chdir(os.path.join(HERE, ".."))
import cv2, numpy as np, mediapipe as mp
from keras_model import build_model

gt = json.load(open("tests/fixtures/clips/ground_truth.json"))
wanted = set(sys.argv[1:])
scaler = json.load(open("scripts/scaler.json")); MEAN, SCALE = np.array(scaler["mean"]), np.array(scaler["scale"])
model = build_model()
mp_pose = mp.solutions.pose
L = mp_pose.PoseLandmark
K = [L.LEFT_WRIST, L.RIGHT_WRIST, L.LEFT_ELBOW, L.RIGHT_ELBOW, L.LEFT_SHOULDER, L.RIGHT_SHOULDER,
     L.LEFT_HIP, L.RIGHT_HIP, L.LEFT_KNEE, L.RIGHT_KNEE, L.LEFT_ANKLE, L.RIGHT_ANKLE]
os.makedirs("tests/fixtures/traces", exist_ok=True)
for clip in gt["clips"]:
    if wanted and clip["id"] not in wanted: continue
    path = clip["path"]
    if not os.path.exists(path):
        print(f"skip {clip['id']}: {path} not found"); continue
    pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
    cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS)
    frames = []; i = 0
    while True:
        ok, fr = cap.read()
        if not ok: break
        h, w = fr.shape[:2]
        if w > 640: fr = cv2.resize(fr, (640, int(h * 640 / w)))
        res = pose.process(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
        if res.pose_landmarks:
            lm = res.pose_landmarks.landmark
            feats = [round(float(v), 4) for k in K for v in (lm[k].x, lm[k].y, lm[k].z)]
            sy = (lm[L.LEFT_SHOULDER].y + lm[L.RIGHT_SHOULDER].y) / 2
            frames.append({"frame": i, "t": round(i / fps, 3), "shoulderY": round(float(sy), 4), "features": feats})
        else:
            frames.append({"frame": i, "t": round(i / fps, 3), "shoulderY": None, "features": None})
        i += 1
    cap.release(); pose.close()
    det = [f for f in frames if f["features"]]
    if det:
        X = np.array([f["features"] for f in det], dtype=np.float32)
        for f, p in zip(det, model.predict((X - MEAN) / SCALE, verbose=0)[:, 0]): f["prob"] = round(float(p), 4)
    out = f"tests/fixtures/traces/{clip['id']}.json"
    json.dump({"id": clip["id"], "source": os.path.basename(path), "fps": fps, "width": 640,
               "generator": "scripts/make_traces.py (legacy mediapipe.solutions.pose 0.10.14, model_complexity=1; Keras pushup_model_augmented.h5 with the baked scaler)",
               "frames": frames}, open(out, "w"), separators=(",", ":"))
    print(f"{out}: {i} frames @ {fps:.2f} fps, {len(det)} with a pose")
print("ALLDONE")
