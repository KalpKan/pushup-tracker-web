# pushups — redesign status

Night protocol acknowledged 2026-09-21T06:21Z.

Task: redesign https://pushups.kalpkan.com to its PRIMARY direction **"Gym mirror"**
(`docs/design/app-directions.md` §5 in the portfolio repo). Branch `redesign`.

## Definition of done

| # | Criterion | Evidence | State |
|---|---|---|---|
| 1 | `docs/design/spec.md` locked before any code, MengTo skills named with where each is used | `docs/design/spec.md` (committed before the first code commit); skills table in §5 | ✅ |
| 2 | `docs/design/plan.md` written with `superpowers:writing-plans` after the spec | `docs/design/plan.md` | ✅ |
| 3 | "Gym mirror" HUD built: count top-left, hint top-right, verdict bottom-centre, meta bottom-right | `docs/images/redesign/{idle,counting,fault,annotation,hint,paused}-{1440,390}.png` | ✅ |
| 4 | Camera-on states verified with a fake camera + a real clip (Playwright Chromium, `--use-fake-device-for-media-stream`) | `scripts/design-shots.mjs`, 11 states, 0 console errors | ✅ |
| 5 | Rep counter / verdict logic untouched | `git diff main --stat -- src/repCounter.ts src/form.ts src/tracker.ts src/features.ts src/hints.ts src/pose.ts tests/` → **empty** | ✅ |
| 6 | `.visually-hidden` defined, `hidden` dropped from the headings | `src/style.css`; `index.html` | ✅ |
| 7 | Motion audited against `animation-systems`; every animation has a reason; one easing family | `docs/design/DESIGN.md` §2 (eight items) | ✅ |
| 8 | `prefers-reduced-motion: reduce` lands on a complete static final state | a11y probe: **zero** transitions or animations over 50 ms anywhere in the document; poster and placeholder still complete. `reduced-motion-1440-frozen.png` shows the static accent frame | ✅ |
| 9 | Skip link, `:focus-visible`, contrast AA at rendered size | a11y probe: skip link is the first tab stop, visible on focus, moves focus to `#stage`; every control has a 2 px `#ffe66d` ring; no horizontal overflow at 390 or 1440. Contrast table in `DESIGN.md` §5; Lighthouse accessibility **1.00** | ✅ |
| 10 | `npm run typecheck`, `npm test`, `npm run build` green | see "Gate output" | ✅ |
| 11 | ≤ 2 Vercel deploys, live on https://pushups.kalpkan.com | deploy 1 = preview `pushups-8lnlyf586` (Ready); deploy 2 = production via the Git integration on the `ad50ca6` merge. Live HTML has `id="hud-hint"` and no `class="eyebrow"`; `/health.json` `{"ok":true,"service":"pushups"}`; `/poster.webp`, `/robots.txt`, `/fonts/jetbrains-mono-latin-600.woff2`, `/demo/pushups.mp4` all 200 with the right content types | ✅ |
| 12 | Lighthouse ≥ 0.85 desktop and mobile | **on production: desktop 1.00 / 1.00 / 1.00 / 1.00 and mobile 1.00 / 1.00 / 1.00 / 1.00** | ✅ |
| 13 | Console clean on load and through a demo run | 11 states captured **against production**, 0 console errors, 29–31 fps; a real click in Kalp's own Chrome starts a session with 0 page errors | ✅ |
| 14 | `docs/design/DESIGN.md` + README design section | both committed | ✅ |
| 15 | reviewer APPROVE + verifier PASS, blocking fixes applied | reviewer round 1 = **REJECT**, 5 blocking + 8 minors; all 13 fixed in `9936003` and re-measured. Verifier running | ⏳ |
| 16 | One line in the portfolio repo's `STATUS.md` session log | | ⏳ |

## Gate output

- `npm run typecheck` — clean.
- `npx vitest run --pool=forks --maxWorkers=1` — **176 passed | 4 expected fail**, identical to the
  pre-redesign baseline (`docs/design/baseline.md`).
- `scripts/e2e-demo.mjs` at 1440 and 390 — 4 good of 4, no console errors (same as the baseline).
- `npm run build` — clean; first-paint JS 5.8 kB (2.6 kB gzip), CSS 8.8 kB (2.8 kB gzip).
- `scripts/e2e-corpus.mjs` (GPU, live fake camera, both facings) — **14/15 clips within tolerance in each
  facing**, identical to the pre-redesign TEST r4 number. The only failure in either direction is
  `bad_IMG_4456`, the documented known miss (an `it.fails` in the unit gate too). `IMG_1359` failed once
  at 15 fps while another job shared the GPU and passed cleanly on its own (total 9, good 8, 26 fps),
  matching the mirrored run.
- `scripts/e2e-failure-modes.mjs` — both cases end in an actionable status line with the stage returned
  to its idle poster (`loop-throws`: "Something went wrong: injected loop failure. Reload the page and
  try again."; `pose-model-404`: "Could not start: Failed to fetch model: … (404). …").
- `scripts/e2e-hints.mjs` (rewritten to read the DOM HUD) — IMG_1359 shows the head hint, IMG_1512 shows
  no two-people hint, which is the documented expectation.

## Reviewer round 1 (REJECT → all fixed in `9936003`)

| # | Defect | Fix, re-measured |
|---|---|---|
| B1 | `AnimationEvent` bubbles, so the verdict word's 120 ms animation ended the 180 ms rep pulse ~64 ms early, inconsistently | listener checks `e.target === stage && e.animationName === "rep-pulse"`. Real path over a whole demo clip: four pulses of **157, 155, 159, 161 ms**, none stuck, 0 errors |
| B2 | the stacked threshold table at 390: the caption became a 64 px × 530 px ribbon and the value column 107 px | caption **64 → 358 px** wide, table **2055 → 1062 px**, whole 390 document **4905 → 3912 px** |
| B3 | at 390 with a hint up, the meta line was sliced by the stage's `overflow: hidden` | the hint moved beside the count: HUD `scrollHeight 219 = clientHeight 219`, meta bottom **492** inside stage bottom **503** |
| B4 | a held rep result outranked `paused`, so a green "clean" could sit over a grey body | `paused` now outranks the held result |
| B5 | the diagnostic connector was a 1 px hairline, ~1.2:1 against a blown-out frame | stroked twice (dark under-stroke + light line) with a ringed joint dot |
| m6–m13 | 2-dp annotation printing the threshold itself, the ninth animation missing from the motion table, a stale `verdictShown`, a disabled ghost turning into an outlined twin, the hint's exit animating `transform`, the hint harness over-measuring by 400 ms, no `roundRect` fallback for Safari < 16.4, a misplaced JSDoc | all fixed |

## Needs Kalp

_(nothing)_

## Log

- 2026-09-21T06:21Z — branch `redesign`; read the direction, the MengTo skills and the whole source.
- 2026-09-21T06:30Z — baseline frozen (`docs/design/baseline.md`, before-\*.png).
- 2026-09-21T06:35Z — `docs/design/spec.md` locked, then `docs/design/plan.md`.
- 2026-09-21T07:05Z — build complete: HUD on the glass, poster, numbered rules, threshold table,
  skip link, focus ring, JetBrains Mono, eight animations with reduced-motion statics.
- 2026-09-21T07:30Z — `DESIGN.md`, README design section, DOM-based hint harness.
- 2026-09-21T10:35Z — corpus 14/15 in both facings; preview deploy 1; reviewer REJECT; all 13 findings
  fixed and re-measured; merge `ad50ca6` → `main`, pushed, production live (deploy 2).
