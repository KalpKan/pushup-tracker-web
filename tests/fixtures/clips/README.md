# Ground-truth clips for the rep counter

Real pushup recordings with the rep count and per-rep form labelled by hand (`ground_truth.json`). They are
the acceptance test for "counts pushups correctly, in real time, from a webcam" in the portfolio repo's
`docs/reports/pushups-spec.md`.

| File | What | Person | Reps (good) |
|---|---|---|---|
| `../../../public/demo/pushups.mp4` | the bundled demo clip = `test_video3` 0–8.5 s | Kalp | 4 (2–3) |
| `test_video3.mp4` | clean reps, then a bottom hold with a worm ascent, then he stands up | Kalp | 5 (2–4) |
| `test_video.mp4` | two sagging reps, then two clean ones | Kalp | 4 (2) |
| `test_video_2.mp4` | reps, a downward-dog, knee pushups, a flat-on-the-floor rep | Kalp | 4 (0–2) |
| `test_video_4.mp4` | four clean reps then a cobra on the floor; the original was filmed upside down | Kalp | 5 (4) |
| `good_IMG_4378.mp4`, `good_IMG_4409.mp4` | training clips labelled *good* | Kalp | 8 (8), 5 (5) |
| `bad_IMG_4456.mp4`, `bad_IMG_4470.mp4`, `bad_IMG_4451.mp4` | training clips labelled *bad* (hip sag, collapse on the floor) | Kalp | 4 (0) each |
| `IMG_1305`, `IMG_1359`, `IMG_1360`, `IMG_1512`, `IMG_1513` | **not committed** (personal recordings, two of a different person); absolute paths in `ground_truth.json`; camera too close/low, a second person in the background, a pike pushup | mixed | see json |

All committed clips are 640 px wide, 30 fps, H.264, no audio, re-encoded from Kalp's originals by
`scripts/make-clips.sh` (source sha256 prefixes are in the json). The test videos were public in
`KalpKan/AI-Pushup-Form-Tracker` before its data purge; the training clips are Kalp's own.

Label changes after the fact are recorded in the json entry's `note` (FIX r2, 2026-09-19: `IMG_1359` rep 6 at
13.6 s went from high to medium confidence because the hips measure 0.33 torso above the shoulder–ankle line
there, a mild pike on the full-resolution frames).

How the labels were made (2026-09-18): frame contact sheets at 4 fps of every clip were read by the SPEC
agent and each top → bottom → top cycle was written down with the time of its lowest point; the Python
shoulder-height trace was used only to pin the times. Form follows the definition at the top of the json
(straight shoulder–hip–ankle line at the top and the bottom = good; sag, pike, knees, chest-first ascent =
bad), which is what the one-pager and the `data/good_form` / `data/bad_form` training folders mean.

Three ways the corpus is used:

1. `tests/corpus.test.ts` replays `../traces/<id>.json` (the legacy Python MediaPipe landmarks per frame,
   `scripts/make_traces.py`) and `../traces-browser/<id>.json` (the site's own MediaPipe Tasks landmarks,
   recorded in headless Chrome with `TRACE_DIR=… scripts/e2e-corpus.mjs`) through the page's pipeline
   (`src/tracker.ts` with the classifier). Fast, no browser; a clip outside the tolerance fails `npm test`
   (one known miss is marked `it.fails` in the test with its reason).
2. `scripts/e2e-corpus.mjs` feeds each clip to Chrome's fake camera (`scripts/make-mjpeg.mjs` first) and
   reads the counts off the live page: the real pipeline (MediaPipe in WASM/WebGL, TF.js, canvas) at
   real-time speed. This is the number that has to meet the bar.
3. A human on a phone (STATUS.md H15).
