# Visual review: redesign-match-review

Human-reviewed. Nothing here is enforced by a test. The implementer fills in "Observed" and "Screenshot" (task 5.2); the owner fills in "Verdict".

Reference: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("03 Review") and the third panel of `.superpowers/brainstorm/3955151-1794685630/content/match-flow-v2.html`. The design document wins where they differ (threshold 80, not 70).

Each row is checked in light and dark, in `en` and `zh-TW`, at 1100 × 720 and 860 × 600.

| # | What to judge | Observed | Screenshot | Verdict |
|---|---|---|---|---|
| 1 | The ledger scans as one row per pairing: video, joining rule, subtitle with language tag, resulting name in the "created" colour | | | |
| 2 | A video's second pairing reads as belonging to the row above it | | | |
| 3 | High-confidence rows are quiet; the low-confidence row stands out through the accent rule, meter, figure, and visible reasoning | | | |
| 4 | Unmatched rows: the dashed slot makes the missing side obvious | | | |
| 5 | Filter row and language chips share one line without crowding at 860 px | | | |
| 6 | `12 / 14` beside the primary button is legible and does not shift the button | | | |
| 7 | Long file names truncate with an ellipsis and never widen the ledger | | | |
| 8 | Only the ledger scrolls; filters and the action bar stay put | | | |

## Wording changed because of font coverage

(list, or "none")

## Deviations from the design document found during review

(list, or "none")

## Sign-off

- Implementer:
- Owner:
