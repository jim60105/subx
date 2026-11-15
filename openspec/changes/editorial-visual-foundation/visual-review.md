# Visual review: editorial-visual-foundation

Human-reviewed. Nothing in this file is enforced by a test; it records what a person must judge. The implementer fills in "Observed" and "Screenshot" (task 8.2); the owner fills in "Verdict".

Reference: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("Visual foundation") and the mockup `.superpowers/brainstorm/3955151-1794685630/content/editorial-uoq-v2.html`. Where they disagree, the design document wins.

## Measurements

| Item | Value |
|---|---|
| Source TTF size (bytes) | |
| Bundled WOFF2 size (bytes) | |
| `dist/` total size before / after (bytes) | |

## Checklist

Each row is checked in light and dark, in `en` and `zh-TW`.

| # | What to judge | Observed | Screenshot | Verdict |
|---|---|---|---|---|
| 1 | Window reads as paper and ink: no card, glass, gradient, shadow, or glow anywhere | | | |
| 2 | Serif renders in UoqMunThenKhung for headings, brand, breadcrumb, ordinals, and numerals; no faux bold or italic | | | |
| 3 | Title bar: `SubX / <screen>` breadcrumb, 2px ink rule beneath, borderless language / theme / settings controls, no tagline | | | |
| 4 | Stepper: `01 …  02 …` on a hairline; active step ink with accent underline; completed numeral accent | | | |
| 5 | Buttons: primary solid ink at the inline end, secondary ink outline, back / cancel text-only; accent is never a fill | | | |
| 6 | Home: numbered list, whole row hovers, specimen on the right demonstrates each task, no subheading | | | |
| 7 | Every wizard step and Settings adopt the new tokens with no leftover panel styling (content not restructured) | | | |
| 8 | Focus ring is visible on every interactive control in both themes | | | |
| 9 | At 860 px width the version badge is fully visible and the breadcrumb title truncates first | | | |
| 10 | Preference dropdown popovers are readable and unclipped in both themes | | | |

## Deviations from the design document found during review

(list, or "none")

## Sign-off

- Implementer:
- Owner:
