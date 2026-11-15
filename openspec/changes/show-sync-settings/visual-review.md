# Visual review: show-sync-settings

Human-reviewed. Nothing here is enforced by a test. The implementer fills in "Observed" and "Screenshot" (task 4.3); the owner fills in "Verdict".

Reference: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("Other screens") and the sync and settings panels of `.superpowers/brainstorm/3955151-1794685630/content/editorial-uoq-v2.html`. The design document wins where they differ (no waveform lane).

Each row is checked in light and dark, in `en` and `zh-TW`.

| # | What to judge | Observed | Screenshot | Verdict |
|---|---|---|---|---|
| 1 | Sync offset: the seconds figure is the largest element; nudge buttons sit beside it | | | |
| 2 | Cue bars: dashed "original" row and solid "shifted" row make the direction of a positive and a negative offset obvious without a sentence | | | |
| 3 | Cue bars move smoothly with the value; with reduced motion they jump to the final position | | | |
| 4 | The preview does not look like real audio or real cue timing | | | |
| 5 | Sync apply: source unmarked, output `+`; the "untouched" sentence is not missed | | | |
| 6 | Sensitivity slider: end labels read naturally in both languages | | | |
| 7 | Settings headings: storage label at the inline end; `config.toml · shared with subx-cli` is acceptable in place of a full path | | | |
| 8 | API key: masked key with "Replace"; the replace / keep flow is clear | | | |
| 9 | Connection test: status dot and latency beside the button | | | |
| 10 | Language and theme: inline options with the accent underline on the current one; title-bar dropdowns unchanged | | | |

## Wording changed because of font coverage

(list, or "none")

## Deviations from the design document found during review

(list, or "none")

## Sign-off

- Implementer:
- Owner:
