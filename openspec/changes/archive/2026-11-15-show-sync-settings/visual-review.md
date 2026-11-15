# Visual review: show-sync-settings

Human-reviewed. Nothing here is enforced by a test. The implementer fills in "Observed" and "Screenshot" (task 4.3); the owner fills in "Verdict".

Reference: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("Other screens") and the sync and settings panels of `.superpowers/brainstorm/3955151-1794685630/content/editorial-uoq-v2.html`. The design document wins where they differ (no waveform lane).

Each row is checked in light and dark, in `en` and `zh-TW`.

| # | What to judge | Observed | Screenshot | Verdict |
|---|---|---|---|---|
| 1 | Sync offset: the seconds figure is the largest element; nudge buttons sit beside it | The serif `+0.75 s` / `+0.75 秒` figure is the largest element; the − and + buttons sit at the row's inline end, vertically centred on the figure. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/sss/sync-offset-{light,dark}-{en,zh-TW}.png | |
| 2 | Cue bars: dashed "original" row and solid "shifted" row make the direction of a positive and a negative offset obvious without a sentence | Dashed original row above the solid accent shifted row; positive offsets move the shifted bars right of their outlines, negative offsets left. Direction reads without the sentence. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/sss/nudge-positive.png, nudge-negative.png, nudge-zero.png | |
| 3 | Cue bars move smoothly with the value; with reduced motion they jump to the final position | Bars glide over 200 ms with the default motion setting. With `prefers-reduced-motion: reduce` the computed `transition-duration` is 0.01 ms and the computed `left` equals the final position right after a click. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/sss/nudge-reduced-motion.png | |
| 4 | The preview does not look like real audio or real cue timing | Four flat rectangles with even height and no waveform lane; they look like a diagram, not audio or real cue times. The shift saturates at 6 %, so large offsets do not run off the track. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/sss/sync-offset-light-en.png, nudge-negative.png | |
| 5 | Sync apply: source unmarked, output `+`; the "untouched" sentence is not missed | Kept line `ep03.srt` unmarked in ink-2, created line `+ ep03_synced.srt` in the add colour under the output field. The sentence is not missed: the diff says the same thing. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/sss/sync-apply-{light,dark}-{en,zh-TW}.png | |
| 6 | Sensitivity slider: end labels read naturally in both languages | `Stricter` / `More sensitive` and `較嚴格` / `較靈敏` sit under the slider's two ends in small ink-3 text. They read naturally in both languages. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/sss/sync-method-{light,dark}-{en,zh-TW}.png | |
| 7 | Settings headings: storage label at the inline end; `config.toml · shared with the SubX command line` is acceptable in place of a full path | Mono xs labels at the inline end of both ink rules: `config.toml · shared with the SubX command line` (wording revised from `subx-cli`, see below) and `This app only` / `僅此應用程式`. The file name is enough without a full path. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/sss/settings-{light,dark}-{en,zh-TW}.png | |
| 8 | API key: masked key with "Replace"; the replace / keep flow is clear | `****1234` in mono with an accent `Replace` link-button beside it. Replace opens an empty focused input with `Keep current key`. Keep returns to the mask, as the tests check. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/sss/settings-{light,dark}-{en,zh-TW}.png | |
| 9 | Connection test: status dot and latency beside the button | Green dot and `132 ms` in mono sit right after the Test connection button on the same row. No left-rule success banner. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/sss/settings-{light,dark}-{en,zh-TW}.png | |
| 10 | Language and theme: inline options with the accent underline on the current one; title-bar dropdowns unchanged | Language (2 options) and Theme (3 options) are inline, with the current option bold and an accent underline. The title-bar dropdowns are unchanged; only the Settings section changes. | /tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/sss/settings-{light,dark}-{en,zh-TW}.png | |

## Wording changed because of font coverage

none (`fontCoverage.test.ts` passes with the D8 values)

## Deviations from the design document found during review

- `ai.storedIn` reads `config.toml · shared with the SubX command line` / `config.toml · 與 SubX 命令列共用` instead of D8's `… shared with subx-cli`. The `app-shell` requirement "Thin Tauri command layer structure" forbids naming the engine crate outside `src-tauri/`, and `backendCodeParity.test.ts` enforces it.
- As the design already notes, the label names the file rather than the full configuration path the design document asks for.
- The `settings` preview view renders the sections with fixture props and has no save row, because the real screen needs IPC.

## Sign-off

- Implementer: Claude (os-apply, 2026-11-15); screenshots taken at 900×700 in headless Chromium via the preview harness
- Owner:
