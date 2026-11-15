# Visual review: show-convert-translate

Human-reviewed. Nothing here is enforced by a test. The implementer fills in "Observed" and "Screenshot" (task 4.3); the owner fills in "Verdict".

Reference: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("Other screens"). Each row is checked in light and dark, in `en` and `zh-TW`.

| # | What to judge | Observed | Screenshot | Verdict |
|---|---|---|---|---|
| 1 | Convert and translate source steps look and behave like the match sources step (drop zone large → strip, folder groups) | | | |
| 2 | Convert options, keep-original on: each item reads "source stays, output appears" at a glance | | | |
| 3 | Convert options, keep-original off: the struck source line makes the deletion obvious without a sentence | | | |
| 4 | Excluded and overwrite-flagged items are still clearly distinguishable | | | |
| 5 | Convert run step before starting: the list replaces the "originals" sentence without losing information | | | |
| 6 | Translate options, suffix vs replace: the difference is visible in the lines; replace mode's `− file` / `+ file` pair is understandable | | | |
| 7 | Long output paths truncate cleanly and the full path is reachable | | | |

## Deviations from the design document found during review

(list, or "none")

## Sign-off

- Implementer:
- Owner:
