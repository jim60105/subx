# Visual review: detect step

Human-reviewed. Views come from the preview harness (`npm run dev`, then `/scripts/preview/index.html?view=sync-detect&phase=ask|detecting|failed`, plus `&media=0` and `&theme=`).

| # | View | Expectation | Observed | Verdict |
|---|---|---|---|---|
| 1 | ask, light, 1100×720 | Title, still bars, slider; matches mockup "02 詢問" in structure | | |
| 2 | detecting, light, 1100×720 | Bars move, seconds are the only figure | | |
| 3 | failed, dark, 1100×720 | Error, slider, still bars | | |
| 4 | ask without media, dark, 860×600 | Reason shown, no slider, no scrollbar | | |
| 6 | ask with kept offset (`&kept=1`), en and zh-TW, 860×600 | Four controls fit the bar without wrapping or clipping | | |
| 5 | detecting, reduced motion | Bars are still | | |
