# Visual review: detect step

Human-reviewed. Views come from the preview harness (`npm run dev`, then `/scripts/preview/index.html?view=sync-detect&phase=ask|detecting|failed`, plus `&media=0` and `&theme=`).

| # | View | Expectation | Observed | Verdict |
|---|---|---|---|---|
| 1 | ask, light, 1100×720 | Title, still bars, slider; matches mockup "02 詢問" in structure | Title and description, 48 still hairline bars between two hairlines, slider with both end labels and the per-run note; Back at the start, Skip then Start detection at the end. Same order as the mockup (title, instrument, slider) | |
| 2 | detecting, light, 1100×720 | Bars move, seconds are the only figure | Bars turn ink and animate (`sync-detect-hear`); the large serif "2 s" beside the title is the only figure; no slider, no Back; Cancel beside the disabled "Detecting…" | |
| 3 | failed, dark, 1100×720 | Error, slider, still bars | Error notice with the reworded skip hint and technical details, slider below it, bars still in the hairline colour; Back, Skip, Try again | |
| 4 | ask without media, dark, 860×600 | Reason shown, no slider, no scrollbar | Needs-media sentence in place of the slider; Skip is the only forward action; content panel scrollHeight equals clientHeight (425/425), so there is no scrollbar | |
| 6 | ask with kept offset (`&kept=1`), en and zh-TW, 860×600 | Four controls fit the bar without wrapping or clipping | en: Back, Skip, Start detection, "Keep +1.25 s"; zh-TW: 上一步, 略過, 開始偵測, 沿用 +1.25 秒. In both, every button's scrollWidth equals its clientWidth and the buttons sit on one line within the 796 px bar | |
| 5 | detecting, reduced motion | Bars are still | With reduced motion emulated, the computed `animation-name` of the bars is `none`. The first check found the animation still running, because the bare-class rule lost on specificity. Fixed by naming the listening selector in the reduced-motion rule | |
