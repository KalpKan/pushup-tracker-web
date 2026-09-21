# pushups — design spec, direction "Gym mirror"

Locked 2026-09-21, **before** any code was written, per `~/.claude/skills/mengto/design-first-ui-prompting`.
Source of truth for the direction: `docs/design/app-directions.md` §5 in the portfolio repo
(`KalpKan/portfolio`), **PRIMARY** direction, editorial-minimal lane. The alternate ("Coach's clipboard")
is explicitly not built: the two carry different grounds and different do-not lists, and blending them
produces the reference-mismatch cluster `no-ai-design-slop` warns about.

---

## 1. The filled prompt (design-first-ui-prompting skeleton)

```text
GOAL
- Count pushups from a phone or laptop on the floor and say why a bad rep was bad, entirely on-device.
- For: one person on the floor, side-on to a device 1–2 m away, who cannot read 13px type from there
  and cannot touch the screen mid-set.
- Success: from a plank position, at arm's length, the user can read the count and the verdict without
  squinting, and can tell a counted rep from a rejected one without hearing anything.

FORMAT
- Responsive web, 1440 / 390. The stage is the page: at 1440 the video is capped at 960px wide and
  centred; at 390 it is edge-to-edge with zero side gutter.
- Reading content below the stage is capped at a 68ch measure.

LAYOUT
- Above the stage: h1 + one-line lede + two buttons + the live status line. That is all.
- The stage is a single frame with the video, the skeleton overlay, and a HUD drawn INSIDE it:
  · top-left: the count, huge, mono, tabular, in the accent.
  · top-right: the placement hint when one is active, otherwise nothing.
  · bottom-centre: FORM NOW as a word on a plate — "clean", "hips sagging", "go lower".
  · bottom-right: attempts and speed as one small mono line.
- Below the stage: "How it decides" as four named rules numbered 01–04, plus one mono threshold table.
  Then "Tips" as four short rules. Then the classifier-retirement note as a bordered aside.

TYPE SYSTEM
- System stack for prose (system-ui, -apple-system, "Segoe UI").
- ONE added face: JetBrains Mono 400/600, self-hosted, latin subset, woff2, font-display: swap.
- Count: mono 600, clamp(64px, 13cqi, 132px), tabular-nums, leading 0.85. Only thing that size.
- Verdict word: sans 600 clamp(20px, 3vw, 30px).
- HUD micro-labels: mono 400 11px uppercase 0.06em.
- Body 16/1.55; rule headings sans 600 18px; threshold table mono 13px tabular.

COLOR + MATERIAL
- Ground kept verbatim: --bg #0f1116, --panel #171a22, --text #f2f3f5, --muted #9aa3b2.
- --accent #ffe66d is the one accent. It marks a COUNTED rep and nothing else: the count numeral,
  the primary button, and the 180 ms edge pulse when a good rep lands.
- --good #5ee38a and --bad #ff6b6b keep their verdict jobs and appear only inside the stage
  (HUD plate + skeleton), never in page chrome.
- HUD material: one dark plate per HUD element, rgba(15,17,22,0.78) with a 1px rgba(255,255,255,0.12)
  edge. The one honest translucent layer on the site, because there genuinely is video behind it.
- No glow, no gradient, no shadow anywhere else. Stage frame: 1px rule, radius 14.

IMAGERY / UI STYLE
- The skeleton overlay IS the illustration: 2px bones, 4px filled joint dots at 640px canvas width,
  scaled by canvas width; documented grey state when counting is paused.
- One diagnostic annotation: when a live fault is held, a 1px routed connector runs from the
  responsible joint to a mono micro-label carrying the measured number (HIP +0.24 T, KNEE 118°).
- Stage poster: a real frame of the bundled demo clip with the real skeleton drawn on it, captured
  from this app by scripts/make-poster.mjs, shipped as one static WebP.
- No icons at all.

COPY (verbatim from today unless marked NEW)
- "Pushup Form Tracker"
- "Phone or laptop on the floor, side-on (facing either way), whole body in frame, one person."
- "Start camera" / "Play demo clip" / "Stop"
- "Nothing loads until you press a button."
- "Your camera (mirrored) or the demo clip appears here with the skeleton, the rep count and the form
  verdict drawn on top."
- "How it decides" / "Tips"
- The whole classifier-retirement paragraph, verbatim.
- Verdict vocabulary exactly as the tracker emits it: "hips sagging", "hips too high", "knees down",
  "dropped to the floor", "go lower", "turn side-on".
- NEW, and only these: four rule headings ("What it watches", "What counts as a rep", "How form is
  judged", "When counting pauses"), the threshold table's caption and column heads, the skip-link
  label, the HUD micro-labels ("good reps", "attempts", "form now"), and the aside's heading
  ("Why there is no neural network").

CONSTRAINTS
- FONT: system stack + JetBrains Mono (one added face, latin subset)
- STYLE: HUD on live video
- MODE: dark only

NEGATIVE PROMPT
- No Three.js, no WebGL, no shader. MediaPipe already owns the GPU on this page.
- No celebratory confetti, no streak flames, no "Nice rep!" copy, no gamification, no badges.
- No progress ring around the count. No pulsing/breathing animation on the counter at rest.
- No fabricated rep history, no leaderboard, no fake "personal best".
- No stock gym photography, no silhouette athlete illustration.
- No smooth-scroll engine, no scroll-triggered animation, no perpetual loop behind content.
```

---

## 2. What changes, and why (the audit items it closes)

| Audit item | Fix in this spec |
|---|---|
| P1 — the product's key moment is undesigned (four identical grey tiles) | The four tiles are deleted. `#stat-good` becomes the HUD count at clamp(64,13cqi,132)px mono 600 in the accent; `#stat-form` becomes the verdict word on a plate at the bottom centre; `#stat-total` and `#stat-fps` become one small mono line at the bottom right. The element ids are kept so the counting harnesses keep reading the same numbers. |
| P2 — empty black box above the fold | `public/poster.webp`: a real frame of the demo clip with the real skeleton, captured from this app. The kept placeholder sentence sits on it as a plate caption. |
| P2 — `.visually-hidden` undefined | Defined in `src/style.css`; the `hidden` attribute is dropped from the two section headings so `aria-labelledby` points at something in the a11y tree. |
| P2 — explanation outweighs the tool | Every word kept. "How it decides" becomes four rules numbered `01`–`04` with headings; the numbers move into a mono threshold table; the classifier story becomes a bordered aside with its own heading. |
| P3 — no focus styles, no skip link | `:focus-visible` outline in the accent (2px, 3px offset) on every interactive element; one skip link to the stage. |
| P3 — eyebrow doing no work | Deleted. "Browser ML · MediaPipe pose landmarks" restates the lede and is already said better by rule 01 ("MediaPipe PoseLandmarker (full) finds 33 body points on every frame"). Nothing is lost. |

**Largest single improvement, per the audit: GOOD REPS becomes one big number.** It is the only thing on
the page allowed to be that size.

---

## 3. The one structural decision: the HUD moves from canvas to DOM

Today the count, the verdict, the hint and the rep flash are `fillText` calls inside `src/draw.ts`, drawn
into a 640-px-wide canvas that is then scaled up to 960 CSS px.

**The HUD becomes DOM elements positioned inside `#stage`. `draw.ts` keeps the video, the skeleton and the
one diagnostic annotation.** Reasons, in order:

1. Canvas text is rasterised at 640px and upscaled — the count is the page's hero and it would be soft
   at exactly the size where it matters most. DOM text renders at device pixel ratio.
2. The added mono face can be used for real, with `tabular-nums` and `font-feature-settings`.
3. The plate material, the 120 ms verdict cross-fade, the 200/400 ms hint fade and the whole
   `prefers-reduced-motion` path are CSS, not hand-rolled canvas timing.
4. Canvas text is invisible to assistive technology. DOM HUD text is readable, and the hint can be
   `aria-live="polite"`.

**Consequence for the harnesses.** `scripts/e2e-hints.mjs` reads hint/verdict text by hooking
`CanvasRenderingContext2D.prototype.fillText`. That hook stops seeing the HUD, so the script is rewritten
to record the same timeline from the DOM (a `MutationObserver` installed by the script itself — no test
hook is added to app code). `scripts/e2e-corpus.mjs`, `scripts/e2e-demo.mjs` and
`scripts/e2e-failure-modes.mjs` read `#stat-good`, `#stat-total`, `#stat-form`, `#stat-fps`, `#status`,
`#start-camera`, `#play-demo`, `#stop`, `#stage.live` — **every one of those ids and classes is kept**, so
those three scripts are untouched.

`#stat-form`'s wording changes from `good` / `bad: hips sagging` / `paused` / `no pose` to
`clean` / `hips sagging` / `paused` / `no pose`, which is the direction's verdict vocabulary. That string
feeds only the report-only `formPerSecond` field in `e2e-corpus.mjs`; the pass criterion is the counts.

---

## 4. Motion (from `animation-systems`; every item has a reason)

One easing family, declared once:

```css
--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);   /* entering, settling */
--ease-in:  cubic-bezier(0.4, 0,   1,   1);   /* exiting, faster */
```

| # | Moment | What moves | Duration | Easing | Why it exists (`animation-systems` goal) |
|---|---|---|---|---|---|
| 1 | A **good rep lands** | 1px stage-frame rule pulses to the accent and back | 180 ms | out → in | **Confirm action.** The only confirmation a face-down user gets. `beam-glow-states`. |
| 2 | A rep lands (any) | the count digit changes | **0 ms, instant** | — | A count-up tween would lie about when the rep landed. Explicitly no motion. |
| 3 | Verdict word changes | opacity 0→1 + 2px rise on the plate text | 120 ms | out | **Confirm state change** without the word appearing to jump. |
| 4 | Placement hint appears | opacity 0→1, translateY −4px→0 | 200 ms | out | **Guide attention** to a fixable problem. |
| 5 | Placement hint clears | opacity 1→0 | 400 ms | in | Slower out so a flickering detection cannot strobe. |
| 6 | Session starts | poster cross-fades to the live canvas | 220 ms | out | **Continuity** between the still and the feed. |
| 7 | Button press / hover | background + 1px border tint, no transform | 120 ms | out | Micro feedback on a 48px target. |
| 8 | Focus | outline appears | **0 ms, instant** | — | A focus ring must never be delayed. |

Nothing else on the page moves. No scroll-driven motion, no smooth-scroll engine, no perpetual loop,
no motion behind content.

**`prefers-reduced-motion: reduce` — every one of the above lands on a complete static final state:**

- #1 becomes a **static** accent stage border, applied instantly when a good rep lands and removed after
  600 ms; the count increment does the work, exactly as the direction requires.
- #3, #4, #5, #6, #7: `transition-duration: 0s` — the new text/plate/canvas is simply there.
- Implemented as one `@media (prefers-reduced-motion: reduce)` block plus a JS branch for #1, so the
  reduced path is never "the same animation, shorter".

---

## 5. MengTo skills used, and exactly where

| Skill | Where it lands in this build |
|---|---|
| `design-first-ui-prompting` | This file. The prompt in §1 was filled and locked before a line of code. |
| `no-ai-design-slop` | Passive gate. Concretely: the eyebrow is deleted (catalog pattern, no job); the four identical tiles are deleted rather than restyled (removal test: hierarchy survives and improves); no element is turned into a card; the one translucent layer is kept because there is literally video behind it; no new colour, font, icon set or dependency is introduced beyond the single mono face the direction authorises. |
| `animation-systems` | §4 — the motion budget, tokens, durations, the one easing family, and the reduced-motion policy ("keep content visible; replace motion with instant state"). |
| `build-awwwards-quality-sites` | Acceptance bar only: one authored moment (the stage), a complete static first frame (the poster works with JS off), honest assets (the poster is a real frame of the real clip produced by this app — no stock photography, no model-drawn illustration), visible keyboard focus, production build must pass. Its GSAP/Lenis/Three.js sections are deliberately **not** applied — see below. |
| `technical-wireframe-info-layout` | The skeleton treated as a designed diagnostic object: consistent stroke weights, filled joint dots, the grey paused state, and **one** routed connector from the responsible joint to a mono micro-label carrying the measured number (`HIP +0.24 T`, `KNEE 118°`). Also the threshold table: sparse metric callouts, neutral, no colour doing the talking. |
| `beam-glow-states` | Motion item #1 only: the 180 ms accent edge pulse on the stage frame when a good rep lands. The `border-beam` npm package is React-only and this app has no framework, so the package is **not** installed; its principles are applied as written — one dominant beam per viewport, the state is also carried by text and by the count so the beam never carries meaning alone, a static border under reduced motion, `pointer-events: none`, no second animated border anywhere. |
| `number-details` | "How it decides" rules marked `01`–`04` in mono, low contrast, in the left gutter — architectural, never competing with the headings. One numbering style, one section. |
| `beautiful-shadows` | Consulted and deliberately **not** applied: the direction's COLOR + MATERIAL says "no glow, no gradient, no shadow anywhere else", and the only depth model on the page is "plate over video", which an edge rule expresses more honestly than a shadow. |
| `masked-reveal`, `scroll-scrubbed-word-reveal`, `animation-on-scroll`, `cinematic-gsap-lenis-motion-system` | Consulted and **not** applied. The direction's do-not list names them: "no smooth-scroll engine — a page that must respond to a physical person on the floor cannot add scroll latency", and a scroll-scrubbed reveal on a page the user reads *after* a set is decoration, not explanation. |
| every `threejs*`, `webgl-*`, particle, globe, shader, cursor-trail skill | Banned by the direction and by the portfolio house rules: MediaPipe already owns the GPU on this page. |

