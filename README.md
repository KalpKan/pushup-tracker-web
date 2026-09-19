# Pushup Form Tracker (browser)

**Live:** https://pushups.kalpkan.com

Counts your pushups from the webcam, grades the form of every rep and says why a rep was bad, entirely inside the browser. Nothing is uploaded: the pose model, the WASM runtime and the form classifier are all served from this site and run on your device. It started as a port of the Python desktop tool in [KalpKan/AI-Pushup-Form-Tracker](https://github.com/KalpKan/AI-Pushup-Form-Tracker) (MediaPipe Pose + a small Keras network) and was rebuilt on 2026-09-19 around a hand-labelled corpus of 15 real clips so that it counts every rep, the same way every time, on a laptop or a phone.

## What it does

1. **Pose:** MediaPipe `PoseLandmarker` (full model, VIDEO mode, GPU delegate with a CPU fallback, up to two people) finds 33 body landmarks on each decoded video frame (`requestVideoFrameCallback`, so a 30 fps clip is analysed 30 times a second, not 60). With two people in the frame the biggest body is tracked and the overlay asks for one person.
2. **Geometry (`src/form.ts`):** from 12 landmarks (wrists, elbows, shoulders, hips, knees, ankles) it measures, in units of your own torso length and corrected for the frame's aspect ratio, the hip's distance from the shoulder–ankle line, the knee angle and the body's angle to the floor. Rules: hips more than 0.18 torso below the line → **hips sagging**; more than 0.26 above → **hips too high**; knee angle under 130° → **knees down**; body angle over 30° or knees bent → not a plank, so it cannot be the top of a rep (standing, kneeling and walking in never count).
3. **Form classifier (`src/formFeatures.ts`, `src/classifier.ts`):** a 24→32→16→1 sigmoid MLP (TensorFlow.js) trained by `scripts/train_form_model.py` on the landmarks of Kalp's 90-odd good- and bad-form training clips, extracted with the **same** MediaPipe Tasks model the site runs (the original Keras network was trained on the legacy Python model's landmarks, whose `z` differs by up to 0.4, and called every bottom of a bad clip "good" in the browser). Inputs are x, y only, centred on the hips, scaled by the torso and mirrored so both facing directions look alike. It is consulted at the **bottom** of a rep only, where the training labels mean something, and its "bad" is shown as **keep your body straight**.
4. **Reps (`src/repCounter.ts`):** a time-based zig-zag on the shoulders' height, scaled by the body, with no warm-up. The first plank-like frame is the top; a descent opens once the shoulders have dropped at least a quarter of a torso length (later: half the depth of your recent reps, so a partial dip says **go lower** and is not counted); the rep is counted when the shoulders are back up 65 % of that rep's own depth. Each end's verdict is the majority of the frames spent there, so one noisy frame never flips a rep. A **good rep** has no fault at the top or the bottom; other cycles are **attempts** with the reason shown on the video and in the "Form now" tile. Every decision is on seconds and body-scaled distances, never frame counts, so 10 fps on a phone and 30 fps on a laptop give the same count (a test drops frames to check).
5. **Placement hints (`src/hints.ts`):** too dark, no body visible, head or feet out of frame, two people, frontal instead of side-on; each shown after 0.7 s of persistence.
6. **Demo mode:** a bundled 8.5-second clip (`public/demo/pushups.mp4`, 4 attempts, 2 good) runs through the same pipeline, so someone without a webcam still sees it work.

The pipeline is tested against a **hand-labelled corpus** (`tests/fixtures/clips/ground_truth.json`, 15 clips, every rep's bottom time and form label, plus the movements that must not count) in two ways: `tests/corpus.test.ts` replays the landmarks of every clip (recorded once with the Python model and once with the site's own model in Chrome, `tests/fixtures/traces*/`) through the real page pipeline and fails on any clip outside the tolerance, at 30/20/15/10 fps; `scripts/e2e-corpus.mjs` plays every clip into Chrome's fake camera and reads the count off the live page.

