# Visual review: redesign-match-review

Human-reviewed. Nothing here is enforced by a test. The implementer fills in "Observed" and "Screenshot" (task 5.2); the owner fills in "Verdict".

Reference: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("03 Review") and the third panel of `.superpowers/brainstorm/3955151-1794685630/content/match-flow-v2.html`. The design document wins where they differ (threshold 80, not 70).

Each row is checked in light and dark, in `en` and `zh-TW`, at 1100 × 720 and 860 × 600.

| # | What to judge | Observed | Screenshot | Verdict |
|---|---|---|---|---|
| 1 | The ledger scans as one row per pairing: video, joining rule, subtitle with language tag, resulting name in the "created" colour | One row per pairing: checkbox, mono video name, a short ink rule, a bordered `TC`/`EN` tag with the mono subtitle name, and `→ <new name>` beneath it in the green `--add` colour. Same in all 8 theme, language, and size combinations. Checkboxes are the native control (blue in Chromium); the mockup draws ink boxes, which the design does not ask for. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/all-{light,dark}-{en,zh-TW}-{1100x720,860x600}.png | |
| 2 | A video's second pairing reads as belonging to the row above it | The EN rows of E01 and E02 leave the video column empty, so each reads as a continuation of the row above; the name stays in the DOM visually hidden. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/all-light-zh-TW-1100x720.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/all-dark-en-860x600.png | |
| 3 | High-confidence rows are quiet; the low-confidence row stands out through the accent rule, meter, figure, and visible reasoning | Confident rows show no figure. The 52 row has the accent rule on its inline start, three of five meter segments filled, `52% match` / `52% 相符` in accent ink, and both reasoning lines visible under the resulting name. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/all-light-zh-TW-1100x720.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/needsReview-dark-zh-TW-1100x720.png | |
| 4 | Unmatched rows: the dashed slot makes the missing side obvious | Under Unmatched, the two videos end in a dashed slot on the subtitle side and `readme-credits.ass` starts with a dashed slot on the video side; no checkbox on any of the three. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/unmatched-{light,dark}-{en,zh-TW}-{1100x720,860x600}.png | |
| 5 | Filter row and language chips share one line without crowding at 860 px | Filters and chips share one line at both sizes in both languages (measured: the filter group and the chip group start on the same line). At 860 px in English the chips `Traditional Chinese 12` and `English 2` still fit beside `All 14  Needs review 1  Unmatched 3`. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/all-dark-en-860x600.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/all-light-en-860x600.png | |
| 6 | `12 / 14` beside the primary button is legible and does not shift the button | `14 / 14` is a large serif figure beside Continue. Deselecting the English chip changed it to `12 / 14`; the primary button's left edge stayed at 954.9 px before and after, and its top did not move. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/chip-off-{light,dark}-en-1100x720.png | |
| 7 | Long file names truncate with an ellipsis and never widen the ledger | An 86-character subtitle name ends in an ellipsis (`scrollWidth > clientWidth`) and the ledger has no horizontal overflow at either size. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/all-light-zh-TW-1100x720.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/all-dark-en-860x600.png | |
| 8 | Only the ledger scrolls; filters and the action bar stay put | Only `.review-ledger` scrolls (`.wizard__content` does not overflow at either size). Opening the E06 disclosure and scrolling the ledger left the filters and the primary button in place (button top 644 px at 1100 × 720, 524 px at 860 × 600). This review found and fixed an overflow: the rows' visually hidden text escaped the scroller and made the document 982 px tall; `.review-ledger` is now `position: relative` and the document is exactly the window height. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/reasoning-open-light-en-1100x720.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots-review/reasoning-open-dark-zh-TW-860x600.png | |

## Limits of this evidence

- Screenshots were taken in headless Chromium through the preview harness (`npm run dev`, `?view=match-review`), not in the Tauri WebKitGTK shell; `npm run dev:app` was not run. Re-check rows 6 and 8 there.
- The screenshot paths point into the implementer's session scratch directory, which is ephemeral; regenerate them from the preview view if they are gone.
- Brace patterns such as `{light,dark}` in a path stand for every listed variant.
- The deselected-chip and opened-disclosure captures were taken in English only; the light 1100 × 720 disclosure capture also shows the deselected English chip.

## Wording changed because of font coverage

none

## Deviations from the design document found during review

- `.review-ledger` adds `position: relative` (not in D3) so visually hidden row text stays inside the scroller; asserted in `layout.test.ts`.
- The ledger `<ul>` is not rendered when the active filter shows nothing (D2 always renders it), so a screen reader does not meet an empty named list beside the "nothing to show" message.
- `hardCodedStrings.test.tsx` allows exactly the upper-cased language tags of the review fixture instead of D6's `/^[A-Z]{2,3}$/`, so an unrelated two- or three-letter key left untranslated elsewhere still fails the gate.

## Sign-off

- Implementer: Claude Code (os-apply), 2026-11-15; screenshots under the session scratch directory listed above
- Owner:
