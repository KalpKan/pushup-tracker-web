"""Per-frame input features of the form classifier, shared by train_form_model.py and eval_form_model.py.
src/formFeatures.ts computes the same numbers in the browser (tests/classifier.test.ts checks the two agree).

Input: 12 landmarks in the order wrist L/R, elbow L/R, shoulder L/R, hip L/R, knee L/R, ankle L/R, each [x, y, ...]
in frame-normalised units, plus the frame aspect (width / height): x is multiplied by it so that a horizontal
and a vertical distance mean the same number of pixels.

FEATURES=raw (v2/v3): the 12 points' x, y centred on the hip midpoint, divided by the torso length, mirrored
(x negated, left/right swapped) so the feet are always on the left. 24 numbers.
FEATURES=angles (v4): 18 body-invariant numbers, joint angles and body-scaled offsets, each symmetric in
left/right (min/max over the pair) and in facing (horizontal offsets are signed towards the head).
"""
import os
import numpy as np

FEATURES = os.environ.get("FEATURES", "angles")

def _pts(lm, aspect):
    return np.array([[p[0] * aspect, p[1]] for p in lm], dtype=np.float64)

def raw_features(lm, aspect):
    pts = _pts(lm, aspect)
    shoulder = (pts[4] + pts[5]) / 2; hip = (pts[6] + pts[7]) / 2; ankle = (pts[10] + pts[11]) / 2
    torso = np.linalg.norm(shoulder - hip) or 1e-6
    rel = (pts - hip) / torso
    if ankle[0] > shoulder[0]:  # facing the other way: mirror x and swap left/right
        rel[:, 0] *= -1
        rel = rel.reshape(6, 2, 2)[:, ::-1, :].reshape(12, 2)
    return rel.reshape(-1)

def _angle(a, b, c):
    v1 = a - b; v2 = c - b
    n = np.linalg.norm(v1) * np.linalg.norm(v2)
    if n == 0: return 180.0
    return float(np.degrees(np.arccos(np.clip(np.dot(v1, v2) / n, -1, 1))))

def _dev(a, b, p, facing):
    """Signed distance of p from the line a->b, positive = below the line (larger y) whichever way the body faces."""
    d = b - a; L = np.linalg.norm(d) or 1e-6
    return (d[0] * (p[1] - a[1]) - d[1] * (p[0] - a[0])) / L * facing

def angle_features(lm, aspect):
    pts = _pts(lm, aspect)
    wrist = (pts[0], pts[1]); elbow = (pts[2], pts[3]); shoulder = (pts[4], pts[5]); hip = (pts[6], pts[7]); knee = (pts[8], pts[9]); ankle = (pts[10], pts[11])
    S = (pts[4] + pts[5]) / 2; H = (pts[6] + pts[7]) / 2; K = (pts[8] + pts[9]) / 2; A = (pts[10] + pts[11]) / 2; W = (pts[0] + pts[1]) / 2; E = (pts[2] + pts[3]) / 2
    torso = np.linalg.norm(S - H) or 1e-6
    facing = 1.0 if A[0] > S[0] else -1.0   # +1: feet on the right of the shoulders
    head = -facing                            # unit x direction towards the head
    elbows = sorted(_angle(wrist[i], elbow[i], shoulder[i]) for i in (0, 1))
    shoulders = sorted(_angle(elbow[i], shoulder[i], hip[i]) for i in (0, 1))
    knees = sorted(_angle(hip[i], knee[i], ankle[i]) for i in (0, 1))
    hip_angle = _angle(S, H, A)
    body = np.degrees(np.arctan2(A[1] - S[1], abs(A[0] - S[0])))  # > 0: shoulders above the ankles
    return np.array([
        elbows[0] / 90, elbows[1] / 90,
        shoulders[0] / 90, shoulders[1] / 90,
        hip_angle / 90,
        knees[0] / 90, knees[1] / 90,
        _dev(S, A, H, facing) / torso,        # hip below (+) / above (-) the shoulder-ankle line
        _dev(H, A, K, facing) / torso,        # knee below / above the hip-ankle line
        body / 45,
        (H[1] - S[1]) / torso,                # shoulders above the hips (+)
        (W[0] - S[0]) * head / torso,         # wrist towards the head (+) of the shoulder
        (W[1] - S[1]) / torso,                # wrist below the shoulder (+)
        (E[0] - S[0]) * head / torso,
        (E[1] - S[1]) / torso,
        abs(A[0] - S[0]) / torso,             # body extension along the floor
        (pts[4][0] - pts[5][0]) * head / torso,  # left shoulder ahead of the right (+): rotation towards the camera
        (pts[6][0] - pts[7][0]) * head / torso,
    ], dtype=np.float64)

def form_features(lm, aspect):
    return angle_features(lm, aspect) if FEATURES == "angles" else raw_features(lm, aspect)

N_FEATURES = 18 if FEATURES == "angles" else 24
