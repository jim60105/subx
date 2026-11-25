# Visual review: preview player

Human-reviewed. Harness: `npm run dev`, then `/scripts/preview/index.html?view=sync-offset&media=...`. Audible output is unverified until row 6 is run by a person.

| # | View | Expectation | Observed | Verdict |
|---|---|---|---|---|
| 1 | video, light, 1100×720 | Picture contained and centred, slip readable on any picture | Headless Chromium, `ms=0`, a 1280×720 test pattern from a local `src`: picture contained and centred on `--paper-2` under the ink rule; the slip (paper, ink, accent edge) reads cleanly over the colour bars, two overlapping cues on separate lines. With the current offset row and `OffsetPreview` the step already overflows the panel, so the stage sits at its 6rem minimum and the three-line slip covers most of the picture | |
| 2 | video, dark, 860×600 | Stage shrinks first; nothing overlaps the action bar | Stage at its 6rem minimum, transport below it; the offset field scrolls inside the panel above the action bar, nothing overlaps it. The offset row only fits without scrolling once `add-sync-time-rule` compacts it | |
| 3 | preparing and unavailable | Reason readable, offset field usable | Preparing (light, 1100×720): reason in a paper band across the top of the stage, transport and slip hidden, offset field usable. Unavailable (dark, 860×600): the first capture clipped the notice inside the 6rem stage; fixed so the stage grows to fit it. Title, localized error, details and "Back to video" readable; the offset field is reached by scrolling | |
| 4 | audio and none | Audio mark, message; same geometry | Audio (dark, 1100×720, `ms=750`): static bars centred on the stage with the transport, no "No sound?". The harness feeds a video file, so its picture shows behind the mark, which a real WAV would not. None (light, 860×600): title and sentence centred in the same stage geometry, no transport | |
| 5 | subtitle error | Error in place of the slip, transport usable | Light, 1100×720: localized parse error with details between the transport and the offset field, transport intact. The harness fixture still has cues, so the slip shows too; in the app a failed load leaves no cues and therefore no slip | |
| 6 | Real app, Linux, owner's MKV | Picture, **audible** sound, seek; subtitle agrees at start, middle, end | unverified: not run (needs the owner's file, native pickers and someone listening) | |
| 7 | Real app, Windows and macOS | Report "unverified" unless run | unverified | |
