# Pushup Form Tracker — design system

Codename **"Gym mirror"**. Dark only. One accent. One added typeface. Nine animations.

The direction is the PRIMARY lane of `docs/design/app-directions.md` §5 in `KalpKan/portfolio`; the spec
that was locked before any code is [`spec.md`](./spec.md); the implementation plan is
[`plan.md`](./plan.md). This file records what actually shipped.

> **Visual thesis.** The camera feed is the mirror; the count, the verdict and the fault are drawn on the
> glass in front of you, and everything else on the page gets out of the way.

The user is on the floor, side-on, one to two metres from the device, and cannot touch the screen or read
13 px type. Every decision below follows from that.

---

## 1. Tokens

All in `src/style.css` `:root`.

### Colour

| Token | Value | Job | Where it may appear |
|---|---|---|---|
| `--bg` | `#0f1116` | page ground | everywhere |
| `--panel` | `#171a22` | the one raised surface | the `Stop` button |
| `--text` | `#f2f3f5` | body and every HUD label | everywhere |
| `--muted` | `#9aa3b2` | secondary prose, status line, table body | **never inside the HUD** (3.75:1 at 11 px over a bright frame) |
| `--accent` | `#ffe66d` | **a rep was counted, and nothing else** | the count numeral, the primary button, the rep pulse, the skip link, the focus ring |
| `--good` | `#5ee38a` | a clean verdict | skeleton + verdict plate only |
| `--bad` | `#ff6b6b` | a fault | skeleton + verdict plate only |
| `--paused` | `#b8b8b8` | counting is paused | skeleton + verdict plate only |
| `--line` | `rgba(255,255,255,0.12)` | every 1 px edge | stage frame, HUD plates, table head |
| `--hair` | `rgba(255,255,255,0.07)` | section and row rules | `h2` top rule, table rows |
| `--plate` | `rgba(15,17,22,0.78)` | **the only translucent layer on the site** | HUD plates, the canvas annotation label |

The accent is load-bearing. Yellow on this page means *counted*: the tally, the button that starts the
count, and the frame pulse when the tally goes up. It is used for nothing decorative.

The plate is the only glass, and it is honest glass: there is literally video behind it. Its opacity is
**0.78**, not the direction's 0.72, because 0.72 puts `--bad` at 2.74:1 against a blown-out frame —
below the 3:1 floor for large text. See §5.

### Type

| Role | Value |
|---|---|
| sans | `system-ui, -apple-system, "Segoe UI", sans-serif` — costs nothing, renders before the 20 MB model starts |
| mono | `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` — self-hosted, latin, 400 + 600, woff2, `font-display: swap`, 21 KB each, SIL OFL 1.1 (`public/fonts/OFL.txt`) |
| h1 | sans, `clamp(1.75rem, 4.5vw, 2.5rem)`, 1.1, `-0.015em` |
| section h2 | sans 600 1.35rem, with a 1 px `--hair` rule above |
| rule / aside h3 | sans 600 18px |
| body | 16 / 1.55 |
| **the count** | mono 600 `clamp(64px, 13cqi, 132px)`, leading 0.85, `tabular-nums` — the only thing on the page allowed to be that size |
| verdict word | sans 600 `clamp(20px, 3vw, 30px)` |
| HUD micro-labels, meta line | mono 400 11 px, `0.06em`, uppercase |
| status line | mono 400 13 px |
| threshold table | mono 400 13 px, `tabular-nums`; head 11 px uppercase |
| rule markers `01`–`04` | mono 400 13 px, `rgba(242,243,245,0.55)` |

`13cqi`, not the direction's `12vw`: the stage is capped at 960 px, so the count must scale with the
video, not the window. `.stage` is a `container-type: inline-size` container and the HUD sizes off it.

### Space, shape, depth

- Page container 960 px; every reading block capped at **68ch** and centred.
- Stage radius 14, 1 px `--line`. HUD plates radius 8, padding 6/12. Buttons radius 10, min-height 48 px.
- **No shadow anywhere, no glow, no gradient.** The only depth model is "plate over video", and a 1 px
  edge states that more honestly than a blur would.

### Motion

```css
--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);   /* entering, settling */
--ease-in:  cubic-bezier(0.4, 0,   1,   1);   /* leaving, faster */
--d-micro: 120ms;  --d-state: 180ms;  --d-in: 200ms;  --d-out: 400ms;  --d-poster: 220ms;
```

---

## 2. The motion budget — nine items, and nothing else moves

