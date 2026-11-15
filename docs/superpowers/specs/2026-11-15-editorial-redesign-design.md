# Editorial Redesign — Design

Date: 2026-11-15
Status: approved; proposed as six OpenSpec changes (see "Delivery")

## Goal

Replace the current glassmorphism look with an editorial, typography-led visual
identity, and apply one design principle across every screen:

> **Show, don't tell.** Where a sentence explains what a control does, replace
> the sentence with a design that demonstrates it.

Features and screens stay the same. Layout and component structure change where
the principle or a known UX problem requires it.

Reference mockups (not shipped) live in
`.superpowers/brainstorm/3955151-1794685630/content/`:
`editorial-uoq-v2.html` (home, sources, sync, settings) and
`match-flow-v2.html` (the four match steps, with animations).

## Decisions

| Topic | Decision |
|---|---|
| Direction | "Editorial Desk": paper and ink, serif headings, hairline rules, no cards, no glass, no ambient glow |
| Serif typeface | UoqMunThenKhung (宇文天穹), Regular only, bundled. Used for Latin, digits, and CJK |
| Sans and mono | System fonts. Nothing else is bundled |
| Accent | Vermilion, used only as a marker: active step, numerals, selection, low confidence. Never as a button fill |
| Primary button | Solid ink with paper-coloured text |
| Review ordering | Video (episode) order is preserved. Never re-sorted by confidence |
| Delivery | Six OpenSpec changes, in order (see "Delivery") |

Rejected: Hina Mincho (lacks 16 characters the zh-TW locale uses, including 步,
檔, 你, which appear in headings); a card-based layout (explicitly unwanted).

## Visual foundation

### Colour tokens

All values meet WCAG AA (4.5:1) for text against both `--paper` and `--paper-2`,
except `--accent`, which is used for rules, markers, and large numerals only;
accent-coloured body text uses `--accent-ink`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#f7f4ee` | `#131210` | Window background |
| `--paper-2` | `#efeae0` | `#1c1a17` | Hover and selected fill |
| `--ink` | `#1a1713` | `#ebe5db` | Primary text, strong rules, primary button fill |
| `--ink-2` | `#57504a` | `#b0a89c` | Secondary text |
| `--ink-3` | `#6b645b` | `#8f877b` | Muted text, inactive steps |
| `--hair` | `#d6d0c4` | `#34302b` | Hairline rules and quiet borders |
| `--accent` | `#c23b12` | `#ff7648` | Markers, active underline |
| `--accent-ink` | `#b23510` | `#ff8a62` | Accent-coloured text and numerals |
| `--on-ink` | `#f7f4ee` | `#131210` | Text on an ink fill |
| `--add` | `#2f6b3f` | `#7fc893` | Created file, success |
| `--del` | `#b3261e` | `#ff8d86` | Removed file, failure |

The existing token names (`--surface`, `--text-primary`, `--accent-gradient*`,
`--shadow-*`, `--surface-blur`, …) are replaced, not aliased. Gradient, glow,
blur, and panel-shadow tokens are deleted along with every use of them.
`tokens.contrast.test.ts` is rewritten against the new token set and keeps its
role as the proof of the contrast requirement.

### Typography

- `--font-serif: "UoqMunThenKhung", serif` — page headings, section headings,
  the brand, the breadcrumb, step numerals, task titles, and large numerals
  (counts, offsets, results). Weight 400 only; no synthetic bold or italic.
- `--font-sans: system-ui, sans-serif` — body, labels, buttons.
- `--font-mono: ui-monospace, monospace` — file names, paths, timecodes, diffs.
- The font ships as a WOFF2 asset inside the app bundle with a matching
  `@font-face`; the app must render identically offline. The source TTF is
  4.9 MB; the WOFF2 size is to be measured during implementation.
- The font covers every character in both locale files today. A test asserts
  this for all locale strings so a future string cannot silently fall back to a
  system serif.

### Shape, elevation, motion

- Radii: `2px` for controls, `0` for containers. No pill shapes.
- No shadows. Separation comes from rules: `2px --ink` under the title bar,
  `1px --ink` under section headings, `1px --hair` between rows.
- Motion tokens stay (`--motion-fast`, `--motion-base`, `--ease-out`).
  `prefers-reduced-motion` continues to disable all animation; each animated
  screen defines a static equivalent (see the match steps).

### Shared components

- **Title bar.** The brand becomes a breadcrumb: `SubX / 配對字幕`. `SubX` is the
  home link on feature screens; the current segment is plain text. This replaces
  the undiscoverable "click the brand to go home". Language, theme, and settings
  controls become borderless text controls. The tagline is removed.
- **Stepper.** A row of `01 來源  02 分析 …` on a hairline. Active: ink text with
  an accent underline. Completed: accent numeral. The "Step 1 of 4" line becomes
  visually hidden text for assistive technology.
- **Buttons.** Secondary: 1px ink outline. Primary: solid ink, pinned to the
  inline end as today. Tertiary (back, cancel): text only.
- **Home.** A numbered list instead of a card grid; the whole row is the button.
  Each row's description is replaced by a *specimen* on the right that
  demonstrates the task: paired file names for match, `.srt → .ass .vtt .sub`
  for convert, a shifted timecode for sync, a subtitle line in two languages for
  translate. The subheading is removed.
- **Diff preview.** One shared component renders file consequences as
  `− removed` (struck, `--del`), `+ created` (`--add`), or an unmarked kept
  line. It is used by the relocation options, the convert and translate output
  lists, the sync output, and the execute step.

## Match wizard

### 01 Sources

Problem fixed: the file list sat above the relocation options and pushed them
out of view, so users forgot to choose.

- The step is a fixed-height column. Only the file list scrolls. The relocation
  options and the action bar are pinned below it and are always visible.
- With no sources, the drop zone is large and shows four glyphs with their
  extensions (folder, video, subtitle, archive) instead of the descriptive
  sentence. After the first source, it collapses to a single strip holding the
  glyphs and the two browse buttons. The whole window remains a drop target.
- Counts appear as large serif numerals (`24 影片  31 字幕`).
- The list groups entries by parent folder under a sticky mono path header with
  an item count and a "remove group" action. Entries flow in two columns, carry
  a type glyph derived from the extension, truncate with an ellipsis, and reveal
  a remove button on hover and on focus. A bottom fade signals more content.
- Relocation is a three-segment radio group. Each segment shows a two-line diff
  of a sample file instead of a hint sentence. The sample file names are
  constants, not translated strings.

### 02 Analysis

- Three serif stage words (掃描 · 分析 · 整理) track the real `MatchStage`.
- Below them, an illustrative animation: film-strip bars (videos) on the left,
  subtitle bars on the right. Scanning fades the bars in; analysing draws dashed
  accent curves that try different pairings and leaves an ink curve for each
  settled pair; finalising dims the unpaired bars.
- The backend reports stages only, so the animation is deliberately not a
  progress indicator: it has no percentage, no file names, and no element whose
  count claims to match the real data beyond the two scan totals.
- Reduced motion: the bars and stage words render statically; only the active
  stage word changes.

### 03 Review

Problem fixed: three nested levels (video heading, subtitle list, target path)
were hard to scan.

- One row per pairing in a ledger: checkbox, video name, a joining rule,
  subtitle name with a language tag, and the resulting file name beneath it in
  `--add`. A video's second and later subtitles omit the repeated video name.
- Rows keep video order. In practice nearly every match is high confidence, so
  confidence is hidden unless it is below 80; such a row gets an accent rule on
  its inline start, a five-segment meter with the number, and the AI reasoning
  expanded in place. Other rows expose reasoning on demand.
- A filter row offers 全部 / 需確認 / 未配對 with counts, plus the existing
  per-language bulk toggles as chips.
- Unmatched videos and subtitles appear in the same ledger with an empty dashed
  slot on the missing side.
- The action bar shows the selected count as `12 / 14` beside the primary
  button. The "uncheck anything you don't want" sentence is removed.

### 04 Execute

- Before running: every selected operation is listed as `old name → new name`,
  under a large count and the relocation mode.
- Running: an accent bar sweeps along a rule above the list and the list
  breathes. The command returns one report, so no per-row progress is shown.
- Done: rows resolve top to bottom on a short stagger. A success strikes the old
  name, turns the new name `--add`, and shows a check. A failure turns `--del`
  and shows its error beneath the row. Large numerals count successes and
  failures.
- Reduced motion: the final state appears at once.

## Other screens

The same vocabulary applies; each removed sentence is replaced as follows.

| Screen | Removed text | Replacement |
|---|---|---|
| Convert, Translate — sources | "Folders, single files and archives all work." | Shared drop zone with type glyphs; shared grouped file list |
| Convert, Translate — options | "Each file below shows where the output is written." | The list itself, rendered as diffs |
| Convert — keep original off | "Each input is deleted after it converts." | Source lines render as `− removed` |
| Sync — offset | "Positive delays, negative advances." | Offset as the largest numeral with nudge buttons; ghost and solid cue bars that move with the value |
| Sync — apply | "Your file is untouched; a copy is written above." | Diff: source unmarked, output `+` |
| Sync — sensitivity | "Lower is stricter…" | Slider with labelled ends |
| Settings — AI | "Written to the file the CLI reads." | The config path shown at the section heading's inline end |
| Settings — preferences | "Stored in this app only." | "This app only" label in the same position |
| Settings — API key | "Stored keys are never shown. Leave empty to keep…" | Masked key with a "Replace" action |
| Settings — test | "Saves, then sends one short request." | Status dot and latency beside the button |
| Settings — language, theme | Dropdowns | Options laid out inline (two and three choices); the title bar keeps its dropdowns |

The sync cue bars are schematic. No waveform is drawn: no audio data crosses
IPC, and this design adds none.

Text that carries information a design cannot (error messages, the "at least
one video and one subtitle" requirement, destructive-action warnings) remains,
and every removed sentence that assistive technology still needs stays as
visually hidden text or an accessible name.

## Constraints carried over

- Every colour stays in `tokens.css` (`tokens.colorLiteral.test.ts`).
- Every user-facing string stays in both locales; removed keys are deleted from
  both (`localeParity.test.ts`, `hardCodedStrings.test.tsx`).
- Theme storage and follow-system behaviour are unchanged.
- No backend or IPC change is required by any part of this design.

## Spec impact

- `theme-system`: the identity requirement is rewritten (editorial paper and
  ink, vermilion marker accent, bundled serif) and its Purpose line updated.
  The follow-system, override, and popover requirements are unchanged.
- Wizard and settings capabilities: scenarios that assert removed text or the
  old structure are revised alongside their `@covers` tests.

## Delivery

The design was planned as three deliveries. During proposal writing the match
wizard and the remaining screens each proved larger than a workday, so they were
split. The result is six OpenSpec changes under `openspec/changes/`, each
independently verifiable with `npm run verify`. Apply them strictly in this
order:

| # | Change | Scope | Depends on |
|---|---|---|---|
| 1 | `editorial-visual-foundation` | Tokens (replaced, not aliased), bundled font and coverage test, contrast test rewrite, title-bar breadcrumb, stepper, buttons, numbered home list with specimens, dev-only preview harness. Every screen adopts the new look through tokens; no wizard content is restructured | — |
| 2 | `redesign-match-sources` | Shared diff preview, drop zone, and grouped file list; match sources step with pinned relocation options | 1 |
| 3 | `redesign-match-review` | Review ledger in video order, confidence only below 80, in-ledger unmatched slots, filters, `12 / 14` count | 1, 2 |
| 4 | `redesign-match-analysis-execute` | Analysis illustration; execute list, running, and resolved states; reduced-motion equivalents | 1, 2, 3 |
| 5 | `show-convert-translate` | Convert and translate reuse the drop zone and grouped list; planned outputs rendered as diffs | 1, 2 |
| 6 | `show-sync-settings` | Sync offset numeral, nudge buttons, schematic cue bars, apply diff, slider end labels; settings storage labels, masked key with Replace, inline test status, inline language and theme | 1, 2 |

Changes 5 and 6 do not depend on 3 or 4, or on each other, but all six touch
`hardCodedStrings.test.tsx` and the preview harness views, so they are applied
one at a time.

Each change's `design.md` records where it interprets this document; where the
two differ, the change is the more specific and more recent source.

## Testing

- Contrast and colour-literal tests updated for the new tokens.
- Font coverage test over all locale strings.
- Component tests for: relocation options remaining rendered with a long source
  list; review row order equal to plan order; confidence shown only below the
  threshold; unmatched slots; execute outcome states.
- Animation is verified in a browser with `agent-browser`, in both themes and
  with reduced motion emulated.
