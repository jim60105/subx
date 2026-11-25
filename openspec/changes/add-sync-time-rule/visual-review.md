# Visual review: layout C

Human-reviewed against layout C of the mockup. Harness: `/scripts/preview/index.html?view=sync-offset&media=...`.

| # | View | Expectation | Observed | Verdict |
|---|---|---|---|---|
| 1 | video, light, 1100×720 | Order: stage, rule, transport, one offset row | Stage 99–403, rule 411–485, transport 493–529, one offset row 541–612 with facts at the inline end (zh-TW default, VP9 test clip). | |
| 2 | video, dark, 860×600, no notice | Offset row visible without scrolling | Row ends at 492 of 600 with the action bar below; no scroller overflows. Stage keeps the rest. | |
| 3 | video, 860×600, two warnings | Step scrolls; action bar stays | Stage shrinks to its 96 px floor, `.wizard__content` scrolls (480/425), action bar stays at the bottom; second warning reached by scrolling. | |
| 4 | nudge while playing | Figure moves in the direction; solid bars slide, hollow do not | While playing (t 2.9→3.1 s, not paused) +50 ms set `data-direction="up"`, −50 ms `down`; shifted bars moved 3.9 px, hollow bars unchanged. Fixed during review: the active bar now paints above an overlapping later cue. | |
| 5 | reduced motion | No figure, slip or bar animation | With reduced motion, figure animation, shifted-bar transition and slip animation all compute to 0.01 ms. | |
| 6 | none / unavailable / preparing | No rule; offset row unchanged | No `.time-rule` for none, unavailable and preparing; the offset row keeps 4 children at 71 px. | |
| 7 | zh-TW, 860×600 | Row does not wrap or clip | Offset −12.34 s: row scrollWidth equals clientWidth (796), controls on one line, facts end at the content edge. | |
