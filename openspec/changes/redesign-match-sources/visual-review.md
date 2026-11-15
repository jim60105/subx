# Visual review: redesign-match-sources

Human-reviewed. Nothing here is enforced by a test. The implementer fills in "Observed" and "Screenshot" (task 4.2); the owner fills in "Verdict".

Reference: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("01 Sources") and the first panel of `.superpowers/brainstorm/3955151-1794685630/content/match-flow-v2.html`. The design document wins where they differ.

Each row is checked in light and dark, in `en` and `zh-TW`, at 1100 × 720 and 860 × 600.

| # | What to judge | Observed | Screenshot | Verdict |
|---|---|---|---|---|
| 1 | Empty state: the large drop zone reads as "these four kinds are accepted" without a sentence | Large dashed zone with four glyphs captioned 資料夾 / Folder, `.mkv .mp4`, `.srt .ass`, `.zip .7z` and both browse buttons; no sentence visible. Same in all 8 theme, language, and size combinations. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-sources-empty-{light,dark}-{en,zh-TW}-{1100x720,860x600}.png | |
| 2 | After the first source the drop zone is a single strip with glyphs and both browse buttons | One-row strip: four 16 px glyphs, the drop hint, both browse buttons at the inline end. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-sources-long-light-en-1100x720.png | |
| 3 | With 60 sources only the file list scrolls; relocation options and the action bar stay put | Scrolling `.file-groups` to the end left the relocation options (top 517 px at 1100 × 720, 397 px at 860 × 600) and the action bar (644 / 524 px) unmoved in every theme and language. `.wizard__content` scrollHeight <= clientHeight printed `true` at 1100 × 720 and also `true` at 860 × 600, where the list keeps about 100 px of height. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-sources-long-*-{1100x720,860x600}-scrolled.png | |
| 4 | Groups: sticky mono folder header with count and "remove"; entries in two columns with kind glyphs; long names end in an ellipsis | Sticky mono header `/downloads/subs/  20 … Remove` stays at the top while scrolled; entries in two columns with the video or subtitle glyph; names fit without truncation at these widths (ellipsis rule present in CSS). | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-sources-long-dark-zh-TW-860x600-scrolled.png | |
| 5 | The entry remove button appears on hover and on keyboard focus | Hover on an entry shows its ✕ (computed opacity 1); Tab from the browse buttons reaches the group Remove and then the first entry's ✕, which shows with the focus ring (opacity 1). | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/hover-entry-remove.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/focus-entry-remove.png | |
| 6 | The bottom fade signals more content and the last entry can be scrolled clear of it | The last rows fade towards the bottom edge; scrolled to the end, the final row sits above the fade and is fully legible. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-sources-long-light-en-1100x720.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-sources-long-dark-zh-TW-860x600-scrolled.png | |
| 7 | Scan totals read as large serif numerals with their nouns | `40 videos  20 subtitles` / `40 影片  20 字幕`: large serif figures with sans nouns on one baseline. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-sources-long-light-en-1100x720.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-sources-long-dark-zh-TW-860x600-scrolled.png | |
| 8 | Relocation segments: selected segment has the accent top rule and filled dot; each shows a two-line diff; no hint sentence is visible | Selected segment has the accent top rule, paper-2 fill, and filled accent dot; each segment shows a two-line diff (− struck in --del, + in --add, kept line unmarked); no hint sentence visible. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-sources-long-light-en-1100x720.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-sources-empty-dark-zh-TW-1100x720.png | |
| 9 | Keyboard: arrow keys move between relocation options and the focus ring is visible | ArrowRight from the focused Rename radio moved focus and selection to Copy; the segment shows a 2 px accent focus outline (`:focus-within`). | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/keyboard-radio-copy.png | |
| 10 | Other wizard steps are unaffected by `.wizard__content` becoming a flex column | Convert, sync, and translate step 1 measured with `.wizard__content` as flex and as block: identical root heights (291 / 290 / 291 px) and panel scroll sizes. A 1500 px block injected into a step kept its natural height (1807 px) and the panel scrolled (scrollTop 1476). | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/other-Convert-format.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/other-Sync-timing.png, /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/other-Translate.png | |

## Wording changed because of font coverage

none

## Deviations from the design document found during review

none

## Sign-off

- Implementer: Claude Code (os-apply), 2026-11-15; screenshots under the session scratch directory listed above
- Owner:
