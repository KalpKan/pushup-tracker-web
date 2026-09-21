# "Gym mirror" Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the pushup tracker's interface as "Gym mirror" — the video is the page, with the count,
the verdict, the fault and the placement hint on the glass as a HUD — without touching one line of the rep
counter or the form-verdict logic.

**Architecture:** `index.html` + `src/style.css` are rewritten around a single `#stage` that contains the
canvas and a DOM HUD. `src/draw.ts` loses all text and keeps the video, the skeleton and one new routed
fault annotation. `src/main.ts` becomes a small view layer that maps session callbacks onto HUD elements
and the rep pulse. `src/session.ts` changes only where it builds the `Overlay` object. Everything under
`src/form.ts`, `src/tracker.ts`, `src/repCounter.ts`, `src/features.ts`, `src/hints.ts`, `src/pose.ts` is
untouched, and `tests/` proves it.

**Tech Stack:** Vite 8, TypeScript 6 (strict, `noUnusedLocals`), vanilla DOM (no framework), MediaPipe
tasks-vision, vitest 5, puppeteer-core 25 (existing harnesses), playwright-core 1.63 (new design-state
harness, reusing the Chromium already in `~/Library/Caches/ms-playwright`), ffmpeg (poster frame grab),
JetBrains Mono via `@fontsource-variable`/static woff2 copied into `public/fonts/`.

**Spec:** `docs/design/spec.md` (locked 2026-09-21, before any code).

## Global Constraints

- Direction: PRIMARY, "Gym mirror", from `docs/design/app-directions.md` §5 in `KalpKan/portfolio`.
- Dark only. `--bg #0f1116`, `--panel #171a22`, `--text #f2f3f5`, `--muted #9aa3b2`, `--accent #ffe66d`,
  `--good #5ee38a`, `--bad #ff6b6b`. No new colour.
- One added typeface, total: JetBrains Mono 400 + 600, latin subset, self-hosted woff2, `font-display: swap`.
- No Three.js, no WebGL, no shader, no particles, no smooth-scroll engine, no scroll-triggered motion,
  no perpetual loop behind content.
- One easing family: `--ease-out: cubic-bezier(0.2,0.8,0.2,1)`, `--ease-in: cubic-bezier(0.4,0,1,1)`.
- Every animation in `docs/design/spec.md` §4 and nothing else. Every one has a reduced-motion static state.
- HUD plate: `rgba(15,17,22,0.78)` + 1px `rgba(255,255,255,0.12)`, radius 8.
- These DOM ids/classes are a public contract with `scripts/e2e-*.mjs` and must survive:
  `#stage`, `#stage.live`, `#video`, `#canvas`, `#status`, `#start-camera`, `#play-demo`, `#stop`,
  `#stat-good`, `#stat-total`, `#stat-form`, `#stat-fps`.
  `#stat-good`/`#stat-total` textContent must stay a bare integer; `#stat-fps` must stay `"<n> fps"` or `"—"`.
- Copy listed in spec §9 "Kept from today" is verbatim and may not be reworded.
- Every interactive element: ≥ 48px target, `:focus-visible` 2px `--accent` outline at 3px offset.
- $0: no new runtime dependency, no CDN, no paid font. `playwright-core` is a devDependency with no
  browser download.
- Max 2 Vercel deploys total (1 preview, 1 production).

---

### Task 1: Freeze the "before" evidence and the counting baseline

**Files:**
- Create: `docs/images/redesign/before-1440.png`, `docs/images/redesign/before-390.png`
- Create: `docs/design/baseline.md`

**Interfaces:**
- Produces: the counting numbers that Task 9 must reproduce exactly.

- [ ] **Step 1: build and serve the current `main` build**

```bash
cd /Users/kalp/projects/pushups
npm run build
npx vite preview --port 4177 --strictPort &
```

- [ ] **Step 2: capture the before screenshots**

```bash
node scripts/e2e-demo.mjs http://localhost:4177/ >/dev/null   # sanity: the page still works
SHOT=docs/images/redesign/before-1440.png WIDTH=1440 node scripts/e2e-demo.mjs http://localhost:4177/
SHOT=docs/images/redesign/before-390.png  WIDTH=390  node scripts/e2e-demo.mjs http://localhost:4177/
```

- [ ] **Step 3: record the baseline counts**

```bash
node scripts/make-mjpeg.mjs          # only if tests/fixtures/clips/.mjpeg is missing
GPU=1 REPORT_ONLY=1 node scripts/e2e-corpus.mjs http://localhost:4177/ | tee /tmp/baseline-corpus.txt
```

Write the per-clip `total`/`good` table into `docs/design/baseline.md` with the date and the commit sha.

- [ ] **Step 4: commit**

```bash
git add docs/design/baseline.md docs/images/redesign
git commit -m "docs(design): freeze the pre-redesign screenshots and the corpus baseline

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Self-host JetBrains Mono (the one added face)

**Files:**
- Create: `public/fonts/jetbrains-mono-latin-400.woff2`, `public/fonts/jetbrains-mono-latin-600.woff2`
- Create: `public/fonts/OFL.txt`
- Modify: `src/style.css` (add the two `@font-face` rules)

**Interfaces:**
- Produces: CSS family name `"JetBrains Mono"`, weights 400 and 600, `unicode-range` latin.

- [ ] **Step 1: fetch the two latin woff2 files from the `@fontsource` package (SIL OFL 1.1)**

```bash
cd /Users/kalp/projects/pushups
npm i --no-save @fontsource/jetbrains-mono@5
mkdir -p public/fonts
cp node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2 public/fonts/jetbrains-mono-latin-400.woff2
cp node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2 public/fonts/jetbrains-mono-latin-600.woff2
cp node_modules/@fontsource/jetbrains-mono/LICENSE public/fonts/OFL.txt
npm remove @fontsource/jetbrains-mono   # no runtime dependency
```

Expected: each woff2 ≤ 40 KB.

**If the network is unavailable:** stop, record the failure in `STATUS.md`, and fall back to the system
mono stack `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` in the `--mono` token.
Do not retry more than once (night protocol §4).

- [ ] **Step 2: declare the faces**

```css
@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/jetbrains-mono-latin-400.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
    U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212,
    U+2215, U+FEFF, U+FFFD;
}
/* …identical block for 600… */
:root { --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
```

- [ ] **Step 3: verify the files are served by the build**

```bash
npm run build && ls -la dist/fonts/
```

Expected: both woff2 files present.

- [ ] **Step 4: commit**

```bash
git add public/fonts src/style.css
git commit -m "feat(type): self-host JetBrains Mono 400/600 latin, the one added face

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Rewrite `index.html` — structure, kept copy, `.visually-hidden`, skip link, HUD

**Files:**
- Modify: `index.html` (whole body)

**Interfaces:**
- Produces: `#hud-hint` (new), `#poster` (new), `.hud`, `.rule`, `.thresholds`, `.aside`;
  keeps every id listed in Global Constraints.

- [ ] **Step 1: replace the body**

Header block (note: the eyebrow is gone; the lede is one line; the rest of today's lede moves into the
intro paragraph below the stage, verbatim):

```html
<a class="skip" href="#stage">Skip to the tracker</a>
<main class="app">
  <header class="head">
    <h1>Pushup Form Tracker</h1>
    <p class="lede">Phone or laptop on the floor, side-on (facing either way), whole body in frame, one person.</p>
  </header>

  <section aria-labelledby="controls-heading" class="controls">
    <h2 id="controls-heading" class="visually-hidden">Controls</h2>
    <div class="buttons">
      <button id="start-camera" class="primary" type="button">Start camera</button>
      <button id="play-demo" class="ghost" type="button">Play demo clip</button>
      <button id="stop" class="outline" type="button" hidden>Stop</button>
    </div>
    <p id="status" class="status" aria-live="polite">Nothing loads until you press a button.</p>
  </section>
```

Stage block:

```html
  <section id="stage" class="stage" tabindex="-1" aria-label="Tracker view">
    <img id="poster" class="poster" src="/poster.webp" width="640" height="360" alt="" decoding="async" />
    <p class="placeholder">Your camera (mirrored) or the demo clip appears here with the skeleton, the rep count and the form verdict drawn on top.</p>
    <video id="video" playsinline muted></video>
    <canvas id="canvas" aria-label="Pose overlay"></canvas>
    <ul class="hud" role="list" aria-label="Session stats">
      <li class="hud-count"><span class="v" id="stat-good">0</span><span class="k">good reps</span></li>
      <li class="hud-hint" id="hud-hint" aria-live="polite" hidden></li>
      <li class="hud-verdict"><span class="v" id="stat-form">—</span></li>
      <li class="hud-meta"><span id="stat-total">0</span> attempts<span class="sep"> · </span><span id="stat-fps">—</span></li>
    </ul>
  </section>
```

Notes block — `01`–`04` markers are CSS `::before` on `.rule`, not text, so the prose keeps its reading
order for assistive technology. Every bullet from today becomes the `<p>` of the matching rule, verbatim.

```html
  <section class="notes" aria-labelledby="decides-heading">
    <h2 id="decides-heading">How it decides</h2>
    <p class="intro">Do pushups and the page counts every rep and tells you why a rep was bad (hips sagging,
      hips too high, knees down, dropped to the floor, too shallow). Everything runs on your device: the pose
      model is downloaded once (about 20 MB) and no frame is ever uploaded. Ported from the
      <a href="https://github.com/KalpKan/AI-Pushup-Form-Tracker">Python original</a>.</p>

    <section class="rule" style="--n:'01'"><h3>What it watches</h3><p>MediaPipe PoseLandmarker (full) finds 33 body points on every frame, on your GPU when available.</p></section>
    <section class="rule" style="--n:'02'"><h3>What counts as a rep</h3><p>Shoulder height tracks the movement. …</p></section>
    <section class="rule" style="--n:'03'"><h3>How form is judged</h3><p>Form is judged by geometry, …</p></section>
    <section class="rule" style="--n:'04'"><h3>When counting pauses</h3><p>While a placement hint is on screen …</p></section>

    <table class="thresholds">
      <caption>The same numbers, at a glance.</caption>
      <thead><tr><th scope="col">Measure</th><th scope="col">Threshold</th><th scope="col">Verdict</th></tr></thead>
      <tbody><!-- the nine rows of spec.md §7 --></tbody>
    </table>

    <aside class="aside">
      <h3>Why there is no neural network</h3>
      <p>There is no neural network any more. …verbatim…</p>
    </aside>

    <h2 id="tips-heading">Tips</h2>
    <ul class="tips"><!-- today's four bullets, verbatim --></ul>
  </section>
```

- [ ] **Step 2: verify no copy was lost**

```bash
cd /Users/kalp/projects/pushups
for s in "Nothing loads until you press a button." "about 20 MB" "Rules you can read beat a coin you cannot." "The first rep counts" "turn side-on"; do
  grep -qF "$s" index.html && echo "OK  $s" || echo "MISSING  $s"
done
git show main:index.html | grep -o '>[^<]\{40,\}<' | sed 's/^>//;s/<$//' > /tmp/old-copy.txt
while IFS= read -r line; do grep -qF "$line" index.html || echo "DROPPED: $line"; done < /tmp/old-copy.txt
```

Expected: every `OK`, and the only `DROPPED` lines are the eyebrow and the part of the lede that was
deliberately split into the intro paragraph (both accounted for in `docs/design/spec.md` §2).

- [ ] **Step 3: commit**

```bash
git add index.html
git commit -m "feat(ui): gym-mirror document structure — one-line lede, HUD in the stage, numbered rules, threshold table, skip link

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Rewrite `src/style.css`

**Files:**
- Modify: `src/style.css` (whole file)

**Interfaces:**
- Produces: `.visually-hidden`, `.skip`, `.stage`, `.stage.live`, `.hud*`, `[data-rep="counted"]`,
  the motion tokens, the reduced-motion block.

- [ ] **Step 1: tokens, base, skip link, visually-hidden**

```css
:root {
  --bg:#0f1116; --panel:#171a22; --text:#f2f3f5; --muted:#9aa3b2;
  --accent:#ffe66d; --good:#5ee38a; --bad:#ff6b6b;
  --line:rgba(255,255,255,0.12);
  --plate:rgba(15,17,22,0.78);
  --sans:system-ui,-apple-system,"Segoe UI",sans-serif;
  --ease-out:cubic-bezier(0.2,0.8,0.2,1);
  --ease-in:cubic-bezier(0.4,0,1,1);
  --d-micro:120ms; --d-state:180ms; --d-in:200ms; --d-out:400ms; --d-poster:220ms;
  color-scheme: dark;
}
.visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
  clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;}
.skip{position:absolute;left:-9999px;top:0;z-index:10;background:var(--accent);color:#111;
  padding:12px 16px;border-radius:0 0 8px 0;font-weight:600;}
.skip:focus{left:0;}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px;}
```

- [ ] **Step 2: stage, poster, canvas, HUD** (see `docs/design/spec.md` §6.3 for every value)

```css
.stage{position:relative;container-type:inline-size;max-width:960px;margin:20px auto 0;
  background:#000;border:1px solid var(--line);border-radius:14px;overflow:hidden;aspect-ratio:16/9;}
.stage canvas{display:block;width:100%;height:auto;opacity:0;transition:opacity var(--d-poster) var(--ease-out);}
.stage.live{aspect-ratio:auto;}
.stage.live canvas{opacity:1;}
.stage.live .poster,.stage.live .placeholder{opacity:0;pointer-events:none;}
.hud{display:none;} .stage.live .hud{display:block;}
.hud-count .v{font:600 clamp(64px,13cqi,132px)/0.85 var(--mono);font-variant-numeric:tabular-nums;color:var(--accent);}
.hud-count .k,.hud-meta{font:400 11px/1 var(--mono);letter-spacing:0.06em;text-transform:uppercase;color:var(--text);}
.hud-verdict .v{font:600 clamp(20px,3vw,30px)/1.1 var(--sans);color:var(--text);}
.hud-verdict[data-tone="good"] .v{color:var(--good);} .hud-verdict[data-tone="bad"] .v{color:var(--bad);}
```

Plate mixin applied to `.hud-count`, `.hud-hint`, `.hud-verdict`, `.hud-meta`:
`background:var(--plate);border:1px solid var(--line);border-radius:8px;padding:6px 10px;`

- [ ] **Step 3: the one beam (motion item #1) and the verdict/hint transitions**

```css
@keyframes rep-pulse{0%{border-color:var(--line)}25%{border-color:var(--accent)}100%{border-color:var(--line)}}
.stage[data-rep="counted"]{animation:rep-pulse var(--d-state) var(--ease-out) 1;}
.hud-verdict .v{transition:opacity var(--d-micro) var(--ease-out),transform var(--d-micro) var(--ease-out);}
.hud-verdict.is-swap .v{opacity:0;transform:translateY(2px);}
.hud-hint{transition:opacity var(--d-in) var(--ease-out),transform var(--d-in) var(--ease-out);}
.hud-hint[data-state="out"]{opacity:0;transform:translateY(-4px);transition-duration:var(--d-out);transition-timing-function:var(--ease-in);}
```

- [ ] **Step 4: the reduced-motion block — complete static states, not shortened animations**

```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;
    transition-duration:0.01ms!important;scroll-behavior:auto!important;}
  .stage[data-rep="counted"]{animation:none;border-color:var(--accent);}
  .hud-hint[data-state="out"]{opacity:0;}
}
```

- [ ] **Step 5: 390 — the stage goes edge to edge**

```css
@media (max-width:480px){
  .app{padding:16px 16px 40px;}
  .stage{margin-inline:-16px;border-radius:0;border-left:0;border-right:0;max-width:none;}
  .buttons button{flex:1 1 100%;}
  .thresholds,.thresholds thead{/* collapse to a definition list, never a horizontal scroller */}
}
```

- [ ] **Step 6: verify**

```bash
npm run build && npx vite preview --port 4177 --strictPort &
node scripts/design-shots.mjs http://localhost:4177/    # Task 7 writes this; until then, eyeball at 1440/390
```

- [ ] **Step 7: commit**

```bash
git add src/style.css
git commit -m "feat(ui): gym-mirror stylesheet — HUD plates, one accent, one easing family, reduced-motion statics

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `src/draw.ts` — skeleton only, plus one routed fault annotation

**Files:**
- Modify: `src/draw.ts`
- Modify: `src/session.ts` (only the object literal passed to `draw`, plus the annotation it derives)

**Interfaces:**
- Consumes: `FrameVerdict.geometry` from `src/tracker.ts` (already exported; not modified).
- Produces: `Overlay` gains `annotation: { jx: number; jy: number; text: string } | null` and loses
  `goodReps`, `totalReps`, `verdict`, `hint`, `flash` **as drawn text** (`verdict` stays, because the
  skeleton colour depends on it).

- [ ] **Step 1: shrink the `Overlay` interface**

```ts
export interface Overlay {
  landmarks: readonly Point3[] | null;
  /** Only the skeleton colour still depends on this. */
  verdict: { good: boolean } | null;
  mirror: boolean;
  paused?: boolean;
  /** Normalised joint position (pre-mirror) + the measured label, or null. */
  annotation: { jx: number; jy: number; text: string } | null;
}
```

- [ ] **Step 2: delete every `fillText` that belonged to the HUD, and the `label()` helper's HUD uses**

Keep `drawImage`, the `CONNECTIONS` loop and the joint dots. Stroke weights become explicit and
documented: `bone = max(2, w/320)`, `joint = max(3, w/160)`.

- [ ] **Step 3: draw the annotation (`technical-wireframe-info-layout`)**

```ts
if (o.annotation) {
  const jx = (o.mirror ? 1 - o.annotation.jx : o.annotation.jx) * w;
  const jy = o.annotation.jy * h;
  const right = jx < w / 2;                 // route towards the roomier side
  const elbowX = jx + (right ? 1 : -1) * w * 0.07;
  const endX   = jx + (right ? 1 : -1) * w * 0.16;
  const endY   = jy - h * 0.09;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(1, w / 900);
  ctx.beginPath(); ctx.moveTo(jx, jy); ctx.lineTo(elbowX, endY); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.beginPath(); ctx.arc(jx, jy, Math.max(2, w / 260), 0, Math.PI * 2); ctx.fill();
  ctx.font = `600 ${Math.max(10, Math.round(w / 52))}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = right ? "left" : "right";
  plate(ctx, o.annotation.text, endX + (right ? 6 : -6), endY);
}
```

`plate()` replaces `label()`: `rgba(15,17,22,0.78)` fill + a 1px `rgba(255,255,255,0.12)` stroke,
matching the CSS plate exactly.

- [ ] **Step 4: derive the annotation in `session.ts` (no logic change)**

```ts
const ann = !paused && verdict && !verdict.good && landmarks
  ? annotationFor(verdict.reason, verdict.geometry, landmarks)
  : null;
```

```ts
/** Which joint is responsible for a live fault, and the number that made it one. */
function annotationFor(reason: string | null, g: Geometry, p: readonly Landmark[]) {
  const mid = (a: number, b: number) => ({ jx: (p[a].x + p[b].x) / 2, jy: (p[a].y + p[b].y) / 2 });
  if (reason === "knees down") return { ...mid(25, 26), text: `KNEE ${Math.round(g.kneeAngle)}°` };
  if (reason === "hips sagging" || reason === "hips too high")
    return { ...mid(23, 24), text: `HIP ${g.hipDev >= 0 ? "+" : "−"}${Math.abs(g.hipDev).toFixed(2)} T` };
  return null;
}
```

- [ ] **Step 5: typecheck + unit tests (must be unchanged and green)**

```bash
npm run typecheck && npx vitest run --pool=forks --maxWorkers=1
```

Expected: `172 passed | 4 failed (it.fails known misses)` exactly as on `main`.

- [ ] **Step 6: commit**

```bash
git add src/draw.ts src/session.ts
git commit -m "feat(overlay): skeleton as a designed object, HUD text off the canvas, one routed fault annotation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `src/main.ts` — the HUD view layer and the rep pulse

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: the unchanged `SessionOptions` callbacks from `src/session.ts`.
- Produces: `setVerdict(text, tone)`, `setHint(text|null)`, `pulseRep()`.

- [ ] **Step 1: the verdict mapper (this is the only copy change to `#stat-form`)**

```ts
type Tone = "good" | "bad" | "neutral";
function verdictText(paused: boolean, v: { good: boolean; reason: string | null } | null): [string, Tone] {
  if (paused) return ["paused", "neutral"];
  if (v == null) return ["no pose", "neutral"];
  return v.good ? ["clean", "good"] : [v.reason ?? "unsure", "bad"];
}
```

- [ ] **Step 2: the 120 ms cross-fade, done without a library**

```ts
let verdictShown = "";
function setVerdict(text: string, tone: Tone) {
  if (text === verdictShown) return;
  verdictShown = text;
  verdictBox.dataset.tone = tone;
  if (reduceMotion.matches) { formEl.textContent = text; return; }
  verdictBox.classList.add("is-swap");
  window.setTimeout(() => { formEl.textContent = text; verdictBox.classList.remove("is-swap"); }, 120);
}
```

- [ ] **Step 3: the rep flash and the one beam**