| # | Moment | What moves | Duration | Reason (`animation-systems`) | Reduced-motion state |
|---|---|---|---|---|---|
| 1 | a good rep lands | the stage frame pulses to the accent (1 px border + a sharp 3 px inset ring, no blur) | 180 ms | **confirm action** — the only confirmation a face-down user gets | a **static** accent frame, applied instantly, removed after 600 ms; the count increment does the work |
| | | *`AnimationEvent` bubbles, so the listener that ends the pulse checks `e.target === stage && e.animationName === "rep-pulse"`; without that the verdict word's 120 ms animation ended the pulse 64 ms early.* | | | |
| 2 | any rep lands | the count digit changes | **0 ms** | a count-up tween would lie about when the rep landed | same (there is no animation to remove) |
| 3 | the verdict word changes | the new word fades and rises 3 px into place; the plate is never blank | 120 ms | **confirm state change**; an out-phase would hide the one word the user is reading | instant |
| 4 | a placement hint appears | opacity 0→1, translateY −4px→0 | 200 ms | **guide attention** to something fixable | instant |
| 5 | a placement hint clears | opacity 1→0 (opacity only) | 400 ms | slower out, so a flickering detection cannot strobe | instant |
| 6 | a session starts | the poster cross-fades to the live canvas | 220 ms | **continuity** between the still and the feed | instant |
| 7 | button hover / press | background and border tint, no transform | 120 ms | micro-feedback on a 48 px target | instant |
| 8 | focus | the outline appears | **0 ms** | a focus ring must never be delayed | same |
| 9 | a session starts at ≤ 480 px | the page scrolls the stage into view | browser default | **continuity**: on a phone the header and buttons push the stage below the fold, and the visitor is about to lie on the floor | `behavior: "auto"` — the stage is simply there |

No scroll-driven motion, no smooth-scroll engine, no parallax, no perpetual loop, nothing animating
behind content. `prefers-reduced-motion: reduce` lands on a complete static final state in every case,
never on a shortened animation; the rep confirmation in particular becomes a state, not a shorter pulse.

---

## 3. Components and their states

### Stage (`#stage`)

| State | Marker | What is on screen |
|---|---|---|
| idle | — | `poster.webp` (a real demo-clip frame with the real skeleton) + the kept placeholder sentence on a plate |
| starting | `.live` | blank canvas, HUD at `0` / `0 attempts` / `—`; the status line carries "Loading the pose model…" |
| counting | `.live` | video + skeleton (+ the routed annotation while a fault is on screen), full HUD |
| paused | `.live` | grey skeleton, verdict `paused`, hint plate top-right |
| good rep | `[data-rep="counted"]`, 180 ms | accent edge pulse; the count increments instantly; the verdict holds `clean` for 1.5 s |
| bad rep | — | **no pulse** (the accent means *counted*); the verdict holds the fault in `--bad` for 1.5 s; attempts increments |
| too-shallow dip | — | the verdict holds `go lower` for 1.5 s |
| stopped / finished | `.live` kept | last frame frozen, count kept, verdict `—`, speed `—`, result in the status line |
| error | `.live` removed | the poster returns; the status line carries an actionable message |

The skeleton and the verdict plate are driven by **one** value (`session.ts`'s held rep result, falling
back to the live verdict), so a red word can never sit over a green body — and `paused` outranks both,
because the skeleton greys the moment counting stops and a held "clean" over a grey body would say
nothing is wrong at the one moment something is.

### HUD

`<ul class="hud" role="list" aria-label="Session stats">`, CSS grid, `pointer-events: none`.
Wide stage: count top-left, hint top-right, verdict bottom-centre, meta bottom-right. Below a **620 px
stage** (a container query, not a viewport query) the verdict and the meta line stack, and the hint stays
**beside** the count rather than under it: a 390-wide 16:9 frame is only ~219 px tall, and a five-row
stack pushed the meta plate out through the stage's `overflow: hidden` whenever a hint was up.

### Buttons

`Start camera` is the only filled button (accent on `#111`, 15.1:1) and the only primary action.
`Play demo clip` is a text button with an underline — visibly secondary, not an outlined twin.
`Stop` is the one outlined button and appears only while a session runs. A disabled button is a quiet
outline in `--muted`, never a 45 %-opacity accent (which renders as an unreadable olive on black).

### The skeleton and its annotation

