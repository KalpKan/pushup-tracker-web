"""Run the SAME pose model the site uses (MediaPipe Tasks PoseLandmarker, public/models/pose_landmarker_full.task,
VIDEO mode) over Kalp's labelled training clips (data/good_form, data/bad_form; personal, not in the repo) and
write one JSON per clip with the 12 landmarks the form classifier reads (x, y, z, visibility per frame) to
tests/fixtures/training/<label>/<clip>.json (git-ignored).

Why: the original classifier was trained on landmarks from the legacy mediapipe.solutions.pose. The Tasks
model puts the wrist/elbow z up to 0.4 off, and on the site the old network then called every bottom of
bad_IMG_4456 "good" (P 0.98-1.00 where Python said 0.05). Training on the site's own landmarks removes
that mismatch (scripts/train_form_model.py).

usage: .venv/bin/python scripts/make_training_landmarks.py [--data DIR]
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
import cv2, mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

DEFAULT_DATA = "/Users/kalp/Desktop/Out and About/Sidequest/AI_Pushup_Tracking/data"
IDX = [15, 16, 13, 14, 11, 12, 23, 24, 25, 26, 27, 28]  # L/R wrist, elbow, shoulder, hip, knee, ankle

ap = argparse.ArgumentParser(); ap.add_argument("--data", default=DEFAULT_DATA); ap.add_argument("clips", nargs="*")
args = ap.parse_args()
out_root = "tests/fixtures/training"
for label in ("good_form", "bad_form"):
    src_dir = os.path.join(args.data, label)
    os.makedirs(os.path.join(out_root, label), exist_ok=True)
    for name in sorted(os.listdir(src_dir)):
        if not name.lower().endswith(".mp4") or "(1)" in name:  # "(1)" files are duplicate copies
            continue
        clip_id = name.replace("Copy of ", "").replace(".mp4", "")
        if args.clips and clip_id not in args.clips: continue
        out = os.path.join(out_root, label, f"{clip_id}.json")
        if os.path.exists(out): continue
        opts = vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path="public/models/pose_landmarker_full.task"),
            running_mode=vision.RunningMode.VIDEO, num_poses=1,
            min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5, min_tracking_confidence=0.5)
        lm = vision.PoseLandmarker.create_from_options(opts)
        cap = cv2.VideoCapture(os.path.join(src_dir, name)); fps = cap.get(cv2.CAP_PROP_FPS) or 30
        frames = []; i = 0; t0 = time.time(); w = h = 0
        while True:
            ok, fr = cap.read()
            if not ok: break
            h, w = fr.shape[:2]
            if w > 640: fr = cv2.resize(fr, (640, int(h * 640 / w))); h, w = fr.shape[:2]
            res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)), int(i * 1000 / fps))
            if res.pose_landmarks:
                p = res.pose_landmarks[0]
                frames.append({"t": round(i / fps, 3), "lm": [[round(p[k].x, 4), round(p[k].y, 4), round(p[k].z, 4), round(p[k].visibility, 3)] for k in IDX]})
            i += 1
        cap.release(); lm.close()
        json.dump({"id": clip_id, "label": label, "fps": fps, "width": w, "height": h, "frames": frames}, open(out, "w"), separators=(",", ":"))
        print(f"{label}/{clip_id}: {len(frames)}/{i} frames with a pose, {time.time() - t0:.0f}s", flush=True)
print("ALLDONE")
