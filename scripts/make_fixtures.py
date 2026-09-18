"""Run the ORIGINAL Python pipeline (legacy MediaPipe Pose + Keras model + shoulder-height state
machine, copied verbatim from test_pushup_form.py in the old repo) on a window of a test video and
write a JSON fixture the TypeScript unit tests replay.

usage: .venv/bin/python scripts/make_fixtures.py <video> <start_frame> <end_frame> <fixture_name>
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import cv2
import mediapipe as mp
import numpy as np
from keras_model import build_model

video, start, end, name = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
scaler = json.load(open("scripts/scaler.json"))
MEAN, SCALE = np.array(scaler["mean"]), np.array(scaler["scale"])
model = build_model()

mp_pose = mp.solutions.pose
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
KEYPOINTS = [mp_pose.PoseLandmark.LEFT_WRIST, mp_pose.PoseLandmark.RIGHT_WRIST,
             mp_pose.PoseLandmark.LEFT_ELBOW, mp_pose.PoseLandmark.RIGHT_ELBOW,
             mp_pose.PoseLandmark.LEFT_SHOULDER, mp_pose.PoseLandmark.RIGHT_SHOULDER,
             mp_pose.PoseLandmark.LEFT_HIP, mp_pose.PoseLandmark.RIGHT_HIP,
             mp_pose.PoseLandmark.LEFT_KNEE, mp_pose.PoseLandmark.RIGHT_KNEE,
             mp_pose.PoseLandmark.LEFT_ANKLE, mp_pose.PoseLandmark.RIGHT_ANKLE]

cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS)
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
frames = []
i = 0
while cap.isOpened() and i < end:
    ret, frame = cap.read()
    if not ret:
        break
    if i >= start:
        res = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        if res.pose_landmarks:
            lm = res.pose_landmarks.landmark
            feats = [float(v) for k in KEYPOINTS for v in (lm[k].x, lm[k].y, lm[k].z)]
            shoulder_y = (lm[mp_pose.PoseLandmark.LEFT_SHOULDER].y + lm[mp_pose.PoseLandmark.RIGHT_SHOULDER].y) / 2
            all33 = [[float(p.x), float(p.y), float(p.z)] for p in lm]
            frames.append({"frame": i, "features": feats, "shoulderY": float(shoulder_y), "landmarks": all33})
        else:
            frames.append({"frame": i, "features": None, "shoulderY": None, "landmarks": None})
    i += 1
cap.release()

detected = [f for f in frames if f["features"] is not None]
X = np.array([f["features"] for f in detected], dtype=np.float32)
probs = model.predict((X - MEAN) / SCALE, verbose=0)[:, 0]
for f, p in zip(detected, probs):
    f["prob"] = float(p)

# ---- state machine, verbatim from test_pushup_form.py (plus a "bad rep" event so the UI can show attempts)
rep_count = 0
top_position_reached = False
bottom_position_reached = False
good_top_position = False
good_bottom_position = False
shoulder_min = float("inf")
shoulder_max = float("-inf")
first_rep_thresholds_set = False
frame_buffer = 10
frame_counter = 0
events = []
total_reps = 0
for f in detected:
    is_good_form = f["prob"] > 0.5
    shoulder_y = f["shoulderY"]
    if not first_rep_thresholds_set:
        shoulder_min = shoulder_y
        shoulder_max = shoulder_y
        first_rep_thresholds_set = True
    shoulder_min = min(shoulder_min, shoulder_y)
    shoulder_max = max(shoulder_max, shoulder_y)
    shoulder_range = shoulder_max - shoulder_min
    top_threshold = shoulder_min + (shoulder_range * 0.1)
    bottom_threshold = shoulder_max - (shoulder_range * 0.1)
    if frame_counter < frame_buffer:
        frame_counter += 1
        continue
    if shoulder_y < top_threshold:
        if not top_position_reached:
            top_position_reached = True
            good_top_position = is_good_form
    elif shoulder_y > bottom_threshold:
        if top_position_reached and not bottom_position_reached:
            bottom_position_reached = True
            good_bottom_position = is_good_form
    if top_position_reached and bottom_position_reached and shoulder_y < top_threshold:
        good = bool(good_top_position and good_bottom_position)
        if good:
            rep_count += 1
        total_reps += 1
        events.append({"frame": f["frame"], "good": good})
        bottom_position_reached = False
        good_bottom_position = False
        top_position_reached = False

out = {
    "name": name,
    "source": os.path.basename(video),
    "fps": fps,
    "startFrame": start,
    "endFrame": end,
    "generator": "scripts/make_fixtures.py (legacy mediapipe.solutions.pose 0.10.14, model_complexity=1)",
    "frames": frames,
    "events": events,
    "goodReps": rep_count,
    "totalReps": total_reps,
}
os.makedirs("tests/fixtures", exist_ok=True)
path = f"tests/fixtures/{name}.json"
json.dump(out, open(path, "w"))
good_frames = sum(1 for f in detected if f["prob"] > 0.5)
print(f"{path}: video {total} frames @ {fps:.1f} fps; window {start}-{end}: {len(frames)} frames, {len(detected)} with a pose, "
      f"{good_frames} good-form frames, goodReps={rep_count} totalReps={total_reps} events={events}")
ys = [f["shoulderY"] for f in detected]
print("shoulderY min/max:", min(ys), max(ys))
