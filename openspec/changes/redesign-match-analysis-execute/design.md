# Design: redesign-match-analysis-execute

## Context

Source of truth: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("02 Analysis", "04 Execute"). Mockup (read-only, git-ignored): second and fourth panels of `.superpowers/brainstorm/3955151-1794685630/content/match-flow-v2.html`, including its `runLoom()` and `runExec()` drivers, which define the intended pacing. The design document wins where they differ.

Data limits the designs are built around (no backend or IPC change is allowed):

- `MatchProgress` is `{ stage: "scanning" | "analyzing" | "finalizing" }`. There is no per-file progress, and `analyzing` may resolve from the crate's cache without any AI request. The illustration therefore must not look like a progress report.
- `executeSelected(planId, operationIds)` resolves once with `ExecutionReportDto { outcomes: { subtitleName, targetPath, applied, error }[], successCount, failureCount }`. Outcomes carry no operation id. The backend (`execute_selected_impl` in `src-tauri/src/commands/match.rs`) filters the plan's operations by index, so outcomes arrive in **ascending operation-id order**, regardless of the order of the ids passed.
- `SourceScanResult` is `{ videoCount, subtitleCount }`.

State this change starts from (after `redesign-match-review`):

- `AnalysisStep({ stage, error })` renders a title, a description, and an `<ol>` of three stage labels with `data-state`. `ExecuteStep({ mode, selectedCount, report, executeError })` renders a summary sentence and, after the report, a list of name + status word.
- `MatchWizard.tsx` owns the action bar: on the execute step `next` is "Apply now" → "Applying…" (disabled) → "Finish". That stays.
- `DiffLine` (`src/components/DiffPreview/DiffPreview.tsx`) renders one removed / created / kept line with tense-neutral accessible text. `baseName` is in `src/platform/fileKind.ts`.
- `global.css` already neutralises animation and transition *durations* under `prefers-reduced-motion: reduce`, but not delays.
- `src/test/matchMedia.ts` stubs `matchMedia` for the colour-scheme query only.
- `tokens.reference.test.ts` requires every `var(--x)` to be declared in `tokens.css` or in the referencing stylesheet; `flatness.test.ts` forbids shadows, blur, and painted gradients.

## Goals / Non-Goals

**Goals:**

- Animations driven by CSS wherever possible, with at most one timer (the analysis cycle), so reduced motion and unit tests have little to control.
- A static equivalent for each animated screen that is a defined state, not an accident of a media query.

**Non-Goals:**

- Any progress percentage, per-file status during analysis, or per-row progress during execution.
- Counting numerals up one by one in the execute step: the figures show the report's totals as soon as it arrives (the design document's "count successes and failures" is read as "show the counts").
- A cancel action for execution, or any change to the action-bar labels and flow.
- Changes to the sources or review steps, to convert / translate / sync / settings, or under `src-tauri/`.

## Decisions

### D1: Motion tokens and the global reduced-motion rule

Add to `:root` in `src/styles/tokens.css`: `--motion-stagger: 130ms;` and `--motion-loom-tick: 190ms;`.

