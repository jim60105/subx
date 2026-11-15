# Visual review: editorial-visual-foundation

Human-reviewed. Nothing in this file is enforced by a test; it records what a person must judge. The implementer fills in "Observed" and "Screenshot" (task 8.2); the owner fills in "Verdict".

Reference: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("Visual foundation") and the mockup `.superpowers/brainstorm/3955151-1794685630/content/editorial-uoq-v2.html`. Where they disagree, the design document wins.

## Measurements

| Item | Value |
|---|---|
| Source TTF size (bytes) | 4,901,688 |
| Bundled WOFF2 size (bytes) | 2,111,020 |
| `dist/` total size before / after (bytes) | 370,355 / 2,473,446 (`vite build` of master `1a8859e` vs. this branch; the WOFF2 accounts for 2,111,020) |

## Checklist

Each row is checked in light and dark, in `en` and `zh-TW`.

| # | What to judge | Observed | Screenshot | Verdict |
|---|---|---|---|---|
| 1 | Window reads as paper and ink: no card, glass, gradient, shadow, or glow anywhere | Paper background and ink text in both themes; header sits on a 2px ink rule; lists are hairline rows; no card, blur, gradient, shadow, or glow seen on home, the four wizards' steps, or Settings. | `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/app-home-light-zh.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/app-dark-en.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/settings-dark-zh-TW.png` | |
| 2 | Serif renders in UoqMunThenKhung for headings, brand, breadcrumb, ordinals, and numerals; no faux bold or italic | Page and step headings, `SubX`, the breadcrumb title, stepper ordinals, and home ordinals and titles render in UoqMunThenKhung in en and zh-TW; no faux bold or italic seen (single 400 weight, synthesis off). | `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/app-dark-en.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-wizard-dark-zh-TW.png` | |
| 3 | Title bar: `SubX / <screen>` breadcrumb, 2px ink rule beneath, borderless language / theme / settings controls, no tagline | `SubX / Match subtitles` (`SubX / 配對字幕`) on feature screens, `SubX` alone on the hub; 2px ink rule beneath; language, theme, and settings are borderless text controls; no tagline. | `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-wizard-light-en.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/theme-popover-dark-zh-TW.png` | |
| 4 | Stepper: `01 …  02 …` on a hairline; active step ink with accent underline; completed numeral accent | `01 Sources  02 Analysis  03 Review  04 Execute` on a hairline; active step ink with accent underline. Completed-step accent numeral is implemented (CSS) but not exercised in a screenshot: the preview harness has no wizard-at-step-2 view yet. | `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-wizard-light-en.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-wizard-dark-zh-TW.png` | |
| 5 | Buttons: primary solid ink at the inline end, secondary ink outline, back / cancel text-only; accent is never a fill | Primary (`Analyze`, `儲存變更`) solid ink at the inline end, shown disabled at 45 % opacity; secondary (`Browse files`, `測試連線`) 1px ink outline; back/cancel are text-only tertiary (not on screen in the first step). Accent is never a fill. | `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-wizard-light-en.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/settings-dark-zh-TW.png` | |
| 6 | Home: numbered list, whole row hovers, specimen on the right demonstrates each task, no subheading | Numbered list `01`–`04`, the whole row is the button with a paper-2 hover; specimens on the right (paired file names, `.srt → .ass .vtt .sub`, shifted timecode, `Long time no see. → 好久不見。`); no subheading. In English the 9rem title column wraps `Match subtitles` and `Convert format` onto two lines. | `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/app-dark-en.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/app-home-light-zh.png` | |
| 7 | Every wizard step and Settings adopt the new tokens with no leftover panel styling (content not restructured) | All steps and Settings use the new tokens; former panels are hairline rows, inputs ink-3 bordered, status panels a coloured inline-start rule. Native checkbox and radio controls still draw in the browser's default (blue) accent colour. | `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/SourcesStep-light-en.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/ReviewStep-dark-zh-TW.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/ExecuteStep-light-en.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/SyncMethodStep-dark-zh-TW.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/TranslateOptionsStep-light-en.png`, `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/ConvertOptionsStep-light-en.png` | |
| 8 | Focus ring is visible on every interactive control in both themes | Keyboard focus shows a 2px accent outline offset by 2px (seen on `Browse files`); the same global `:focus-visible` rule applies in dark. | `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-wizard-860-light-en.png` | |
| 9 | At 860 px width the version badge is fully visible and the breadcrumb title truncates first | At 860 px the version badge `0.2.0 · abc1234` stays whole; the breadcrumb title `Match subtitles` has room, so truncation was not triggered at this length (CSS gives it `min-width: 0` + ellipsis, the badge `flex-shrink: 0`). | `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/match-wizard-860-light-en.png` | |
| 10 | Preference dropdown popovers are readable and unclipped in both themes | Theme popover opens below its trigger on paper with a 1px ink border, readable and unclipped above the stepper; selected option in accent-ink on paper-2. | `/tmp/claude-1000/-var-home-jim60105-repos-subx/59017e25-5572-485b-8962-f7bbf9c234d1/scratchpad/shots/theme-popover-dark-zh-TW.png` | |

## Deviations from the design document found during review

- Home, English: the 9rem title column (D8) wraps two task names onto two lines; the mockup shows Chinese titles only.
- Native checkboxes and radios keep the browser's blue accent; no token or rule in this change restyles them (left for the wizard redesign changes).
- The sync method step shows two stacked hairlines where the former method panel and its offset field each became a row.
- Screenshots live in the session scratch directory listed above and are not committed.
- Fixed during review (commit `fix(style): drop leftover native boxes found in visual review`): fieldsets kept the browser's groove border, the language chips kept the native button fill, and form controls did not inherit the sans stack.

## Owner acceptance

Owner, 2026-11-15: accepted in the running desktop app (`npm run dev:app`, frontend served live by vite from build `e8f4f7f`) rather than in headless Chromium, which clears rows 1–10 above.

The session that recorded this acceptance also repaired the launcher: `npm run dev:app` had been compiling a production binary that served a stale embedded `dist/` bundle, so earlier in-app attempts showed the pre-merge UI (fixed in `e8f4f7f`).

## Sign-off

- Implementer: os-apply agent, 2026-11-15
- Owner: Jim Chen, 2026-11-15 — accepted in the running app (see Owner acceptance)
