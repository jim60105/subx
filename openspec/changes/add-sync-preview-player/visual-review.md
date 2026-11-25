# Visual review: preview player

Human-reviewed. Harness: `npm run dev`, then `/scripts/preview/index.html?view=sync-offset&media=...`. Audible output is unverified until row 6 is run by a person.

| # | View | Expectation | Observed | Verdict |
|---|---|---|---|---|
| 1 | video, light, 1100×720 | Picture contained and centred, slip readable on any picture | | |
| 2 | video, dark, 860×600 | Stage shrinks first; nothing overlaps the action bar | | |
| 3 | preparing and unavailable | Reason readable, offset field usable | | |
| 4 | audio and none | Audio mark, message; same geometry | | |
| 5 | subtitle error | Error in place of the slip, transport usable | | |
| 6 | Real app, Linux, owner's MKV | Picture, **audible** sound, seek; subtitle agrees at start, middle, end | | |
| 7 | Real app, Windows and macOS | Report "unverified" unless run | | |