`global.css` reduced-motion block becomes:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0s !important;
  }
}
```

### D2: `src/theme/usePrefersReducedMotion.ts`

```ts
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** True while the OS asks for reduced motion; follows live changes. False when `matchMedia` is unavailable. */
export function usePrefersReducedMotion(): boolean;
```

Implemented with `useSyncExternalStore` (or `useState` + `useEffect`) over `window.matchMedia(REDUCED_MOTION_QUERY)` and its `change` event.

`src/test/matchMedia.ts` is extended, not replaced: keep `installMatchMedia` and `setPrefersDark`; add a second flag and `export function setPrefersReducedMotion(value: boolean): void`. `matches` becomes `query.includes("reduced-motion") ? prefersReducedMotion : query.includes("dark") ? prefersDark : false`; listeners are kept per query so a colour-scheme listener is not called for a motion change. `installMatchMedia` resets both flags. `src/theme/usePrefersReducedMotion.test.tsx` covers initial false, initial true, and a live change.

### D3: Analysis step

`AnalysisStepProps` becomes `{ stage: MatchStage | null; error: unknown; scan: SourceScanResult | null }`; `MatchWizard.tsx` passes `scan={wizard.scan}`.

Markup when not failed:

```tsx
<div className="analysis-step">
  <h2 className="visually-hidden">{t("analysis.title")}</h2>
  <ol className="analysis-step__stages">
    {STAGES.map((entry, index) => (
      <li key={entry} className="analysis-step__stage serif" data-state={state}
          aria-current={state === "active" ? "step" : undefined}>
        {t(`analysis.stages.${entry}`)}
      </li>
    ))}
  </ol>
  {scan !== null && (
    <p className="analysis-step__totals">
      <span>{scan.videoCount} {t("sources.scan.videoLabel", { count: scan.videoCount })}</span>
      <span>{scan.subtitleCount} {t("sources.scan.subtitleLabel", { count: scan.subtitleCount })}</span>
    </p>
  )}
  <AnalysisIllustration stage={stage} />
</div>
```

The failed branch is unchanged (`ErrorNotice`, no illustration, no totals). `data-state` values stay `done | active | upcoming` so the existing "Stages are reflected" test keeps its assertions. `AnalysisStep.css`: stage words `font-size: var(--text-xl); color: var(--ink-3)`; active `color: var(--ink); border-bottom: 2px solid var(--accent)`; done `color: var(--ink-2)`.

`src/features/match/AnalysisIllustration.tsx`:

```ts
export const VIDEO_BARS = 6;
export const SUBTITLE_BARS = 8;
/** [videoIndex, subtitleIndex] of the pairs the illustration settles. Fixed; unrelated to real data. */
export const PAIRS: readonly (readonly [number, number])[] = [[0, 1], [1, 0], [2, 3], [3, 2], [4, 5], [5, 6]];
/** Trial curves drawn before each pair settles. */
export const TRIALS_PER_PAIR = 3;
/** Milliseconds after which the pairing sequence replays while the stage is `analyzing`. */
export const LOOM_CYCLE_MS = 7200;

export function AnalysisIllustration({ stage }: { stage: MatchStage | null }): JSX.Element;
```

Geometry (from the mockup): `viewBox="0 0 600 330"`; video bar `i` is a `150 × 18` rect at `x = 60, y = 40 + 44 i` with two rows of nine `8 × 3` paper-coloured holes (`x = 66 + 16 k`, `y + 3` and `y + 12`); subtitle bar `j` is two rects at `x = 370`, widths `[150, 120, 165, 135, 150, 110, 160, 125][j]` and 60 % of that, heights 5, at `y = 26 + 36 j` and `y + 8`; the curve from video `i` to subtitle `j` is `M210 ${vy+9} C 280 ${vy+9}, 300 ${sy+6}, 370 ${sy+6}`. Trial targets for pair `n`, trial `k`: `j = (PAIRS[n][1] + 1 + ((n * 3 + k * 5) % (SUBTITLE_BARS - 1))) % SUBTITLE_BARS`.

Rendering rules:

- Root: `<svg className="analysis-loom" aria-hidden="true" focusable="false" data-motion={reduced ? "static" : "animated"} data-stage={reduced ? undefined : stage ?? "scanning"}>`. It contains no `<text>` and no `<title>`.
- Bars: `<g className="analysis-loom__video">` × `VIDEO_BARS` and `<g className="analysis-loom__subtitle">` × `SUBTITLE_BARS`, always rendered. Animated mode fades each in with a CSS animation whose inline `animationDelay` is `calc(var(--motion-stagger) * <index>)`.
- Curves group, animated mode only, rendered when `stage` is `analyzing` or `finalizing`:
  - `analyzing`: `<g className="analysis-loom__curves" key={cycle} data-cycle={cycle}>`; for pair `n`, `TRIALS_PER_PAIR` `<path className="analysis-loom__trial">` with `animationDelay: calc(var(--motion-loom-tick) * <n * 4 + k>)` and one `<path className="analysis-loom__settled">` with delay tick `n * 4 + 3`. `cycle` is state incremented by one `setInterval(…, LOOM_CYCLE_MS)` that exists only while `stage === "analyzing"` and motion is allowed; the effect clears it on stage change and unmount. Re-keying the group restarts the CSS animations.
  - `finalizing`: one `<path className="analysis-loom__settled" data-final="true">` per pair, no trials, no interval; subtitle bars whose index is in no pair get `data-orphan="true"`.
- Static mode (reduced motion): bars only; no curves group, no `data-stage`, no interval, no `data-orphan`. The markup is therefore byte-identical for every `stage`.

`AnalysisIllustration.css`: bars `fill: var(--ink)`; holes `fill: var(--paper)`; `.analysis-loom[data-motion="animated"] .analysis-loom__video, … __subtitle { animation: loom-in var(--motion-base) var(--ease-out) both; }`; `__trial { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 4 4; opacity: 0; animation: loom-trial 420ms var(--ease-out) both; }`; `__settled { fill: none; stroke: var(--ink); stroke-width: 1; animation: loom-settle var(--motion-base) var(--ease-out) both; }`; `__settled[data-final="true"] { animation: none; }`; `[data-orphan="true"] { opacity: 0.28; transition: opacity var(--motion-base) var(--ease-out); }`. Keyframes `loom-in` (opacity 0 → 1), `loom-trial` (0 → 1 at 25 % → 0), `loom-settle` (0 → 1). The SVG fills the remaining height (`flex: 1; min-height: 0; width: 100%`).

*Alternative considered:* driving every curve with `setTimeout`, as the mockup's script does. Rejected: dozens of timers to cancel and fake in tests, and reduced motion would need a second code path instead of simply not starting one interval.

### D4: Execute step

`src/features/match/executeRows.ts` (pure):

```ts
export interface ExecuteRow {
  key: string;
  oldName: string;
  newName: string;
  /** `null` until the report arrives. */
  outcome: ExecutionOutcomeDto | null;
}
/**
 * Rows for the selected operations in plan order (`plan.videos` then `matches`).
 * With a report: outcomes arrive in ascending operation-id order, so the outcome of id `x`
 * is `report.outcomes[sortedSelectedIds.indexOf(x)]`. If `report.outcomes.length` differs from the
 * number of selected ids, the rows are built from `report.outcomes` alone, in report order
 * (`oldName = subtitleName`, `newName = baseName(targetPath)`), so no outcome is ever hidden.
 */
export function buildExecuteRows(
  plan: MatchPlanDto, selectedIds: ReadonlySet<number>, report: ExecutionReportDto | null,
): ExecuteRow[];
```

`oldName` is `operation.subtitleName`; `newName` is `baseName(operation.targetPath)`.

`ExecuteStepProps` becomes `{ plan: MatchPlanDto; selectedIds: Set<number>; mode: RelocationModeDto; isExecuting: boolean; report: ExecutionReportDto | null; executeError: unknown }`. `MatchWizard.tsx` renders it when `wizard.step === "execute" && wizard.plan !== null`. In `useMatchWizard.execute`, send `[...selectedIds].sort((a, b) => a - b)`.

Markup (`phase` is `report !== null ? "done" : isExecuting ? "running" : "idle"`; row `status` is `outcome === null ? "pending" : outcome.applied ? "ok" : "failed"`):

```tsx
<div className="execute-step" data-phase={phase}>
  <h2 className="visually-hidden">{t("execute.title")}</h2>
  <div className="execute-step__figures" role="status">
    {report === null ? (
      <p className="execute-step__tally">
        <span className="execute-step__figure serif">{rows.length}</span>{" "}
        {t("execute.summaryLabel", { count: rows.length, mode: t(`execute.modes.${mode}`) })}
      </p>
    ) : (
      <>
        <p className="execute-step__tally" data-result="success">
          <span className="execute-step__figure serif">{report.successCount}</span>{" "}
          {t("execute.report.succeededLabel", { count: report.successCount })}
        </p>
        <p className="execute-step__tally" data-result="failure">
          <span className="execute-step__figure serif">{report.failureCount}</span>{" "}
          {t("execute.report.failedLabel", { count: report.failureCount })}
        </p>
      </>
    )}
  </div>
  <div className="execute-step__sweep"
       {...(phase === "running"
         ? { role: "progressbar", "aria-label": t("execute.running") }
         : { "aria-hidden": true })} />
  {executeError !== undefined && <div className="execute-step__error"><ErrorNotice error={executeError} role="status" /></div>}
  <ol className="execute-step__rows" aria-label={t("execute.listLabel")}>
    {rows.map((row, index) => (
      <li key={row.key} className="execute-step__row" data-status={status}
          style={{ "--row": index } as CSSProperties}>
        <span className="execute-step__mark" aria-hidden="true">{status === "ok" ? "✓" : status === "failed" ? "✕" : "·"}</span>
        {status === "ok"
          ? <DiffLine kind="removed" text={row.oldName} />
          : <span className="execute-step__name">{row.oldName}</span>}
        <span className="execute-step__arrow" aria-hidden="true">→</span>
        {status === "ok"
          ? <DiffLine kind="created" text={row.newName} />
          : <span className="execute-step__name" data-role="new">{row.newName}</span>}
        {status !== "pending" && (
          <span className="visually-hidden">{t(status === "ok" ? "execute.report.succeeded" : "execute.report.failed")}</span>
        )}
        {row.outcome?.error != null && (
          <div className="execute-step__row-error"><ErrorNotice error={row.outcome.error} role="status" /></div>
        )}
      </li>
    ))}
  </ol>
</div>
```

The progress bar has no `aria-valuenow`: it is indeterminate. `ExecuteStep.css`:

```css
.execute-step { display: flex; flex: 1 1 0; flex-direction: column; gap: var(--space-3); min-height: 0; overflow: hidden; }
.execute-step__figure { font-size: var(--text-3xl); line-height: 1; }
.execute-step__tally[data-result="failure"] .execute-step__figure { color: var(--del); }
.execute-step__sweep { position: relative; flex-shrink: 0; height: 2px; overflow: hidden; background: var(--hair); }
.execute-step__sweep::after { position: absolute; inset: 0; width: 30%; content: ""; background: var(--accent); transform: translateX(-100%); }
.execute-step[data-phase="running"] .execute-step__sweep::after { animation: execute-sweep 1s linear infinite; }
.execute-step[data-phase="done"] .execute-step__sweep { background: var(--ink); }
.execute-step__rows { flex: 1 1 0; min-height: 0; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
.execute-step__row { --row: 0; display: grid; grid-template-columns: 1.125rem minmax(0, 1fr) 1.25rem minmax(0, 1fr); gap: var(--space-2); align-items: baseline; padding: var(--space-2) 0; font-family: var(--font-mono); font-size: var(--text-sm); border-bottom: 1px solid var(--hair); }
.execute-step[data-phase="running"] .execute-step__row { animation: execute-breathe 1.2s ease-in-out infinite; }
.execute-step__row[data-status="ok"], .execute-step__row[data-status="failed"] { animation: execute-reveal var(--motion-base) var(--ease-out) both; animation-delay: calc(var(--motion-stagger) * var(--row)); }
.execute-step__row[data-status="failed"] .execute-step__mark, .execute-step__row[data-status="failed"] [data-role="new"] { color: var(--del); }
.execute-step__row[data-status="ok"] .execute-step__mark { color: var(--add); }
.execute-step__row-error { grid-column: 2 / -1; }
@keyframes execute-sweep { to { transform: translateX(340%); } }
@keyframes execute-breathe { 50% { opacity: 0.55; } }
@keyframes execute-reveal { from { opacity: 0.35; } to { opacity: 1; } }
```

`--row` is declared in the stylesheet (default `0`) and overridden inline, which satisfies `tokens.reference.test.ts`. The stagger is pure CSS: every row has its outcome in the DOM the moment the report arrives, and D1's rule removes the delay under reduced motion.

### D5: Locale keys (both `en` and `zh-TW`; values are exact)

Change values in `match.json`:

| Key | en | zh-TW |
|---|---|---|
| `analysis.stages.scanning` | Scan | 掃描 |
| `analysis.stages.analyzing` | Analyze | 分析 |
| `analysis.stages.finalizing` | Arrange | 整理 |

Add:

| Key | en | zh-TW |
|---|---|---|
| `execute.summaryLabel_one` | operation · {{mode}} | 個操作 · {{mode}} |
| `execute.summaryLabel_other` | operations · {{mode}} | 個操作 · {{mode}} |
| `execute.listLabel` | Operations | 操作清單 |
| `execute.report.succeededLabel_one` | succeeded | 成功 |
| `execute.report.succeededLabel_other` | succeeded | 成功 |
| `execute.report.failedLabel_one` | failed | 失敗 |
| `execute.report.failedLabel_other` | failed | 失敗 |

Delete: `analysis.description`, `execute.summary`, `execute.report.title`, `execute.report.summary`.

Keep: `analysis.title`, `analysis.cancel`, `analysis.running`, `analysis.retry`, `analysis.openSettings`, `execute.title`, `execute.modes.*`, `execute.run`, `execute.running`, `execute.back`, `execute.report.succeeded`, `execute.report.failed`, `execute.report.finish`.

If `fontCoverage.test.ts` reports a zh-TW character the bundled serif lacks, reword with covered characters and record it in `visual-review.md`; never weaken the test.

### D6: `hardCodedStrings.test.tsx`

`AnalysisStep` fixture gains `scan={{ videoCount: 1, subtitleCount: 1 }}`. `ExecuteStep` is rendered twice: idle (a plan, one selected id, `report={null}`) and done (the existing report fixture). No `ALLOWED` change is expected: marks and arrows contain no letters, and fixture names are key-shaped.

### D7: Preview views

Add to `scripts/preview/views.tsx`:

- `match-analysis`: `AnalysisStep` in a `WizardShell` (active step 1) with `scan={{ videoCount: 24, subtitleCount: 31 }}`. Without `?stage=` it walks `scanning` (2 s) → `analyzing` (16 s) → `finalizing` (3 s) and repeats; `?stage=scanning|analyzing|finalizing` pins one stage.
- `match-execute`: `ExecuteStep` in a `WizardShell` (active step 3) over nine operations, one of which fails with `core.file_already_exists`. Without `?phase=` the `next` button runs idle → running (2.5 s) → done; `?phase=idle|running|done` pins one phase.

### D8: Human review document

`openspec/changes/redesign-match-analysis-execute/visual-review.md` is the named review document for the animations' look and pacing. Verification uses `agent-browser` with a throwaway Chromium only, in both themes and with reduced motion emulated (`agent-browser set media dark reduced-motion`).

## Risks / Trade-offs

- [The illustration is mistaken for progress] → fixed shape counts, no text, no percentage, `aria-hidden`, and it loops visibly; four scenarios pin this.
- [An infinite CSS animation costs battery on a long analysis] → only opacity and stroke on about 40 SVG nodes; the interval fires once every 7.2 s; nothing runs under reduced motion.
- [Outcome-to-row mapping relies on backend ordering] → the ordering is read from `execute_selected_impl`; `buildExecuteRows` falls back to report order when lengths disagree, and both paths are unit-tested.
- [`key`-based restart leaves stale animation state in WebKitGTK] → verified in the preview with `agent-browser`, and separately in `npm run dev:app` during review.
- [Reduced-motion users see an abrupt list change] → that is the defined static equivalent: final state at once.
- [Shortened stage labels lose "with AI"] → intended: the backend's `analyzing` stage is deliberately neutral because the result may come from cache.