## Limits (honest ones)

- The classifier was trained on one person's videos, filmed side-on with the camera on the floor. Film yourself side-on, whole body in frame, in decent light; a frontal view gets a hint, not a verdict.
- The geometry is 2D: a sag or pike that only shows in depth is invisible; a shallow sag is mostly the classifier's call.
- The clips used to tune the thresholds include three of the training clips, so the corpus numbers for those are not held-out numbers; the classifier's own held-out accuracy is in `src/scaler.ts`.
- Phones work (front camera, mirrored); the full pose model on a phone GPU runs at roughly 8 to 15 fps, which the counter tolerates by design (same count at 10 fps in the tests), but the skeleton will look choppy.
- Lighthouse performance is kept ≥ 0.85 by loading nothing heavy until a button is pressed: the first paint is ~4 KB of JS. The 20 MB of models/WASM download on the first click, are cached for a year (`vercel.json`), and are the deliberate trade-off for running with zero servers.

## Privacy and analytics

No frame, landmark or image ever leaves the browser. After the initial download the page makes no network calls except PostHog analytics, sent through the site's own `/ingest` path (cookieless, inputs masked). Three named events: `session_started {mode}`, `rep_counted {good, reason}` (reason = the words shown for a bad rep, never landmarks), `demo_video_played`. Without the PostHog key the analytics code is never even loaded.

## How to run this (for a non-developer)

You need [Node.js](https://nodejs.org) (version 22 or newer) installed once. Then, in a terminal:

```bash
git clone https://github.com/KalpKan/pushup-tracker-web.git
cd pushup-tracker-web
npm install          # downloads the libraries (one time)
npm run dev          # prints a local address such as http://localhost:5173
```

Open that address in Chrome or Safari, press **Play demo clip** (no camera needed) or **Start camera**. `npm test` runs every check, including the labelled corpus in `tests/fixtures/clips/` (it fails if any clip is counted wrong); the same clips can be played into the real camera path with `node scripts/make-mjpeg.mjs && GPU=1 node scripts/e2e-corpus.mjs http://localhost:5173/`. Add `?trace` to the page URL and `window.__pushupsTrace` collects every analysed frame for debugging (nothing is sent anywhere).

## How to deploy this

The site is a static Vite build hosted on Vercel (Hobby, $0), project **`pushups`** in the "Kk's projects" team, connected to this GitHub repository. **Every push to `main` deploys automatically**; nothing else is needed. To deploy by hand: `npx vercel@latest deploy --prod --yes --scope kks-projects-2edcb11a` from a checkout. `npm run build` copies the MediaPipe WASM files from `node_modules` into `public/wasm/` and writes `dist/`. The domain `pushups.kalpkan.com` is a DNS-only CNAME on Cloudflare pointing at the project (details in the portfolio repo's `docs/DNS_PENDING.md`).

Health check: https://pushups.kalpkan.com/health.json returns `{"ok":true,"service":"pushups"}`.

## Where the settings live

| Setting | Where | Notes |
|---|---|---|
| `VITE_PUBLIC_POSTHOG_KEY` | Vercel → project `pushups` → Settings → Environment Variables (Production + Preview) | Public `phc_` token of the PostHog project "Kalp portfolio". Leave unset locally and analytics stay off. |
| `VITE_PUBLIC_POSTHOG_HOST` | same | Always `/ingest`; `vercel.json` rewrites that path to PostHog. |
| Domain | Vercel project `pushups` → Domains, and Cloudflare DNS for `kalpkan.com` | CNAME `pushups` → the project-specific `*.vercel-dns-017.com` target, proxy OFF. |
| Models | `public/models/pose_landmarker_full.task` (9.4 MB, from Google's MediaPipe model page; the **full** variant), `public/models/form/` (the form classifier v2, converted from `scripts/form_v2.h5`) | Committed; `public/wasm/` is copied at build time and not committed. The classifier must be retrained (`scripts/train_form_model.py`) if the pose model file changes. |

Names only live here and in `.env.example`; values live only in Vercel.

## Files

| Path | What |
|---|---|
| `src/features.ts` | 12-landmark feature vector + shoulder height |
| `src/form.ts` | geometry (torso, hip deviation, knee/body angles) and the fault rules |
| `src/formFeatures.ts`, `src/scaler.ts`, `src/classifier.ts` | the classifier's 24 inputs, its baked standardisation (generated by `scripts/train_form_model.py`), TF.js loader + `predict` |
| `src/repCounter.ts` | the time-based, body-scaled rep counter |
| `src/tracker.ts` | per-frame pipeline step shared by the page and the tests (rules + counter + smoothed live verdict) |
| `src/hints.ts` | camera-placement hints |
| `src/pose.ts` | MediaPipe PoseLandmarker setup (self-hosted WASM + model) |
| `src/session.ts` | camera/demo loop, per-frame pipeline, hint debouncing, optional `?trace` recording |
| `src/draw.ts` | skeleton, count, verdict with reason, rep flash and hints |
| `src/track.ts`, `src/analytics.ts` | lazy PostHog wrapper and the three events |
| `scripts/make_training_landmarks.py`, `scripts/train_form_model.py` | extract landmarks from the (personal, not committed) training clips with the site's pose model and train/export the classifier (Python 3.10 venv with `tensorflow==2.15`, `tensorflowjs`, `mediapipe==0.10.14`, `opencv-python`, `imageio-ffmpeg`) |
| `scripts/e2e-demo.mjs` | headless-Chrome end-to-end run of the demo clip (`node scripts/e2e-demo.mjs <url>`) |
| `tests/` | vitest unit tests (counter, rules, hints, features, classifier port) + fixtures |
| `tests/fixtures/clips/` | 9 real pushup clips with hand-counted reps and form labels (`ground_truth.json`, README there); 5 more personal clips are referenced by path outside the repo |
| `tests/fixtures/traces/`, `tests/fixtures/traces-browser/`, `tests/corpus.test.ts` | landmark traces of every clip (Python model; the site's own model recorded in Chrome), replayed through the page pipeline against the ground truth; a miss fails `npm test` |
| `scripts/make-mjpeg.mjs`, `scripts/e2e-corpus.mjs` | feed every clip to Chrome's fake camera and compare the on-screen counts with the ground truth (`GPU=1 node scripts/e2e-corpus.mjs <url>`); the consumer-grade test for live counting |
| `scripts/make-clips.sh`, `scripts/make_traces.py` | rebuild the clips and traces from Kalp's original recordings (only needed when a clip is added) |
| `.github/workflows/ci.yml` | GitHub Actions: typecheck, vitest (`--pool=forks --maxWorkers=1`), build, on every push and pull request |

## Retraining the form classifier

Only needed if the pose model file or the training clips change. The training clips are Kalp's own recordings (`~/Desktop/Out and About/Sidequest/AI_Pushup_Tracking/data/{good_form,bad_form}`), never committed; the extracted landmarks land in `tests/fixtures/training/` (git-ignored).

```bash
python3.10 -m venv .venv && .venv/bin/pip install tensorflow==2.15 tensorflowjs mediapipe==0.10.14 opencv-python imageio-ffmpeg
.venv/bin/python scripts/make_training_landmarks.py   # ~30 s per clip, run once
.venv/bin/python scripts/train_form_model.py          # -> scripts/form_v2.h5, src/scaler.ts, tests/fixtures/form_v2_probs.json, scripts/form_v2_report.json
.venv/bin/tensorflowjs_converter --input_format keras scripts/form_v2.h5 public/models/form
npm test                                              # the corpus and the port-fidelity test must stay green
```

## License

MIT (code). The MediaPipe model is Apache-2.0 from Google. Non-commercial portfolio project.
