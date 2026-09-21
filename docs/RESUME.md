# Resume — pushups "Gym mirror" redesign

State at the last hand-off. If everything below is ticked in `STATUS.md`, there is nothing to resume.

## Where things are

- Branch `redesign` (off `main` @ `08f222a`), merged to `main` with `--no-ff` when the checklist closed.
- The contract: `docs/design/app-directions.md` §5 in `KalpKan/portfolio`, PRIMARY direction.
- The spec (locked before code): `docs/design/spec.md`. The plan: `docs/design/plan.md`.
  What shipped: `docs/design/DESIGN.md`. The pre-redesign numbers: `docs/design/baseline.md`.
- Screenshots of every state, camera-on included: `docs/images/redesign/`.

## How to reproduce every gate

```bash
cd ~/projects/pushups
npm ci
npm run typecheck                                  # tsc, clean
npx vitest run --pool=forks --maxWorkers=1         # 176 passed | 4 expected fail
npm run build
npx vite preview --port 4177 --strictPort &        # serves dist/

# the design states, camera-on, through Chrome's fake camera
node scripts/make-mjpeg.mjs                        # once, builds tests/fixtures/clips/.mjpeg
GPU=1 node scripts/design-shots.mjs                # 11 states → docs/images/redesign/

# the proof that counting did not change
GPU=1 node scripts/e2e-corpus.mjs http://localhost:4177/            # 14/15 (bad_IMG_4456 is the known miss)
GPU=1 MIRROR=1 node scripts/e2e-corpus.mjs http://localhost:4177/   # 14/15
GPU=1 node scripts/e2e-demo.mjs http://localhost:4177/              # 4 good of 4, errors []
node scripts/e2e-failure-modes.mjs http://localhost:4177/ /tmp/fail
node scripts/e2e-hints.mjs http://localhost:4177/ tests/fixtures/clips/.mjpeg

# the poster, if the demo clip or the skeleton style ever changes
GPU=1 node scripts/make-poster.mjs http://localhost:4177/
```

Run the corpus with nothing else competing for the GPU: a run that drops to ~15 fps can lose a clip
(`IMG_1359` did exactly that once, and passed on its own at 26 fps).

## Known, deliberate, not defects

- `bad_IMG_4456` counts 4 good of 4 in every facing. It is the documented 2D-landmark blind spot (a rep
  that rests on the floor and pushes the chest up with the arms properly bent) and is an `it.fails` in
  `tests/corpus.test.ts`. The redesign did not change it and must not be blamed for it.
- The HUD plate is `rgba(15,17,22,0.78)`, not the direction's 0.72, so `--bad` clears 3:1 against a
  blown-out frame. Measured in `DESIGN.md` §5.
- The count uses `13cqi`, not the direction's `12vw`, because the stage is capped at 960 px and the
  count must scale with the video rather than the window.
- `border-beam` is not installed: it is React-only and this app has no framework. Its principles are
  applied by hand to the one pulse (`DESIGN.md` §6).

## The one open item (ready to write, deliberately not deployed)

`#hud-hint` sets its text and *then* removes the `hidden` attribute, so a screen reader may miss the
**first** hint of a session (later changes announce normally, because by then the element is in the
accessibility tree). The verifier raised it as a note, not a failure. It was not shipped because the
deploy budget was already one build over — fold it into the next change to this app.

The fix, in `index.html` (a permanent live region that always exists) and `src/main.ts`:

```html
<!-- inside #stage's <ul class="hud">, the visual plate stops being the live region -->
<li class="hud-hint" id="hud-hint" aria-hidden="true" hidden></li>
...
<!-- once, outside the stage: always present, so an insertion is always announced -->
<p id="hint-live" class="visually-hidden" aria-live="polite"></p>
```

```ts
const hintLive = $<HTMLElement>("hint-live");
// …inside setHint(), alongside the existing visual updates:
hintLive.textContent = text ?? "";
```

`.visually-hidden` is already defined, so nothing else is needed.

## If you have to change something

The view is `index.html`, `src/style.css`, `src/main.ts`, `src/draw.ts`.
The judgement is `src/repCounter.ts`, `src/form.ts`, `src/tracker.ts`, `src/features.ts`,
`src/hints.ts`, `src/pose.ts` — a design change must never touch them, and
`git diff main --stat -- <those files> tests/` being empty is the check.

These ids are a contract with `scripts/e2e-*.mjs`: `#stage`, `#stage.live`, `#video`, `#canvas`,
`#status`, `#start-camera`, `#play-demo`, `#stop`, `#stat-good`, `#stat-total`, `#stat-form`,
`#stat-fps`. `#stat-good` and `#stat-total` must stay bare integers; `#stat-fps` must stay `"<n> fps"`.
