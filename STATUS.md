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
| 11 | ≤ 2 Vercel deploys, live on https://pushups.kalpkan.com | deploy 1 = preview `pushups-8lnlyf586` (Ready); deploy 2 = production via the Git integration on merge | ⏳ |
| 12 | Lighthouse ≥ 0.85 desktop and mobile | production build, desktop **1.00 / 1.00 / 1.00 / 0.92**, mobile **0.99 / 1.00 / 1.00 / 0.92**; the 0.92 was `robots-txt`, fixed in `5b54292` | ✅ |
| 13 | Console clean on load and through a demo run | design-shots: 0 errors across 11 states | ✅ |
| 14 | `docs/design/DESIGN.md` + README design section | both committed | ✅ |
| 15 | reviewer APPROVE + verifier PASS, blocking fixes applied | | ⏳ |
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

## Needs Kalp

_(nothing)_

## Log

- 2026-09-21T06:21Z — branch `redesign`; read the direction, the MengTo skills and the whole source.
- 2026-09-21T06:30Z — baseline frozen (`docs/design/baseline.md`, before-\*.png).
- 2026-09-21T06:35Z — `docs/design/spec.md` locked, then `docs/design/plan.md`.
- 2026-09-21T07:05Z — build complete: HUD on the glass, poster, numbered rules, threshold table,
  skip link, focus ring, JetBrains Mono, eight animations with reduced-motion statics.
- 2026-09-21T07:30Z — `DESIGN.md`, README design section, DOM-based hint harness.