---

## 6. Component inventory and states

### 6.1 Stage (`#stage`)
| State | Class / attribute | What is visible |
|---|---|---|
| Idle | (none) | Poster WebP + the kept placeholder sentence on a plate. No HUD. |
| Starting | `.live` | Canvas (blank until the first frame), HUD showing `0`, `0 attempts`, verdict `—`. Status line carries "Loading the pose model…". |
| Running | `.live` | Canvas with video + skeleton (+ annotation when a fault is held), full HUD. |
| Paused (placement problem) | `.live` | Skeleton grey (`#b8b8b8`), verdict plate reads `paused`, hint plate top-right. |
| Good rep landed | `[data-rep="counted"]` for 180 ms | Accent edge pulse; count increments instantly; verdict plate holds the rep result 1.5 s. |
| Bad rep landed | — | No pulse (the accent means *counted*). Verdict plate holds `hips sagging` etc. in `--bad` for 1.5 s; attempts increments. |
| Partial dip | — | Verdict plate holds "go lower: that dip was too shallow to count" for 1.5 s. |
| Stopped / clip finished | `.live` kept | Last frame frozen, count kept, verdict `—`, speed `—`, status line carries the result. |
| Error | `.live` removed | Poster returns; status line carries the actionable message. |

### 6.2 Buttons
- `Start camera` — the only filled button, accent on `#111` (15.1:1). Primary action.
- `Play demo clip` — ghost: no fill, no border, underlined label, still ≥ 48px tall and ≥ 48px wide target.
  This is the "visibly secondary rather than a same-size outlined twin" the direction asks for.
- `Stop` — outlined, appears only while a session runs.
- Disabled: 0.5 opacity + `cursor: not-allowed`, as today.
- `:focus-visible`: 2px `--accent` outline, 3px offset, on all three.

### 6.3 HUD
`<ul class="hud" role="list" aria-label="Session stats">`, absolutely positioned inside the stage,
`pointer-events: none`, four items:

| Corner | id | Content | Type |
|---|---|---|---|
| top-left | `#stat-good` + label | `12` / `good reps` | mono 600 clamp(64px,13cqi,132px) tabular, accent · label mono 400 11px uppercase 0.06em, `--text` |
| top-right | `#hud-hint` | the debounced placement hint, `aria-live="polite"` | sans 600 14px, `--text` |
| bottom-centre | `#stat-form` | `clean` / `hips sagging` / `paused` / `no pose` / `—` | sans 600 clamp(20px,3vw,30px), `--good`/`--bad`/`--text` |
| bottom-right | `#stat-total`, `#stat-fps` | `7 attempts · 30 fps` | mono 400 12px tabular, `--text` |

Plate: `rgba(15,17,22,0.78)`, 1px `rgba(255,255,255,0.12)`, radius 8, padding 6/10.

### 6.4 Below the stage
- Intro paragraph: the remainder of today's lede, verbatim, incl. the 20 MB cost, the privacy sentence
  and the Python-original link.
- `How it decides` — four `<section>`s, each `01`–`04` + a NEW two-to-four-word heading + today's bullet
  text verbatim as prose.
- Threshold table — `<table>`, mono 13px tabular, caption "The same numbers, at a glance." Two columns at
  ≤ 560px become a definition-list layout, never a horizontal scroller.
- `Tips` — today's four bullets, unnumbered, with a hanging rule mark.
- Aside — `<aside>` with a 2px left rule in `--panel`-lightened, NEW heading "Why there is no neural
  network", then today's classifier paragraph verbatim.

---

## 7. Thresholds shown in the table (read out of the source; no logic changes)

