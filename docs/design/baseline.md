# Pre-redesign baseline

Recorded 2026-09-21 on `main` @ `08f222a`, built and served from `dist/` at `http://localhost:4177/`.
Everything below must still hold after the "Gym mirror" redesign; the redesign touches presentation only.

## Unit + corpus gate (`npx vitest run --pool=forks --maxWorkers=1`)

```
Test Files  5 passed (5)
     Tests  176 passed | 4 expected fail (180)
```

The 4 `it.fails` are the documented known misses (`bad_IMG_4456` in every facing, `bad_IMG_4451` on the
Python landmark set).

## Demo clip through the real pipeline (`scripts/e2e-demo.mjs`, GPU)

| Width | good | attempts | status | console errors |
|---|---|---|---|---|
| 1440 | 4 | 4 | `Clip finished: 4 good of 4.` | none |
| 390 | 4 | 4 | `Clip finished: 4 good of 4.` | none |

Screenshots: `docs/images/redesign/before-1440.png`, `docs/images/redesign/before-390.png`.

## Live fake-camera corpus

Not re-run before the redesign (night protocol §4: do not re-run an expensive step more than needed to
prove the item once). The baseline is the committed expectation file
`tests/fixtures/clips/ground_truth.json` plus the recorded TEST r4 result for this commit:
**14/15 clips within tolerance in both facings, identical across three runs.** The post-redesign run in
Task 9 is compared against that.
