# Pushup Form Tracker (browser)

**Live:** https://pushups.kalpkan.com

Counts your pushups from the webcam, grades the form of every rep and says why a rep was bad, entirely inside the browser. Nothing is uploaded: the pose model and the WASM runtime are served from this site and run on your device. It started as a port of the Python desktop tool in [KalpKan/AI-Pushup-Form-Tracker](https://github.com/KalpKan/AI-Pushup-Form-Tracker) (MediaPipe Pose + a small Keras network) and was rebuilt on 2026-09-19 around a hand-labelled corpus of 15 real clips so that it counts every rep, the same way every time, on a laptop or a phone, facing either way. The Keras network was retired the same day (see "Why there is no neural classifier").

## What it does

1. **Pose:** MediaPipe `PoseLandmarker` (full model, VIDEO mode, GPU delegate with a CPU fallback, up to two people) finds 33 body landmarks on each decoded video frame (`requestVideoFrameCallback`, so a 30 fps clip is analysed 30 times a second, not 60). With two people in the frame the biggest body is tracked and the overlay asks for one person.
2. **Geometry (`src/form.ts`):** from 12 landmarks (wrists, elbows, shoulders, hips, knees, ankles) it measures, in units of your own torso length, corrected for the frame's aspect ratio and signed by the way you face, the hip's distance from the shoulder–ankle line, the knee angle, the body's angle to the floor, and at the bottom where the elbows, wrists and hips sit relative to the shoulders. Rules anywhere in a rep: hips more than 0.18 torso below the line → **hips sagging**; more than 0.26 above → **hips too high**; knee angle under 130° → **knees down**; body angle over 30° → not a plank, so it cannot be the top of a rep (standing and walking in never count). A horizontal body with the knees down is a **knee plank**: a knee pushup is an attempt graded "knees down", while a rep that starts in a plank and bottoms out on the knees (dropping down to rest) is not an attempt at all. Rules at the bottom only, on the mean of the frames spent there: elbows not bent back behind the shoulders (less than 0.09 torso) → **dropped to the floor** (the body came down without the arms bending); chest kept more than 0.5 torso above the hands while the hips hang more than 0.2 torso below the shoulders → **hips sagging** (the chest-up sag). Every threshold was set on three landmark sets of the labelled corpus: the legacy Python model, the site's own model, and the site's own model on every clip flipped horizontally.
3. **Why there is no neural classifier:** the Python original's Keras MLP (retrained twice here as v2/v3 on the site's own landmarks) was retired on 2026-09-19 after TEST round 3 found it graded every bad rep good for a visitor facing the other way and flickered 0.97 → 0.01 between neighbouring frames. Held out honestly (the corpus clips excluded from training), a per-frame MLP on this data scored Kalp's own unseen bad clips at 0.5–0.9 (a coin) and every clean rep of a second person at 0.0–0.4, with raw coordinates or 18 joint angles, with limb-length and camera-perspective augmentation, trained on Python landmarks or on 170 recordings of the training clips through the site itself in both facings (`scripts/record-training-landmarks.mjs`, `scripts/train_form_model.py`, `scripts/eval_form_model.py` are kept so the experiment can be repeated). The rules above are what 2D landmarks can support; the one thing they cannot see is a rep that rests on the floor and pushes the chest up first with the arms properly bent (`bad_IMG_4456`), which now counts as a clean rep and says so in the tests.
4. **Reps (`src/repCounter.ts`):** a time-based zig-zag on the shoulders' height, scaled by the body, with no warm-up. The first plank-like frame is the top; a descent opens once the shoulders have dropped at least a quarter of a torso length (later: half the depth of your recent reps, so a partial dip says **go lower** and is not counted); the rep is counted when the shoulders are back up 65 % of that rep's own depth. Each end's verdict is the majority of the frames spent there (the top: the 0.4 s just before the descent, so a rest with the hips down between reps does not condemn the next one; the bottom: the frames within 20 % of the depth), so one noisy frame never flips a rep. A **good rep** has no fault at the top or the bottom; other cycles are **attempts** with the reason shown on the video and in the "Form now" tile. Every decision is on seconds and body-scaled distances, never frame counts, so 10 fps on a phone and 30 fps on a laptop give the same count (a test drops frames to check).
5. **Placement hints (`src/hints.ts`):** too dark, no body visible, head or feet out of frame (the head counts as out when most of its 11 face landmarks are past the edge **and** the guessed head has collapsed to under 0.13 torso across, which is what MediaPipe does for a cut-off head; a face merely touching the edge keeps its size and gets no hint), two people (a second pose only counts when its torso is at least 40 % of the first's and their boxes do not overlap, so the phantom MediaPipe returns for a body lying flat is ignored), frontal instead of side-on. A hint appears after 0.7 s of *any* problem (a half-detected body that flickers between "no pose" and "head out" no longer resets the timer) and clears after 0.7 s of clean frames. **While a hint is up, counting is paused**: the skeleton turns grey, the tile reads "paused", and nothing is counted or graded.
6. **Demo mode:** a bundled 8.5-second clip (`public/demo/pushups.mp4`, 4 attempts, 2–3 clean by a coach's eye; the fourth is a mild chest-first ascent that the geometry lets through, so the page reads 4 good of 4) runs through the same pipeline, so someone without a webcam still sees it work.
7. **Failure modes:** if the frame loop throws (a lost GPU context) or the pose model cannot be fetched, the session stops and the status line says what happened and to reload; a session that cannot start says why; both send a `session_failed` event. `scripts/e2e-failure-modes.mjs` exercises both cases in headless Chrome.

The pipeline is tested against a **hand-labelled corpus** (`tests/fixtures/clips/ground_truth.json`, 15 clips, every rep's bottom time and form label, plus the movements that must not count) in two ways: `tests/corpus.test.ts` replays the landmarks of every clip (recorded with the Python model, with the site's own model in Chrome, and with the site's own model on the clips flipped horizontally, `tests/fixtures/traces*/`) through the real page pipeline and fails on any clip outside the tolerance, at 30/20/15/10 fps, with the good count required to be identical across rates; `scripts/e2e-corpus.mjs` plays every clip into Chrome's fake camera (`MIRROR=1` for the flipped set) and reads the count off the live page.

## Limits (honest ones)

- Film yourself side-on (either way), whole body in frame, in decent light; a frontal view gets a hint, not a verdict.
- The geometry is 2D: a sag or pike that only shows in depth is invisible, and a rep that rests on the floor and pushes the chest up first with the arms bent looks like a clean rep (`bad_IMG_4456` in the corpus, counted as good and marked as a known miss in `tests/corpus.test.ts`). The demo clip's mild "worm" and `test_video`'s second sag (hips 0.1 torso below the line, inside what clean reps from another body reach) are graded good too; the corpus test pins the measured rate per landmark set (55/67, 58/67, 57/67 high-confidence verdicts on the Python, browser and mirrored sets) and fails if it drops.
- The thresholds were tuned on the same 15 clips the tests measure, so the corpus numbers are not held-out numbers; the three landmark sets (two of them recorded from the page itself) are the check that they are not tuned to one recording.
- Phones work (front camera, mirrored); the full pose model on a phone GPU runs at roughly 8 to 15 fps, which the counter tolerates by design (same count at 10 fps in the tests), but the skeleton will look choppy.
- Lighthouse performance is kept ≥ 0.85 by loading nothing heavy until a button is pressed: the first paint is ~4 KB of JS. The 20 MB of models/WASM download on the first click, are cached for a year (`vercel.json`), and are the deliberate trade-off for running with zero servers.

## Privacy and analytics

No frame, landmark or image ever leaves the browser. After the initial download the page makes no network calls except PostHog analytics, sent through the site's own `/ingest` path (cookieless, inputs masked). Four named events: `session_started {mode}`, `rep_counted {good, reason}` (reason = the words shown for a bad rep, never landmarks), `demo_video_played`, `session_failed {mode, message}` (the error text shown on the page). Without the PostHog key the analytics code is never even loaded.

## How to run this (for a non-developer)

You need [Node.js](https://nodejs.org) (version 22 or newer) installed once. Then, in a terminal:

```bash
git clone https://github.com/KalpKan/pushup-tracker-web.git
cd pushup-tracker-web
npm install          # downloads the libraries (one time)
npm run dev          # prints a local address such as http://localhost:5173
```

Open that address in Chrome or Safari, press **Play demo clip** (no camera needed) or **Start camera**. `npm test` runs every check, including the labelled corpus in `tests/fixtures/clips/` (it fails if any clip is counted wrong); the same clips can be played into the real camera path with `node scripts/make-mjpeg.mjs && GPU=1 node scripts/e2e-corpus.mjs http://localhost:5173/`. Add `?trace` to the page URL and `window.__pushupsTrace` collects every analysed frame for debugging (`?trace=full` also keeps every detected pose and the hint per frame; nothing is sent anywhere). `node scripts/e2e-hints.mjs <url> <dir with the synthetic cameras>` prints the hint timelines (black, two people, cropped head, frontal, portrait), and `.venv/bin/python scripts/eval_form_model.py` scores a classifier against the labelled bottoms on both landmark sets in seconds.

## How to deploy this

The site is a static Vite build hosted on Vercel (Hobby, $0), project **`pushups`** in the "Kk's projects" team, connected to this GitHub repository. **Every push to `main` deploys automatically**; nothing else is needed. To deploy by hand: `npx vercel@latest deploy --prod --yes --scope kks-projects-2edcb11a` from a checkout. `npm run build` copies the MediaPipe WASM files from `node_modules` into `public/wasm/` and writes `dist/`. The domain `pushups.kalpkan.com` is a DNS-only CNAME on Cloudflare pointing at the project (details in the portfolio repo's `docs/DNS_PENDING.md`).

Health check: https://pushups.kalpkan.com/health.json returns `{"ok":true,"service":"pushups"}`.

## Where the settings live

| Setting | Where | Notes |
|---|---|---|
| `VITE_PUBLIC_POSTHOG_KEY` | Vercel → project `pushups` → Settings → Environment Variables (Production + Preview) | Public `phc_` token of the PostHog project "Kalp portfolio". Leave unset locally and analytics stay off. |
| `VITE_PUBLIC_POSTHOG_HOST` | same | Always `/ingest`; `vercel.json` rewrites that path to PostHog. |
| Domain | Vercel project `pushups` → Domains, and Cloudflare DNS for `kalpkan.com` | CNAME `pushups` → the project-specific `*.vercel-dns-017.com` target, proxy OFF. |
| Models | `public/models/pose_landmarker_full.task` (9.4 MB, from Google's MediaPipe model page; the **full** variant) | Committed; `public/wasm/` is copied at build time and not committed. `/models/*` is cached by browsers for a year (`vercel.json`), so **a changed model file must get a new file name** (writing a new file over the old URL broke the page for every returning visitor on 2026-09-19, when the site still shipped a form classifier). The geometry thresholds were measured with this exact file; changing it means re-recording `tests/fixtures/traces-browser*/` and re-checking `npm test`. Any error inside the frame loop stops the session with a message instead of failing silently. |

Names only live here and in `.env.example`; values live only in Vercel.

## Files

| Path | What |
|---|---|
| `src/features.ts` | 12-landmark feature vector + shoulder height |
| `src/form.ts` | geometry (torso, hip deviation, knee/body angles, elbow/wrist/hip offsets at the bottom), the per-frame fault rules and the bottom-window rules |
| `src/repCounter.ts` | the time-based, body-scaled rep counter |
| `src/tracker.ts` | per-frame pipeline step shared by the page and the tests (rules + counter + smoothed live verdict) |
| `src/hints.ts` | camera-placement hints |
| `src/pose.ts` | MediaPipe PoseLandmarker setup (self-hosted WASM + model) |
| `src/session.ts` | camera/demo loop, per-frame pipeline, hint debouncing, optional `?trace` recording |
| `src/draw.ts` | skeleton, count, verdict with reason, rep flash and hints |
| `src/track.ts`, `src/analytics.ts` | lazy PostHog wrapper and the four events |
| `scripts/make_training_landmarks.py`, `scripts/record-training-landmarks.mjs`, `scripts/train_form_model.py`, `scripts/form_features.py`, `scripts/eval_form_model.py` | the retired classifier's pipeline, kept for the record: extract landmarks from the (personal, not committed) training clips with the Python copy of the pose model or by playing them into the site itself in both facings, train an MLP with a fixed corpus hold-out, score it at the labelled bottoms on the three trace sets (Python 3.10 venv with `tensorflow==2.15`, `mediapipe==0.10.14`, `opencv-python`, `imageio-ffmpeg`, `scikit-learn`) |
| `scripts/e2e-demo.mjs` | headless-Chrome end-to-end run of the demo clip (`node scripts/e2e-demo.mjs <url>`) |
| `scripts/e2e-hints.mjs`, `scripts/e2e-failure-modes.mjs` | hint timelines on synthetic fake cameras and real clips; the broken-loop / missing-model failure modes must end in a status message |
| `tests/` | vitest unit tests (counter, rules on real frames of both facings, hints on real cut-off and edge-touching heads, features) + fixtures |
| `tests/fixtures/clips/` | 9 real pushup clips with hand-counted reps and form labels (`ground_truth.json`, README there); 5 more personal clips are referenced by path outside the repo |
| `tests/fixtures/traces/`, `tests/fixtures/traces-browser/`, `tests/fixtures/traces-browser-mirrored/`, `tests/corpus.test.ts` | landmark traces of every clip (Python model; the site's own model recorded in Chrome; the same on the flipped clips), replayed through the page pipeline against the ground truth; a miss fails `npm test` (known misses are listed in the test with `it.fails`) |
| `scripts/make-mjpeg.mjs`, `scripts/e2e-corpus.mjs`, `scripts/normalize-trace.mjs` | feed every clip to Chrome's fake camera and compare the on-screen counts with the ground truth (`GPU=1 node scripts/e2e-corpus.mjs <url>`, `MIRROR=1` for the flipped clips); the consumer-grade test for live counting. `TRACE_DIR=` saves the page's own landmarks, `normalize-trace.mjs` turns one into a committed fixture |
| `scripts/make-clips.sh`, `scripts/make_traces.py` | rebuild the clips and traces from Kalp's original recordings (only needed when a clip is added) |
| `.github/workflows/ci.yml` | GitHub Actions: typecheck, vitest (`--pool=forks --maxWorkers=1`), build, on every push and pull request |

## Repeating the classifier experiment

The site no longer ships a classifier, but the scripts that showed why are kept. The training clips are Kalp's own recordings (`~/Desktop/Out and About/Sidequest/AI_Pushup_Tracking/data/{good_form,bad_form}`), never committed; extracted landmarks land in `tests/fixtures/training/` and `tests/fixtures/training-browser/` (git-ignored).

```bash
python3.10 -m venv .venv && .venv/bin/pip install tensorflow==2.15 mediapipe==0.10.14 opencv-python imageio-ffmpeg scikit-learn
.venv/bin/python scripts/make_training_landmarks.py            # Python copy of the pose model, ~30 s per clip
npm run build && npx vite preview --port 4177 --strictPort &   # then the site's own landmarks, both facings, ~20 min on 3 lanes
node scripts/record-training-landmarks.mjs http://localhost:4177/ --lanes 3
FEATURES=angles OUT=/tmp/exp .venv/bin/python scripts/train_form_model.py   # corpus clips held out (HOLD_OUT=corpus); writes /tmp/exp.h5, _scaler.json, _probs.json, _report.json and nothing else
FEATURES=angles .venv/bin/python scripts/eval_form_model.py /tmp/exp.h5 /tmp/exp_scaler.json   # verdicts at the labelled bottoms, three trace sets
```

Everything these scripts write is an experiment artefact under `OUT=` (git-ignored as `scripts/form_v*`); no page file, model URL or test fixture is touched, because the site's `src/classifier.ts`, `src/formFeatures.ts`, `tests/classifier.test.ts` and `public/models/form-v*/` were deleted with the classifier (`b622fa3`).

Results on 2026-09-19 (high-confidence verdicts, Python / browser / mirrored sets): raw 24 coordinates 51 / 52 / 52 of 68, 18 joint angles 54 / 54 / 54, either with perspective augmentation 47–51; the geometry rules the site ships: 55 / 58 / 57 of 67, consistent across facings and frame rates.

## License

MIT (code). The MediaPipe model is Apache-2.0 from Google. Non-commercial portfolio project.