`session.ts` already produces the flash strings ("Rep 3: good", "Rep 3: hips sagging", "Go lower: that dip
was too shallow to count"). Those strings stay inside `session.ts`; the view holds the rep result on the
verdict plate for `REP_FLASH_MS` and ignores live verdicts during the hold.

```ts
onRep: (ev) => {
  goodEl.textContent = String(ev.goodReps);
  totalEl.textContent = String(ev.totalReps);
  holdVerdict(ev.good ? "clean" : (ev.reason ?? "unsure"), ev.good ? "good" : "bad", 1500);
  if (ev.good) pulseRep();
  capture("rep_counted", { good: ev.good, reason: ev.reason });
}
```

```ts
function pulseRep() {
  stage.dataset.rep = "counted";
  if (reduceMotion.matches) { window.setTimeout(() => delete stage.dataset.rep, 600); return; }
  stage.addEventListener("animationend", () => delete stage.dataset.rep, { once: true });
}
```

- [ ] **Step 4: the hint, with the 200 ms in / 400 ms out treatment**

```ts
function setHint(text: string | null) {
  if (text) { hintEl.hidden = false; hintEl.textContent = text; hintEl.dataset.state = "in"; }
  else if (!hintEl.hidden) {
    hintEl.dataset.state = "out";
    window.setTimeout(() => { if (hintEl.dataset.state === "out") hintEl.hidden = true; }, 400);
  }
}
```

`onFrame`'s existing `_hint` parameter stops being ignored and is passed here.

- [ ] **Step 5: verify the contract the harnesses depend on**

```bash
npm run typecheck && npm run build
npx vite preview --port 4177 --strictPort &
node scripts/e2e-demo.mjs http://localhost:4177/
```

Expected JSON: `good` and `attempts` are bare integers, `fps` matches `/^\d+ fps$|^—$/`,
`status` starts with `Clip finished`, `errors: []`.

- [ ] **Step 6: commit**

```bash
git add src/main.ts
git commit -m "feat(hud): count, verdict, hint and meta as DOM on the glass, with the one rep pulse

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The stage poster, produced by this app

**Files:**
- Create: `scripts/make-poster.mjs`
- Create: `public/poster.webp`

- [ ] **Step 1: write the script** — it opens the built preview with puppeteer-core + the system Chrome,
  presses *Play demo clip*, waits for the first frame where the skeleton is drawn and the body is in a
  plank, then reads `canvas.toDataURL("image/webp", 0.82)`. Chrome encodes the WebP, so no extra tool is
  needed (ffmpeg on this machine has no `libwebp`).

```js
const dataUrl = await page.evaluate(async () => {
  const c = document.getElementById("canvas");
  return c.toDataURL("image/webp", 0.82);
});
writeFileSync("public/poster.webp", Buffer.from(dataUrl.split(",")[1], "base64"));
```

- [ ] **Step 2: run it and check the size**

```bash
node scripts/make-poster.mjs http://localhost:4177/ && ls -la public/poster.webp && file public/poster.webp
```

Expected: a RIFF/WebP file, ≤ 60 KB, 640×360.

- [ ] **Step 3: commit**

```bash
git add scripts/make-poster.mjs public/poster.webp
git commit -m "feat(stage): poster is a real demo-clip frame with the real skeleton, captured from this app

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Rewrite `scripts/e2e-hints.mjs` for the DOM HUD, add `scripts/design-shots.mjs`

**Files:**
- Modify: `scripts/e2e-hints.mjs`
- Create: `scripts/design-shots.mjs`
- Modify: `package.json` (devDependency `playwright-core@1.63.0`)

- [ ] **Step 1: replace the `fillText` hook with a DOM recorder**

```js
const TEXT_HOOK = () => {
  window.__texts = [];
  const seen = new Map();
  const tick = () => {
    for (const id of ["hud-hint", "stat-form"]) {
      const el = document.getElementById(id);
      const t = el && !el.hidden ? el.textContent.trim() : "";
      if (t && seen.get(id) !== t) { seen.set(id, t); window.__texts.push([performance.now(), t]); }
    }
    requestAnimationFrame(tick);
  };
  addEventListener("DOMContentLoaded", tick);
};
```

The rest of the script (the per-text `first/last/frames` timeline) is unchanged, and its filter drops
`/^\d+$/` and the meta line.

- [ ] **Step 2: write `scripts/design-shots.mjs`** — playwright-core, `chromium.launch({ args: [...] })`
  with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<clip>.mjpeg
  --use-fake-ui-for-media-stream --use-gl=angle --use-angle=metal`, two viewports (1440×900 and
  390×844, DPR 3), and a `--reduced-motion` pass via `context({ reducedMotion: "reduce" })`. It
  screenshots: `idle`, `starting`, `counting`, `rep-pulse`, `bad-verdict`, `paused-hint`, `reduced-motion`.

- [ ] **Step 3: run both**

```bash
npm i -D playwright-core@1.63.0
node scripts/e2e-hints.mjs http://localhost:4177/ tests/fixtures/clips/.mjpeg
node scripts/design-shots.mjs http://localhost:4177/ docs/images/redesign
```

Expected from `e2e-hints`: the same hint timelines as the baseline — `black` shows the dark hint,
`two-people` the two-people hint, `cropped-right` the head hint, `frontal` "Turn side-on to the camera",
and `IMG_1512` shows no two-people hint.

- [ ] **Step 4: commit**

```bash
git add scripts/e2e-hints.mjs scripts/design-shots.mjs package.json package-lock.json docs/images/redesign
git commit -m "test(e2e): read hints from the DOM HUD; add the playwright fake-camera design-state harness

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Prove the counting logic is untouched

- [ ] **Step 1: the diff must be empty for the logic files**

```bash
git diff main --stat -- src/repCounter.ts src/form.ts src/tracker.ts src/features.ts src/hints.ts src/pose.ts tests/
```

Expected: no output.

- [ ] **Step 2: unit + corpus gate**

```bash
npm run typecheck && npx vitest run --pool=forks --maxWorkers=1
```

Expected: identical pass/known-miss counts to Task 1's baseline.

- [ ] **Step 3: live fake-camera corpus, both facings**

```bash
GPU=1 node scripts/e2e-corpus.mjs http://localhost:4177/
GPU=1 MIRROR=1 node scripts/e2e-corpus.mjs http://localhost:4177/
```

Expected: the same per-clip `total`/`good` as `docs/design/baseline.md`.

- [ ] **Step 4: failure modes**

```bash
mkdir -p /tmp/pushups-fail && node scripts/e2e-failure-modes.mjs http://localhost:4177/ /tmp/pushups-fail
```

Expected: both cases end in an actionable status message, `stageLive` false for the 404 case.

---

### Task 10: Docs, deploy, review

- [ ] **Step 1: `docs/design/DESIGN.md`** — tokens, type scale, the motion table, the contrast table, the
  component states table, the MengTo skill map, and the do-not list.
- [ ] **Step 2: README** — a "Design" section pointing at `docs/design/spec.md` and `DESIGN.md`, naming
  the direction and the one added face.
- [ ] **Step 3: preview deploy (deploy 1 of 2)**

```bash
npx vercel --scope kks-projects-2edcb11a
```

- [ ] **Step 4: Lighthouse ≥ 0.85 on the preview, desktop and mobile; `claude-in-chrome` at 1440 and 390.**
- [ ] **Step 5: merge `--no-ff` into `main`, push (deploy 2 of 2 via the Git integration), confirm
  `https://pushups.kalpkan.com` and `/health.json`.**
- [ ] **Step 6: spawn `reviewer`, apply blocking fixes; then spawn `verifier`.**
- [ ] **Step 7: append one line to `~/projects/portfolio/STATUS.md` via a worktree.**

---

## Self-review

- **Spec coverage.** §1 prompt → Tasks 3–6. §2 audit items → P1 Task 6, P2 poster Task 7, P2
  `.visually-hidden` Task 4, P2 structure Task 3, P3 focus/skip Task 4, P3 eyebrow Task 3. §3 HUD-to-DOM →
  Tasks 3, 5, 6, 8. §4 motion → Task 4 (CSS) + Task 6 (JS branches). §5 skills → recorded in Task 10's
  DESIGN.md. §6 states → Tasks 3–6. §7 thresholds → Task 3's table. §8 contrast → Task 4 tokens, verified
  in Task 10. §9 kept-from-today → Task 3 Step 2's copy diff and Task 9's logic diff. §10 verification →
  Tasks 1, 8, 9, 10.
- **Placeholders.** The only ellipses are inside HTML snippets that say "verbatim" and name the exact
  source line in today's `index.html`; Task 3 Step 2 is the mechanical check that they were copied whole.
- **Type consistency.** `Overlay.annotation` (Task 5) is produced by `annotationFor` (Task 5 Step 4) and
  consumed only in `draw` (Task 5 Step 3). `setVerdict`/`setHint`/`pulseRep` (Task 6) are used only in
  Task 6. `#hud-hint` is created in Task 3, styled in Task 4, driven in Task 6, read in Task 8.
