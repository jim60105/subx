# Visual review: layout C

Human-reviewed against layout C of the mockup. Harness: `/scripts/preview/index.html?view=sync-offset&media=...`.

| # | View | Expectation | Observed | Verdict |
|---|---|---|---|---|
| 1 | video, light, 1100×720 | Order: stage, rule, transport, one offset row | | |
| 2 | video, dark, 860×600, no notice | Offset row visible without scrolling | | |
| 3 | video, 860×600, two warnings | Step scrolls; action bar stays | | |
| 4 | nudge while playing | Figure moves in the direction; solid bars slide, hollow do not | | |
| 5 | reduced motion | No figure, slip or bar animation | | |
| 6 | none / unavailable / preparing | No rule; offset row unchanged | | |
| 7 | zh-TW, 860×600 | Row does not wrap or clip | | |
