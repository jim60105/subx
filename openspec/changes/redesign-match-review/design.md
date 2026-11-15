# Design: redesign-match-review

## Context

Source of truth: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("03 Review"). Mockup (read-only, git-ignored): third panel of `.superpowers/brainstorm/3955151-1794685630/content/match-flow-v2.html`. The design document wins where they differ: the low-confidence threshold is **80** (the mockup uses 70).

State this change starts from (after `redesign-match-sources`):

- `ReviewStep.tsx` receives `plan: MatchPlanDto`, `selectedIds: Set<number>`, `onToggle(id)`, `onToggleLanguage(ids)`; it renders a language quick-select bar, one `<section>` per `plan.videos[]` with an `<h3>` and a `<ul>` of operations (checkbox, subtitle name, "Will become `<targetPath>`", a confidence figure on every row, reasoning in `<details>`), then two "unmatched" sections.
- `MatchOperationDto` is `{ id, subtitleName, targetPath, confidence (0–100 integer), language: string | null, reasoning: string[] }`. `MatchPlanDto` is `{ planId, relocationMode, videos: { videoName, matches }[], unmatchedVideos: string[], unmatchedSubtitles: string[] }`. The frontend has no subtitle source path; the resulting file name is the base name of `targetPath`.
- `useMatchWizard` exposes `selectedCount` and `totalOperations`. The locale key `review.selectedCount` ("{{count}} of {{total}} selected") exists in both locales.
- `WizardShell`'s action bar has three slots (`back`, `secondary`, `next`); `WizardNavAction` is `{ label, disabled?, onClick? }`.
- `baseName` lives in `src/platform/fileKind.ts`. `.wizard__content` is a flex column and remains the default scroller.
- Existing `match-workflow` scenarios "Multi-language matches under one video" and "Unmatched items are visible" are verified by Rust tests in `src-tauri/src/commands/match.rs`; their names and IDs must not change, and no Rust file is edited.
- `hardCodedStrings.test.tsx` renders the review fixture in `zh-TW` and expects no key-shaped text; its fixture dodges that with numeric names.

A previous change (`2026-09-29-add-language-quick-select`) rejected a row filter because hidden rows could change what "Execute" means. The approved redesign reintroduces filters; this design answers the original objection by keeping `12 / 14` permanently visible beside the primary button and specifying that filters never touch selection. The quick-select chips themselves still only toggle selection, so that requirement is unchanged.

## Goals / Non-Goals

**Goals:**

- A pure, unit-tested derivation from `MatchPlanDto` to ledger rows, so ordering and filtering are proven without rendering.
- One generic `WizardShell` extension (a status note on `next`) rather than a match-specific slot.

**Non-Goals:**

- Sorting, re-assigning a subtitle to another video, or hiding the resulting name of a deselected row (the mockup dims deselected rows; the document does not ask for it).
- Changing the language quick-select behaviour, selection state, or anything in `useMatchWizard` beyond what `MatchWizard.tsx` reads.
- The analysis and execute steps (`redesign-match-analysis-execute`).
- Any change under `src-tauri/` or to `src/types/bindings.ts`.

## Decisions

### D1: `src/features/match/reviewLedger.ts` (pure)

```ts
import type { MatchOperationDto, MatchPlanDto } from "../../types/ipc";

/** Confidence strictly below this needs review. From the design document. */
export const LOW_CONFIDENCE_THRESHOLD = 80;
/** Segments in the confidence meter. */
export const METER_SEGMENTS = 5;

export type ReviewFilter = "all" | "needsReview" | "unmatched";
export const REVIEW_FILTERS: readonly ReviewFilter[] = ["all", "needsReview", "unmatched"];

export type LedgerRow =
  | { kind: "pair"; key: string; videoIndex: number; videoName: string;
      showVideoName: boolean; low: boolean; operation: MatchOperationDto }
  | { kind: "unmatchedVideo"; key: string; name: string }
  | { kind: "unmatchedSubtitle"; key: string; name: string };

/** Pairings in `plan.videos` order then `matches` order, then unmatched videos, then unmatched subtitles. Never sorts. */
export function buildLedger(plan: MatchPlanDto): LedgerRow[];
/** `all` keeps everything; `needsReview` keeps low pairings; `unmatched` keeps the two unmatched kinds.
 *  Recomputes `showVideoName`: true when the previous kept pairing has a different `videoIndex`. */
export function filterLedger(rows: readonly LedgerRow[], filter: ReviewFilter): LedgerRow[];
/** all = pairings; needsReview = low pairings; unmatched = unmatched videos + unmatched subtitles. */
export function ledgerCounts(rows: readonly LedgerRow[]): Record<ReviewFilter, number>;
/** Filled meter segments for a 0–100 confidence: `Math.round(confidence / 20)`, clamped to 0…METER_SEGMENTS. */
export function meterSegments(confidence: number): number;
```

`low` is `operation.confidence < LOW_CONFIDENCE_THRESHOLD`. Keys: `pair-<id>`, `video-<index>`, `subtitle-<index>`.

### D2: `ReviewStep.tsx` markup

Props are unchanged. Local state: `const [filter, setFilter] = useState<ReviewFilter>("all")`. Order inside `<div className="review-step">`:

1. `<h2 className="visually-hidden">{t("review.title")}</h2>`
2. `<div className="review-step__toolbar">` containing
   - `<div className="review-step__filters" role="group" aria-label={t("review.filterLabel")}>` with one `<button type="button" className="review-step__filter" data-filter={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`review.filters.${f}`)} <span className="review-step__filter-count serif">{counts[f]}</span></button>` per `REVIEW_FILTERS` entry;
   - the existing language quick-select group, markup and behaviour unchanged (still rendered only when the plan has operations).
3. `{pairCount === 0 && <p className="review-step__empty">{t("review.empty")}</p>}`
4. `{pairCount > 0 && visibleRows.length === 0 && <p className="review-step__empty">{t("review.filterEmpty")}</p>}`
5. `<ul className="review-ledger" aria-label={t("review.ledgerLabel")}>` with one `<li>` per visible row. When `filter === "all"` and unmatched rows exist, a `<li className="review-ledger__section" aria-hidden="true">{t("review.filters.unmatched")}</li>` precedes the first unmatched row.

Pairing row:

```tsx
<li className="review-ledger__row" data-kind="pair" data-low={row.low ? "true" : undefined}>
  <input type="checkbox" checked={selected}
         aria-label={t("review.selection", { name: op.subtitleName })}
         onChange={() => onToggle(op.id)} />
  <span className="review-ledger__video" title={row.videoName}>
    {row.showVideoName ? row.videoName : <span className="visually-hidden">{row.videoName}</span>}
  </span>
  <span className="review-ledger__join" aria-hidden="true" />
  <div className="review-ledger__subtitle">
    <div className="review-ledger__from">
      {op.language !== null && <span className="review-ledger__lang">{op.language.toUpperCase()}</span>}
      <span className="review-ledger__name" title={op.subtitleName}>{op.subtitleName}</span>
    </div>
    <div className="review-ledger__to" title={op.targetPath}>
      <span aria-hidden="true">→ </span>
      <span className="visually-hidden">{t("review.targetLabel")} </span>
      {baseName(op.targetPath)}
    </div>
    {/* reasoning: see below */}
  </div>
  {row.low ? (
    <span className="review-ledger__confidence">
      <span className="review-ledger__meter" aria-hidden="true">
        {/* METER_SEGMENTS <i> elements; the first meterSegments(op.confidence) carry data-on="true" */}
      </span>
      <span className="review-ledger__figure">{t("review.confidence", { value: op.confidence })}</span>
    </span>
  ) : <span />}
</li>
```

Reasoning, only when `op.reasoning.length > 0`: for a low row `<ul className="review-ledger__why">` with one `<li>` per string (always visible); otherwise `<details className="review-ledger__reasoning"><summary>{t("review.reasoningToggle")}</summary><ul>…</ul></details>`.

Unmatched rows have no checkbox:

```tsx
<li className="review-ledger__row" data-kind="unmatched-video">
  <span /><span className="review-ledger__video" title={name}>{name}</span>
  <span className="review-ledger__join" aria-hidden="true" />
  <span className="review-ledger__slot" role="img" aria-label={t("review.noSubtitle")} /><span />
</li>
<li className="review-ledger__row" data-kind="unmatched-subtitle">
  <span /><span className="review-ledger__slot" role="img" aria-label={t("review.noVideo")} />
  <span className="review-ledger__join" aria-hidden="true" />
  <div className="review-ledger__subtitle"><span className="review-ledger__name" title={name}>{name}</span></div><span />
</li>
```

### D3: `ReviewStep.css`

Replace the file. Declarations the layout test asserts are marked †.

```css
.review-step { display: flex; flex: 1 1 0; flex-direction: column; gap: var(--space-3); min-height: 0; }  /* † min-height; no overflow: hidden, so a too-small window scrolls the panel instead of clipping */
.review-step__toolbar { display: flex; flex-shrink: 0; gap: var(--space-4); align-items: baseline; justify-content: space-between; }
.review-step__filter { padding: 0 0 var(--space-1); font-size: var(--text-sm); color: var(--ink-3); cursor: pointer; background: none; border: none; border-bottom: 2px solid transparent; }
.review-step__filter[aria-pressed="true"] { font-weight: 600; color: var(--ink); border-bottom-color: var(--accent); }
.review-step__filter[data-filter="needsReview"] .review-step__filter-count { color: var(--accent-ink); }
.review-ledger { flex: 1 1 0; min-height: 0; margin: 0; padding: 0; overflow-y: auto; list-style: none; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--hair); }  /* † overflow-y, min-height */
.review-ledger__row { display: grid; grid-template-columns: 1.25rem minmax(0, 0.8fr) 1.75rem minmax(0, 1.25fr) 5.5rem; gap: 0 var(--space-3); align-items: start; padding: var(--space-2) 0 var(--space-2) var(--space-2); border-bottom: 1px solid var(--hair); border-inline-start: 2px solid transparent; }
.review-ledger__row[data-low="true"] { border-inline-start-color: var(--accent); }  /* † */
.review-ledger__video, .review-ledger__name, .review-ledger__to { overflow: hidden; font-family: var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
.review-ledger__join { height: 1px; margin-top: 0.7em; background: var(--ink-3); }
.review-ledger__to { font-size: var(--text-xs); color: var(--add); }
.review-ledger__lang { padding: 0 var(--space-1); font-size: var(--text-xs); font-weight: 600; color: var(--ink-3); border: 1px solid var(--hair); border-radius: var(--radius-control); }
.review-ledger__why, .review-ledger__reasoning { font-size: var(--text-xs); color: var(--ink-2); }
.review-ledger__meter { display: inline-flex; gap: 2px; }
.review-ledger__meter i { width: 3px; height: 10px; background: var(--hair); }
.review-ledger__meter i[data-on="true"] { background: var(--accent); }
.review-ledger__confidence { display: flex; gap: var(--space-2); align-items: center; justify-content: flex-end; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--accent-ink); }
.review-ledger__slot { height: 1.25rem; border: 1px dashed var(--ink-3); border-radius: var(--radius-control); }
.review-ledger__section { padding: var(--space-3) 0 var(--space-1) var(--space-2); font-size: var(--text-xs); font-weight: 600; color: var(--ink-3); text-transform: uppercase; }
```

Language chips become square (`border: 1px solid var(--ink); border-radius: var(--radius-control)`); an unchecked chip uses `border-color: var(--hair); color: var(--ink-3)`.

### D4: `WizardShell` status note

```ts
export interface WizardNavAction {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  /** Short status rendered directly before the control. Honoured on `next` only. */
  note?: { /** Visible figure, e.g. "12 / 14". */ text: string; /** Accessible wording. */ label: string };
}
```

In the inline-end cluster, between `secondary` and `next`:

```tsx
{next?.note && (
  <span className="wizard__note" role="status">
    <span className="wizard__note-text serif" aria-hidden="true">{next.note.text}</span>
    <span className="visually-hidden">{next.note.label}</span>
  </span>
)}
```

`WizardShell.css`: `.wizard__note { font-size: var(--text-xl); color: var(--ink); }`. The existing `.wizard__actions` / `.wizard__actions-end` rules and their layout assertions are untouched. A `note` on `back` or `secondary` is ignored.

*Alternative considered:* a fourth `status` slot on `WizardShell`. Rejected: `app-shell` specifies exactly three slots, and the count describes what the primary action will act on, so it belongs to that slot.

`MatchWizard.tsx`, review branch only: `next.note = { text: `${wizard.selectedCount} / ${wizard.totalOperations}`, label: t("review.selectedCount", { count: wizard.selectedCount, total: wizard.totalOperations }) }`.

### D5: Locale keys (both `en` and `zh-TW`; values are exact)

Add to `match.json` under `review`:

| Key | en | zh-TW |
|---|---|---|
| `ledgerLabel` | Matches | 配對結果 |
| `filterLabel` | Show | 顯示範圍 |
| `filters.all` | All | 全部 |
| `filters.needsReview` | Needs review | 需確認 |
| `filters.unmatched` | Unmatched | 未配對 |
| `filterEmpty` | Nothing to show for this filter. | 這個篩選條件下沒有項目。 |
| `noSubtitle` | No matching subtitle | 沒有配對的字幕 |
| `noVideo` | No matching video | 沒有配對的影片 |

Delete from `match.json`: `review.description`, `review.unmatchedVideos`, `review.unmatchedSubtitles`.

Keep: `review.title`, `review.confidence`, `review.targetLabel`, `review.reasoningToggle`, `review.selection`, `review.selectedCount`, every `review.language*` key, `review.empty`, `review.back`, `review.execute`.

If `fontCoverage.test.ts` reports a zh-TW character the bundled serif lacks, reword with covered characters and record it in `visual-review.md`; never weaken the test.

### D6: `hardCodedStrings.test.tsx`

Extend `REVIEW_PLAN` with one operation with `language: null` (so the existing per-language counts asserted in zh-TW do not change) whose confidence is below 80 and has reasoning (use digits-only reasoning text such as `"1"` so the fixture stays prose-free), plus one unmatched video and one unmatched subtitle (numeric names). Add to `ALLOWED`: `/^[A-Z]{2,3}$/` with the comment that language tags are the detector's short codes upper-cased — data, not prose. The existing zh-TW assertions on the language bar stay.

### D7: Preview view

Add `match-review` to `scripts/preview/views.tsx`: `ReviewStep` inside a `WizardShell` (match step labels, active step 2, `next` with a note) over a plan of 14 operations across 12 videos — two videos with a second EN pairing, one pairing at confidence 52 with two reasoning lines, one at 94 with reasoning — plus two unmatched videos and one unmatched subtitle. Selection is local state in the view so checkboxes, chips, and the note respond.

### D8: Human review document

`openspec/changes/redesign-match-review/visual-review.md` records what a test cannot judge.

## Risks / Trade-offs

- [A filter hides a selected row and the user executes more than they see] → the count beside the primary button always shows the whole selection; "Filtering does not change selection" is a tested scenario; filters reset to "all" whenever the step remounts.
- [`showVideoName` wrong after filtering] → `filterLedger` recomputes it and is unit-tested for a filtered second pairing.
- [Renaming or dropping an existing scenario would strand the Rust `@covers` lines] → the MODIFIED block keeps both existing scenario names; only wording that the Rust tests do not assert changes.
- [`role="status"` re-announces on every checkbox toggle] → it is `polite` by default and the text is short; accepted.
- [`/^[A-Z]{2,3}$/` in the allowlist could mask a real upper-case abbreviation] → three letters at most, commented, and the only such text any screen renders.
