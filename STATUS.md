# pushups — redesign status

Night protocol acknowledged 2026-09-21T06:21Z.

Task: redesign https://pushups.kalpkan.com to its PRIMARY direction **"Gym mirror"**
(`docs/design/app-directions.md` §5 in the portfolio repo). Branch `redesign`.

## Definition of done

| # | Criterion | How it is verified | State |
|---|---|---|---|
| 1 | `docs/design/spec.md` locked before any code, MengTo skills named with where each is used | file exists, reviewed | ☐ |
| 2 | `docs/design/plan.md` written with `superpowers:writing-plans` after the spec | file exists | ☐ |
| 3 | "Gym mirror" HUD built: count top-left, hint top-right, verdict bottom-centre, meta bottom-right, inside the stage | screenshots at 1440 and 390 in `docs/images/redesign/` | ☐ |
| 4 | Camera-on states verified with a fake camera + a real clip (Playwright/Puppeteer Chromium, `--use-fake-device-for-media-stream`) | script output + screenshots | ☐ |
| 5 | Rep counter / verdict logic untouched | `git diff main -- src/repCounter.ts src/form.ts src/tracker.ts src/features.ts` shows no logic change | ☐ |
| 6 | `.visually-hidden` defined and the `hidden` attribute dropped from the headings | grep in `src/style.css`, axe-ish DOM check | ☐ |
| 7 | Motion audited against `animation-systems`; every animation has a reason; one easing family | `docs/design/DESIGN.md` motion table | ☐ |
| 8 | `prefers-reduced-motion: reduce` lands on a complete static final state | screenshot with the emulated preference | ☐ |
| 9 | Skip link, `:focus-visible`, contrast AA at rendered size | screenshots + contrast maths in DESIGN.md | ☐ |
| 10 | `npm run typecheck`, `npm test`, `npm run build` all green | raw output | ☐ |
| 11 | ≤ 2 Vercel deploys (1 preview + 1 production), live on https://pushups.kalpkan.com | `curl -sI` + `/health.json` | ☐ |
| 12 | Lighthouse ≥ 0.85 (webcam app) at desktop and mobile | raw scores | ☐ |
| 13 | Console clean on load and through a demo run | Puppeteer console capture | ☐ |
| 14 | `docs/design/DESIGN.md` + README design section | files | ☐ |
| 15 | reviewer APPROVE + verifier PASS, blocking fixes applied | agent verdicts | ☐ |
| 16 | One line appended to the portfolio repo's `STATUS.md` session log | commit in portfolio worktree | ☐ |

## Needs Kalp

_(nothing yet)_

## Log

- 2026-09-21T06:21Z — branch `redesign` created; read the direction, the MengTo skills and the whole source.
