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

### Apply-time visual pass (agent, 2026-11-26; not a substitute for the human sign-off above)

Checked in headless Chromium on the preview harness, not in the Tauri WebKitGTK window, so font metrics may differ slightly. Views: `sync-offset&ms=0&detection=0` (generic reason), `sync-offset&ms=0&detected=0&warnings=1` (detected-zero reason with a warning), `sync-detect&media=0` (missing-media notice). Each view at 1100×720 and 860×600 (`minWidth` is 860), light and dark, en and zh-TW, plus en at 640 wide to force wrapping.

Refined:

- Both notices use `text-wrap: pretty`, so a wrapped sentence does not end on a single orphaned word. At 640 px the English detected-zero reason wraps across two even lines.

Observed, left as is:

- Alignment: the zero reason's 2 px accent rule and text inset line up with the over-limit error and the warning `ErrorNotice` below it, as design D4 intended. In zh-TW at 860 px and in English at 1100 px each reason fits on one line. In English at 860 px the detected-zero reason just fits.
- Hierarchy: the reason is regular weight. The warning headline below it is 600 weight in `--del`, so the warning still reads as the stronger notice.
- Hue: `--accent-ink` (caution) and `--del` (failure) are close red-orange hues in both themes, and closest in dark. When the detected-zero reason sits directly above a detection warning, the two can read as one block of red at a glance. The weight difference is all that separates them. This is a token-level matter and outside this change (no token edits). Flagged for the human reviewer to judge under the first Visual checkbox.
- Focus: when the step opens with the reason and focus is on the page body or on a disabled control (the primary Skip or Keep button turns into the disabled Continue), focus moves to the millisecond field. WebKit does not focus a button on mouse click, so in the Tauri window this also happens after a mouse click on Skip, and the field shows its focus ring. Check in the real window that this feels right. The field's accent focus ring sits directly above the reason, so the field and the explanation read as a pair.
- Live region: the reason's `role="status"` element stays mounted, empty and visually hidden, while the offset is non-zero, so a reason that appears mid-edit is announced as a change. Worth confirming with Orca on WebKitGTK.
- Disabled Continue: it renders as the shell's grey fill with lighter text in both themes and reads clearly as unavailable. Its styling belongs to `WizardShell`, which this change does not touch.
- Missing-media notice: it sits below the waveform hairline with the step's usual gap. In dark theme it reads as a caution next to the muted waveform, not as an error.