2 px bones and 4 px filled joint dots at the 640 px canvas both sources produce, scaled by canvas width;
green when clean, red when faulted, grey when counting is paused. When a fault is on screen **and that
frame's own geometry trips the documented threshold**, one 1 px routed connector runs from the
responsible joint to a mono micro-label with the measurement — `HIP +0.183 T`, `KNEE 118 DEG` — on the
same plate material as the DOM HUD. The connector is stroked twice, a dark under-stroke in `--plate`
then the light line, because a single hairline is invisible against a blown-out frame. Never more than one annotation. Bottom-window faults ("dropped to
the floor") are not annotated, because no single frame's joint explains them.

---

## 4. Accessibility

- One skip link, "Skip to the tracker" → `#stage` (which is `tabindex="-1"`).
- `:focus-visible` — 2 px `--accent`, 3 px offset, on every interactive element.
- `.visually-hidden` is defined (it was referenced but missing) and the `hidden` attribute is off the
  section headings, so `aria-labelledby` now points at something in the accessibility tree.
- The status line keeps `aria-live="polite"`; the canvas keeps `aria-label="Pose overlay"`; the hint
  plate is `aria-live="polite"` and changes only on the 700 ms debounced transitions.
- Moving the HUD off the canvas made the count, the verdict and the hint readable by a screen reader for
  the first time.
- Every button is ≥ 48 px tall. At ≤ 480 px they are full-width.
- The threshold table becomes a stacked definition layout at ≤ 480 px — never a horizontal scroller.

## 5. Contrast, measured at rendered size

Worst case for the HUD is a blown-out white frame behind the plate; at 0.78 that composites to `#444546`
(relative luminance 0.0606).

| Foreground | Background | Ratio | Required | |
|---|---|---|---|---|
| `--text` | HUD plate, worst case | 8.48:1 | 4.5 | pass |
| `--accent` (count, 64–132 px) | HUD plate, worst case | 7.59:1 | 3.0 | pass |
| `--good` (verdict, ≥ 20 px / 600) | HUD plate, worst case | 5.80:1 | 3.0 | pass |
| `--bad` (verdict, ≥ 20 px / 600) | HUD plate, worst case | 3.44:1 | 3.0 | pass |
| `--muted` | `--bg` | 7.48:1 | 4.5 | pass |
| `#111` | `--accent` (primary button) | 15.1:1 | 4.5 | pass |
| rule markers `rgba(242,243,245,0.55)` | `--bg` | 5.72:1 | 4.5 | pass |

## 6. MengTo skills, and where each one landed

| Skill | Where |
|---|---|
| `design-first-ui-prompting` | `docs/design/spec.md` §1 — the prompt was filled and locked before a line of code |
| `no-ai-design-slop` | passive gate: the eyebrow deleted, the four identical tiles deleted rather than restyled, no new card, no new colour/font/icon/dependency beyond the one authorised mono face, the one glass layer kept because there is genuinely video behind it |
| `animation-systems` | §2 above — tokens, durations, the one easing family, and "replace motion with instant state" under reduced motion |
| `build-awwwards-quality-sites` | acceptance bar only: one authored moment, a complete static first frame (the poster works with JS off), honest assets, visible focus, the production build must pass. Its GSAP / Lenis / Three.js sections are deliberately not applied |
| `technical-wireframe-info-layout` | the skeleton as a designed diagnostic object; the one routed connector and its measured micro-label; the threshold table as sparse metric callouts |
| `beam-glow-states` | motion item 1 only. The `border-beam` package is React-only and this app has no framework, so its **principles** are applied: one dominant beam per viewport, state also carried by text and by the count, a static border under reduced motion, `pointer-events: none`, no second animated border anywhere |
| `number-details` | the `01`–`04` markers on "How it decides": two digits, mono, low contrast, one style, one section |
| `beautiful-shadows` | consulted, **not applied** — the direction bans shadow and the only depth model here is plate-over-video |
| `masked-reveal`, `scroll-scrubbed-word-reveal`, `animation-on-scroll`, `cinematic-gsap-lenis-motion-system` | consulted, **not applied** — the direction's do-not list: a page that must respond to a physical person on the floor cannot add scroll latency, and a scroll reveal on text read *after* a set explains nothing |
| every `threejs*` / `webgl-*` / particle / globe / shader / cursor-trail skill | banned by the direction and the portfolio house rules: MediaPipe already owns the GPU here |

## 7. Do not

- Do not give the accent a second meaning. It marks a counted rep.
- Do not put `--good`, `--bad` or `--paused` into page chrome. They belong on the glass.
- Do not add a shadow, a glow, a gradient, a card, or an icon.
- Do not animate the counter at rest, add a progress ring, or tween the count.
- Do not add a second animated border, a scroll engine, or anything that moves behind content.
- Do not restyle a control into looking enabled when it is disabled.
- Do not change the rep counter or the verdict rules from a design change. `src/repCounter.ts`,
  `src/form.ts`, `src/tracker.ts`, `src/features.ts`, `src/hints.ts` and `src/pose.ts` are the judgement;
  `index.html`, `src/style.css`, `src/main.ts` and `src/draw.ts` are the view.
