# Pushup Form Tracker (browser)

**Live:** https://pushups.kalpkan.com

Counts your pushups from the webcam and grades the form of every rep, entirely inside the browser. Nothing is uploaded: the pose model, the WASM runtime and the form classifier are all served from this site and run on your device. It is a port of the Python desktop tool in [KalpKan/AI-Pushup-Form-Tracker](https://github.com/KalpKan/AI-Pushup-Form-Tracker) (MediaPipe Pose + a small Keras network), rebuilt so a visitor can try it with one click and no install.

## What it does

1. **Pose:** MediaPipe `PoseLandmarker` (full model, VIDEO mode, GPU delegate with a CPU fallback) finds 33 body landmarks on each frame.
2. **Features:** 12 of them (wrists, elbows, shoulders, hips, knees, ankles; `x, y, z` each, 36 numbers) go through the same `StandardScaler` the original training used.
3. **Form:** a 128→64→32→1 sigmoid MLP (the original `pushup_model_augmented.h5`, converted to TensorFlow.js) answers "good" or "bad" per frame. Held-out accuracy on the original augmented dataset is **94.8 %** with the scaler (63.4 % without it, which is why the scaler constants are baked in, see `src/scaler.ts`).
4. **Reps:** a line-for-line port of the original shoulder-height state machine. A rep is a top → bottom → top cycle of the shoulders' normalised height; it counts as a **good rep** only when the classifier said "good" at both the top and the bottom. Cycles with bad form are shown as "attempts".
5. **Demo mode:** a bundled 8-second clip (`public/demo/pushups.mp4`) runs through the same pipeline, so someone without a webcam still sees it work.

The same landmark → feature → classifier → rep-counter path runs in unit tests against two landmark sequences recorded with the Python MediaPipe pipeline (`tests/fixtures/*.json`), so the TypeScript port is checked against the Python numbers (classifier probabilities within 1e-4, identical rep events).

## Limits (honest ones)

- The classifier was trained on one person's videos, filmed side-on. Film yourself side-on, whole body in frame, in decent light; other angles read as "bad form" more than they should.
- The rep counter adapts its "top" and "bottom" bands to the shoulder range it has seen, so the first rep of a session may be missed while it calibrates (the original had the same behaviour).
- Phones work (front camera, mirrored), but the full pose model on a phone GPU runs at roughly 8 to 15 fps; very fast reps can skip the bottom band.
- Lighthouse performance is kept ≥ 0.85 by loading nothing heavy until a button is pressed: the first paint is ~4 KB of JS. The 20 MB of models/WASM download on the first click, are cached for a year (`vercel.json`), and are the deliberate trade-off for running with zero servers.

## Privacy and analytics

No frame, landmark or image ever leaves the browser. After the initial download the page makes no network calls except PostHog analytics, sent through the site's own `/ingest` path (cookieless, inputs masked). Three named events: `session_started {mode}`, `rep_counted {good}`, `demo_video_played`. Without the PostHog key the analytics code is never even loaded.

## How to run this (for a non-developer)

You need [Node.js](https://nodejs.org) (version 22 or newer) installed once. Then, in a terminal:

```bash
git clone https://github.com/KalpKan/pushup-tracker-web.git
cd pushup-tracker-web
npm install          # downloads the libraries (one time)
npm run dev          # prints a local address such as http://localhost:5173
```

Open that address in Chrome or Safari, press **Play demo clip** (no camera needed) or **Start camera**. `npm test` runs the checks against the Python-recorded fixtures.

## How to deploy this

The site is a static Vite build hosted on Vercel (Hobby, $0), project **`pushups`** in the "Kk's projects" team, connected to this GitHub repository. **Every push to `main` deploys automatically**; nothing else is needed. To deploy by hand: `npx vercel@latest deploy --prod --yes --scope kks-projects-2edcb11a` from a checkout. `npm run build` copies the MediaPipe WASM files from `node_modules` into `public/wasm/` and writes `dist/`. The domain `pushups.kalpkan.com` is a DNS-only CNAME on Cloudflare pointing at the project (details in the portfolio repo's `docs/DNS_PENDING.md`).

Health check: https://pushups.kalpkan.com/health.json returns `{"ok":true,"service":"pushups"}`.

## Where the settings live

| Setting | Where | Notes |
|---|---|---|
| `VITE_PUBLIC_POSTHOG_KEY` | Vercel → project `pushups` → Settings → Environment Variables (Production + Preview) | Public `phc_` token of the PostHog project "Kalp portfolio". Leave unset locally and analytics stay off. |
| `VITE_PUBLIC_POSTHOG_HOST` | same | Always `/ingest`; `vercel.json` rewrites that path to PostHog. |
| Domain | Vercel project `pushups` → Domains, and Cloudflare DNS for `kalpkan.com` | CNAME `pushups` → the project-specific `*.vercel-dns-017.com` target, proxy OFF. |
| Models | `public/models/pose_landmarker_full.task` (9.4 MB, from Google's MediaPipe model page; the **full** variant, not lite, because the classifier was trained on `model_complexity=1` landmarks and lite's z values make it call good form bad), `public/models/form/` (the converted Keras MLP) | Committed; `public/wasm/` is copied at build time and not committed. |

Names only live here and in `.env.example`; values live only in Vercel.

## Files

| Path | What |
|---|---|
| `src/features.ts` | 12-landmark feature vector + shoulder height |
| `src/scaler.ts` | baked `StandardScaler` mean/scale (generated by `scripts/export_scaler.py`) |
| `src/classifier.ts` | TF.js loader + `predict` |
| `src/repCounter.ts` | the rep state machine (port of the Python one) |
| `src/pose.ts` | MediaPipe PoseLandmarker setup (self-hosted WASM + model) |
| `src/session.ts` | camera/demo loop, canvas overlay, per-frame pipeline |
| `src/draw.ts` | skeleton, count and verdict drawing |
| `src/track.ts`, `src/analytics.ts` | lazy PostHog wrapper and the three events |
| `scripts/export_scaler.py`, `scripts/export_model.sh`, `scripts/make_fixtures.py` | one-off Python exports (need the original repo's data; a Python 3.10 venv with `tensorflow==2.15`, `tensorflowjs`, `mediapipe==0.10.14`, `scikit-learn`) |
| `scripts/e2e-demo.mjs` | headless-Chrome end-to-end run of the demo clip (`node scripts/e2e-demo.mjs <url>`) |
| `tests/` | vitest unit tests + Python-generated fixtures |

## Regenerating the exports

Only needed if the model or the data changes. From a clone of the original repo (before its data purge, or from the local copy):

```bash
python3.10 -m venv .venv && .venv/bin/pip install tensorflow==2.15 tensorflowjs mediapipe==0.10.14 scikit-learn pandas imageio-ffmpeg
.venv/bin/python scripts/export_scaler.py      # -> src/scaler.ts
bash scripts/export_model.sh                   # -> public/models/form/
.venv/bin/python scripts/make_fixtures.py      # -> tests/fixtures/*.json
```

## License

MIT (code). The MediaPipe model is Apache-2.0 from Google. Non-commercial portfolio project.