| Measure | Threshold | Constant |
|---|---|---|
| Dip depth to count as a rep | ≥ 0.25 × torso | `repCounter.MIN_DEPTH` |
| Hip below the shoulder–ankle line | > +0.18 torso → hips sagging | `form.SAG_DEV` |
| Hip above that line | < −0.26 torso → hips too high | `form.PIKE_DEV` |
| Knee angle | < 130° → knees down | `form.KNEE_DOWN_DEG` |
| Body angle to the horizontal | ≤ 30° to be a plank (a rep's top) | `form.PLANK_MAX_BODY_DEG` |
| Elbow still level with the shoulder at the bottom | > −0.09 torso → dropped to the floor | `form.COLLAPSE_ELBOW_AHEAD` |
| Chest above the hands at the bottom | > 0.50 torso, with hips > 0.20 below → hips sagging | `form.CHEST_UP_WRIST_BELOW`, `CHEST_UP_HIP_BELOW` |
| Guessed head cluster size | < 0.13 torso → head out of frame | `hints.HEAD_MIN_SIZE` |
| Frame luminance | < 0.12 → too dark | `hints.DARK_LUMINANCE` |

---

## 8. Contrast, measured (WCAG 2.1, rendered size)

Worst case for the HUD is pure white video behind the plate. Plate at 0.78 over white composites to
`#444546` (relative luminance 0.0606).

| Foreground | On | Ratio | Needed | Result |
|---|---|---|---|---|
| `--text #f2f3f5` | HUD plate worst case | **8.48:1** | 4.5 | pass |
| `--accent #ffe66d` | HUD plate worst case | **7.59:1** | 3.0 (count is 64–132px) | pass |
| `--good #5ee38a` | HUD plate worst case | **5.80:1** | 3.0 (verdict ≥ 20px/600 = large) | pass |
| `--bad #ff6b6b` | HUD plate worst case | **3.44:1** | 3.0 (large) | pass |
| `--muted #9aa3b2` | `--bg #0f1116` | **7.48:1** | 4.5 | pass |
| `#111` | `--accent` (primary button) | **15.1:1** | 4.5 | pass |

`--muted` is never used inside the HUD, because at 11px over a worst-case plate it measures 3.75:1.
That is the reason HUD micro-labels are `--text`, not `--muted`.

The plate is **0.78, not the direction's 0.72**, because 0.72 puts `--bad` at 2.74:1 against a bright
frame — below the 3:1 floor for large text. This is the only numeric deviation from the direction and it
is made to satisfy a house rule the direction itself binds ("contrast checked at rendered size").

---

## 9. Kept from today (nothing on this list may change)

- The entire "How it decides" and "Tips" copy, including the classifier-retirement paragraph.
- The privacy statement and the stated 20 MB cost.
- "Nothing loads until you press a button." and the lazy-load behaviour it describes (the pose model and
  `posthog-js` are still dynamic imports triggered by a click / by `load`).
- The yellow accent `#ffe66d`.
- `aria-live="polite"` on the status line; `aria-label="Pose overlay"` on the canvas.
- The grey-skeleton pause behaviour.
- The demo clip and its exact pipeline.
- 48 px minimum button height.
- The Python-original credit link.
- **The rep counter and the verdict logic**: `src/repCounter.ts`, `src/form.ts`, `src/tracker.ts`,
  `src/features.ts`, `src/hints.ts` and `src/pose.ts` are not touched, except that `draw.ts` and
  `session.ts` read `FrameVerdict.geometry` (already exported) to place the diagnostic annotation.
- `public/health.json`, the PostHog events (`session_started`, `demo_video_played`, `rep_counted`,
  `session_failed`), `vercel.json`, the CI workflow, and every test in `tests/`.

## 10. Verification plan

1. `npm run typecheck` · `npm test` (vitest, forks, 1 worker) · `npm run build`.
2. `node scripts/make-poster.mjs` regenerates `public/poster.webp` from the committed demo clip.
3. Playwright Chromium (`playwright-core`, the Chromium already in
   `~/Library/Caches/ms-playwright`) with `--use-fake-device-for-media-stream` +
   `--use-file-for-fake-video-capture=<clip>.mjpeg` drives the **camera-on** states at 1440×900 and
   390×844 and screenshots: idle, starting, counting, good-rep pulse, bad-rep verdict, paused + hint,
   reduced motion. → `docs/images/redesign/`.
4. `node scripts/e2e-corpus.mjs` (GPU) on the built preview: counts must stay inside the committed
   ground-truth tolerance — this is the proof the counting logic is untouched.
5. `node scripts/e2e-demo.mjs`, `node scripts/e2e-failure-modes.mjs`, `node scripts/e2e-hints.mjs`.
6. Lighthouse ≥ 0.85 desktop and mobile on the preview and on production.
7. `claude-in-chrome` at 1440 and 390 on the live URL; console clean.
