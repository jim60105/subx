# Human review: sync-zero-offset-and-media-notice

These checks are judged by a person, not by tests (design D6). Fill this in during apply. It does not gate `npm run verify`.

## Copy

- [ ] `offset.zero` (en, zh-TW) says plainly that 0 changes nothing and what to do next.
- [ ] `offset.zeroDetected` (en, zh-TW) says detection found no offset without implying an error, and offers the way forward.
- [ ] zh-TW strings use full-width punctuation and Taiwan terminology consistent with the rest of `sync.json`.

## Visual (light and dark theme, default window size)

Use the app, or the preview harness offset view: `?ms=0&detection=0` for the skipped state (generic reason), `?ms=0&detected=0&warnings=1` for the detected-zero state.

- [ ] The `--accent` inline-start rule reads as a caution and not as selection or focus. If it does not, report it rather than changing tokens.

- [ ] Detect step, subtitle only: the `detect.needsMedia` notice reads as a caution (accent ink, accent marker) and not as an error.
- [ ] Offset step after Skip: the zero reason sits under the offset row, aligned with where the over-limit error appears, and the disabled Continue is visibly disabled.
- [ ] Offset step after a detection of 0: the detected-zero reason, detection facts and any warning notices do not crowd the row.

## Reviewer notes

<!-- name, date, findings -->
