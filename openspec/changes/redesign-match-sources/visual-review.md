# Visual review: redesign-match-sources

Human-reviewed. Nothing here is enforced by a test. The implementer fills in "Observed" and "Screenshot" (task 4.2); the owner fills in "Verdict".

Reference: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("01 Sources") and the first panel of `.superpowers/brainstorm/3955151-1794685630/content/match-flow-v2.html`. The design document wins where they differ.

Each row is checked in light and dark, in `en` and `zh-TW`, at 1100 × 720 and 860 × 600.

| # | What to judge | Observed | Screenshot | Verdict |
|---|---|---|---|---|
| 1 | Empty state: the large drop zone reads as "these four kinds are accepted" without a sentence | | | |
| 2 | After the first source the drop zone is a single strip with glyphs and both browse buttons | | | |
| 3 | With 60 sources only the file list scrolls; relocation options and the action bar stay put | | | |
| 4 | Groups: sticky mono folder header with count and "remove"; entries in two columns with kind glyphs; long names end in an ellipsis | | | |
| 5 | The entry remove button appears on hover and on keyboard focus | | | |
| 6 | The bottom fade signals more content and the last entry can be scrolled clear of it | | | |
| 7 | Scan totals read as large serif numerals with their nouns | | | |
| 8 | Relocation segments: selected segment has the accent top rule and filled dot; each shows a two-line diff; no hint sentence is visible | | | |
| 9 | Keyboard: arrow keys move between relocation options and the focus ring is visible | | | |
| 10 | Other wizard steps are unaffected by `.wizard__content` becoming a flex column | | | |

## Wording changed because of font coverage

(list, or "none")

## Deviations from the design document found during review

(list, or "none")

## Sign-off

- Implementer:
- Owner:
