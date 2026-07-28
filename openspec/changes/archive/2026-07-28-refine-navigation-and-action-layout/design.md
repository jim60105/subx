## Context

The shell already has the right bones: `App.tsx` swaps screens by `ScreenId`,
`AppHeader` owns the chrome, and `WizardShell` owns the step indicator, the
scrolling content panel, and a `back` / `next` footer. What went wrong is that
`WizardShell`'s footer was treated as optional. It renders only when a feature
declares `back` or `next`, so the four wizards fell into a habit: the steps that
merely *advance* use the footer, while every step that *does the work* —
`ExecuteStep`, `ConvertRunStep`, `SyncApplyStep`, `TranslateRunStep`,
`TranslateReportStep` — grew its own `*__actions` row inside the content panel,
each with its own button CSS. `AnalysisStep` and `SyncDetectStep` did the same
for their cancel/retry states.

The consequences compound:

- The forward action changes position between steps, and inside the terminal
  steps it also moves as the panel scrolls (`.wizard__content` is the scroll
  container).
- Five near-duplicate button styles exist (`.execute-step__button`,
  `.convert-run__button`, `.sync-apply__button`, `.translate-run__button`,
  `.translate-report__button`) that all restate `.wizard__button`.
- `.wizard__actions` uses `justify-content: flex-end`, so a step declaring only
  `back` renders it at the right edge, exactly where `next` sits elsewhere.
- The header's escape hatch is a button labelled `common.actions.back`
  ("上一步" / "Back") that actually abandons the feature, while the brand — the
  conventional home target — is inert.

Constraints from `CLAUDE.md` that shape the solution: no router (screens are
React state), every style value must be a `var(--token)`, all user-facing text
through `useTranslation()` with `en` + `zh-TW` parity, 85% coverage floor, and
each spec scenario needs a `@covers` annotation.

## Goals / Non-Goals

**Goals:**

- One screen position — the bottom-right of a bar that never scrolls and never
  disappears — holds the forward action on every step of every wizard.
- Step components become purely presentational; navigation lives in the wizard
  container next to the state that governs it.
- A 2 × 2 home grid that stays 2 × 2 at realistic window sizes.
- The header brand is the single, correctly-labelled way home.
- Delete the five duplicated button styles rather than restyling them.

**Non-Goals:**

- No behavioural change to any workflow: which actions exist, when they are
  enabled, and what they call stay exactly as today. Only *where they are drawn*
  changes. (Two deliberate exceptions are called out in D5.)
- No router, no navigation history, no deep links.
- No Rust, IPC, DTO, or `bindings.ts` change.
- No confirmation prompt when leaving a wizard mid-run (see Risks).
- The Settings screen keeps its section-scoped save button; only its alignment
  changes.

## Decisions

### D1 — `WizardShell` gains a third slot and always renders the bar

```ts
interface WizardShellProps {
  steps: WizardStep[];
  activeStep: number;
  children: ReactNode;
  back?: WizardNavAction;      // inline-start cluster
  secondary?: WizardNavAction; // inline-end cluster, before next
  next?: WizardNavAction;      // inline-end cluster, last — the primary
}
```

`WizardNavAction.onClick` becomes optional so an in-progress placeholder can be
declared as `{ label, disabled: true }` without a noop handler — a disabled
progress label genuinely has no action, and four wizards would otherwise repeat
`onClick: () => {}` for D3's occupied-but-inert primary slot.

The bar is rendered unconditionally. Layout is `display: flex; justify-content:
space-between` with a start cluster and an end cluster, plus a `min-height` tied
to the button height so an all-empty bar still reserves its space:

```css
.wizard__actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  /* Keeps the bar's height constant across steps, including empty ones. */
  min-height: var(--control-height-lg);
}
.wizard__actions-end {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  margin-inline-start: auto;
}
```

`--control-height-lg` is a new token in `tokens.css` set to the wizard button's
own box height, so the reserved space and the button can never drift apart. The
header's existing 36px controls get `--control-height` at the same time, which
removes the literal that is repeated across `AppHeader.css` today.

`margin-inline-start: auto` on the end cluster is what pins `next` to the
inline end even when `back` is absent, and pins `back` to the inline start even
when it is the only control — the current `flex-end` bug.

*Alternatives considered.* (a) Keep two slots and let features pass an array of
actions — rejected: an array has no fixed positions, which is the whole point.
(b) Render the bar conditionally but reserve height with a spacer — rejected as
strictly more code than always rendering it. (c) `position: sticky` on the
existing in-panel action rows — rejected: it keeps five duplicate styles alive
and still lets the position differ per step.

### D2 — The wizard container owns the actions; steps go presentational

Each `*Wizard.tsx` already holds the hook state that decides enablement, so the
`back` / `secondary` / `next` derivation moves there and becomes a single
`switch` over `(step, phase)`. Step components lose their action props
(`onExecute`, `onConvert`, `onApply`, `onTranslate`, `onRestart`, `onRetry`,
`onCancel`, `onOpenSettings`, `onConfirmOverwrite`) and their `*__actions` /
`*__button` CSS blocks.

Step components keep the props they need to *render state* — `isExecuting`,
`progress`, `report`, `executeError` — because the panel still shows progress
text, the error notice, and the outcome list.

`ErrorNotice` keeps rendering the message; only the recovery *buttons* move out.

**Complete slot map** (derived from today's code, behaviour-preserving unless
marked):

*Match — `sources → analysis → review → execute`*

| State | back | secondary | next (primary) |
| --- | --- | --- | --- |
| sources | — | — | `sources.analyze`, disabled `!canAnalyze` |
| analysis, running | — | `analysis.cancel` | `analysis.running` *(new key)*, disabled |
| analysis, failed, `ai_not_configured` | — | `analysis.openSettings` | `analysis.retry` |
| analysis, failed, other | — | — | `analysis.retry` |
| review | `review.back` | — | `review.execute`, disabled when `selectedCount === 0` |
| execute, idle | `execute.back` | — | `execute.run`, disabled when `selectedCount === 0` |
| execute, running | `execute.back`, disabled | — | `execute.running`, disabled |
| execute, error, `stale_plan` | `execute.back` | — | `execute.report.finish` → `restart` |
| execute, error, other | `execute.back` | — | — |
| execute, report | `execute.back`, disabled | — | `execute.report.finish` → `restart` |

*Convert — `sources → options → run`*

| State | back | secondary | next (primary) |
| --- | --- | --- | --- |
| sources | — | — | `sources.continue`, disabled `!canPreview` |
| options | `options.back` | — | `options.continue`, disabled when `selectedCount === 0 \|\| isPreviewing` |
| run, idle | — | — | `run.start`, disabled when `selectedCount === 0` |
| run, converting | — | `run.cancel` | `run.converting` *(new key)*, disabled |
| run, error, `stale_plan` | — | — | `run.report.finish` → `restart` |
| run, error, other | — | — | — |
| run, report | — | — | `run.report.finish` → `restart` |

Convert's error split mirrors Match's: `ConvertRunStep.tsx` gates its finish
button on `isStalePlan(convertError)`, so a generic convert failure offers no
forward control today and must not gain one here.

*Sync — `inputs → method → detect → apply`*

| State | back | secondary | next (primary) |
| --- | --- | --- | --- |
| inputs | — | — | `inputs.continue`, disabled when `subtitlePath === null` |
| method | `method.back` | — | `method.continue`, disabled `!canDetect \|\| offsetExceedsMax` |
| detect, detecting | `detect.back` | — | `detect.continue`, disabled |
| detect, failed | `detect.back` | — | `detect.retry` |
| detect, reviewable | `detect.back` | — | `detect.continue`, existing disabled rule |
| apply, idle | `apply.back` | — | `apply.start` |
| apply, applying | `apply.back`, disabled | — | `apply.applying`, disabled |
| apply, error, overwrite refused | `apply.back` | `apply.start` | `apply.confirmOverwrite` |
| apply, error, other | `apply.back` | — | `apply.start` |
| apply, result | — | — | `apply.report.finish` → `restart` |

Two sync-specific traps the tables must not paper over:

- **The three `detect` rows share one disabled formula**, not three separate
  rules. `SyncWizard.tsx` computes `isDetecting || offsetExceedsMax || (method
  === "auto" && detection === null)` for the whole step; the rows above name
  *phases*, they do not license a per-phase re-derivation. In particular
  "reviewable" must not be implemented as `detection !== null`: in manual mode
  `detection` is always `null` and Continue must still be enabled. The label
  also stays `detect.continue` throughout — unlike the other three wizards,
  sync's detect step already owns the footer today, so changing its text while
  detecting would be a behaviour change, not a relocation. The elapsed-time
  readout in the panel already says the detection is running.
- **`SyncApplyStep` renders `apply.start` for every state where `applyResult ===
  null`**, including a failed apply — the output-path field stays editable, so
  re-saving to a corrected path is the recovery. `apply.confirmOverwrite` is an
  *additional* button that appears only when `canConfirmOverwrite`, i.e. only
  for `sync.output_exists`. Both must survive: confirm-overwrite is the decisive
  forward move and takes `next`; retrying the current path takes `secondary`.

*Translate — `sources → options → translate → report`*

| State | back | secondary | next (primary) |
| --- | --- | --- | --- |
| sources | — | — | `sources.continue`, disabled `!canPreview` |
| options | `options.back` | — | `options.continue`, disabled when `selectedCount === 0 \|\| isPreviewing` |
| translate, idle | — | — | `run.start`, disabled when `selectedCount === 0` |
| translate, running | — | `run.cancel` | `run.translating` *(new key)*, disabled |
| translate, error, `ai_not_configured` | — | `run.openSettings` | `run.retry` |
| translate, error, `stale_plan` | — | — | `run.restart` → `restart` |
| translate, error, other | — | — | `run.retry` |
| report | — | — | `report.finish` → `restart` |

### D3 — The primary slot is never emptied by a running batch

While work is in flight the `next` control stays where it is, disabled, showing
the feature's in-progress label; 取消 goes to `secondary`, immediately to its
left. The alternative — moving 取消 into the primary slot — would keep the
*position* constant but make the same pixel mean "go forward" one second and
"abandon" the next, which is worse than the problem being fixed.

Existing in-progress labels are reused where they exist (`execute.running`,
`apply.applying`); sync's detect step keeps `detect.continue` (see D2). Three
new keys are needed, for the three steps that have no footer control today and
therefore no label to reuse:

| Namespace | Key | en | zh-TW |
| --- | --- | --- | --- |
| `match` | `analysis.running` | Analyzing… | 分析中… |
| `convert` | `run.converting` | Converting… | 轉換中… |
| `translate` | `run.translating` | Translating… | 翻譯中… |

Detailed progress (`run.progress`, `run.elapsed`, `detect.running`) stays inside
the panel where there is room for it; the button label is the short form.

### D4 — Header brand becomes the home affordance; the back button goes

`AppHeader`'s `onBack` prop is renamed `onNavigateHome`. When it is defined the
brand renders as `<button class="app-header__brand app-header__brand--link">`
carrying `aria-label={t("actions.home")}` and `title`; when undefined (the home
hub) it renders as the current `<div>` of plain text. The separate
`.app-header__back` button and its CSS are deleted.

Keeping both would leave two controls with one destination, one of them
mislabelled "上一步" — which collides with the wizards' own `back` slot, now the
only thing that should read as "back one step". `common.actions.back` stays in
the locale files precisely because the wizards still use it;
`common.actions.home` is added.

The brand button must not swallow window dragging. The evidence that it will not
is not the double-click handler (that governs toggle-maximize, not the native
single-press drag): it is that `data-tauri-drag-region` sits only on the
`<header>` element, and the settings button, the language and theme selects, and
the three window controls are already interactive `<button>`s nested inside that
same header, all clicking normally today. One more nested button changes
nothing. The existing double-click guard — which ignores events whose target is
not the drag region — additionally keeps a double-click on the brand from
toggling maximize.

*Alternative considered.* Keep the back button and merely relabel it "回到首頁".
Rejected: the user asked for the brand to be the home target, and two controls
for one destination is the clutter the layout review is meant to remove.

### D5 — Two deliberate behaviour simplifications

Both are dead weight the slot map exposes, and both are noted here rather than
smuggled in:

1. **Sync detect**: today the running state offers `detect.cancel` *and* the
   footer offers `detect.back`; both call `backToMethod`. The duplicate
   `detect.cancel` button is dropped — `back` already is the cancel.
2. **Match analysis**: today `AnalysisStep` renders `analysis.cancel` and
   `analysis.retry` in the panel with no footer at all. They move to
   `secondary` / `next`; the wizard gains no new capability.

`detect.cancel` and `analysis.cancel` keys stay in the locale files only if
still referenced; `detect.cancel` becomes unused and is removed from both
locales together (`localeParity.test.ts` requires the pair to match).

### D6 — Home grid

```css
.home__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

@media (width <= 40rem) {
  .home__grid { grid-template-columns: minmax(0, 1fr); }
}
```

`minmax(0, 1fr)` rather than `1fr` so a long description cannot push a column
past its share. Equal card heights come from `.task-card { height: 100% }`
(grid items already stretch, but `.task-card` is a `<button>`, whose default
`align-items` behaviour differs across engines).

40rem is the breakpoint because two 280px cards plus a `--space-4` gap plus the
`--space-6` main padding on both sides need ≈ 640px; below that, two columns
would squeeze the cards below their intended minimum. `@media (width <= 30rem)`
is already used in `SettingsScreen.css`, so range syntax is established here.

*Testability.* jsdom does not apply stylesheets, so the grid scenarios are
verified the way `tokens.colorLiteral.test.ts` already verifies CSS: by reading
`HomeScreen.css` and asserting the declarations. The rendered-DOM side (four
cards, correct order) stays covered by `HomeScreen.test.tsx`.

### D7 — Settings alignment only

`.settings__actions` gains `justify-content: flex-end` with the dirty-state hint
moved before the button so the save button is the inline-end-most element. The
button is *not* lifted into a screen-level bar: it commits the AI section only,
and a screen-level bar would imply it also saves the GUI preferences below,
which write through immediately. This is the one place where consistency of
position loses to clarity of scope, and it loses only the pinning, not the side.

## Risks / Trade-offs

- **Leaving a wizard mid-run abandons a running backend batch without warning.**
  → Pre-existing (today's back button does the same) and unchanged here; the
  brand simply makes the exit more discoverable. Explicitly out of scope, and
  worth a follow-up change that either cancels on unmount or confirms.

- **Removing the labelled "← Back" button makes the way home less obvious.**
  → The brand carries a pointer cursor, a hover state, a `title`, and an
  `aria-label`; it is the standard desktop/web convention. The wizards' own
  `back` slot still handles step-level retreat, which is the more frequent need.

- **A big, mechanical refactor across nine step components can silently drop an
  edge case** (the `stale_plan` branches, the overwrite confirmation, the
  disabled rules). → The slot map in D2 is the checklist; every row maps to an
  existing test or gets one, and the four `*Wizard.test.tsx` suites already
  exercise these branches end to end.

- **Tests query buttons by accessible name and will break.** → Expected and
  intended; that breakage is the signal that a control moved. Where a test's
  assertion is about *placement*, it should scope the query to the action bar
  (`within(container.querySelector(".wizard__actions"))`) so a future regression
  back into the panel fails.

- **A very long primary label ("Replace the existing file") widens the bar.** →
  The bar is a flex row on a full-width panel; the label is already used today
  at the same size. No wrapping rule is added.

- **The `ai_not_configured` recovery loses its visual emphasis.** Today
  `AnalysisStep` and `TranslateRunStep` style 開啟設定 as the primary and the
  retry as the plain button — the emphasis points at the actual fix. Under D1
  the primary *style* follows the primary *position*, and 開啟設定 is an escape
  hatch rather than forward motion, so it moves to `secondary` and the retry
  becomes the accented control. → Accepted rather than fixed with a
  `secondary--emphasized` variant: two competing accent buttons would undo the
  single-primary rule this whole change rests on, and the error notice already
  carries the instruction ("請開啟設定選擇 AI 服務供應商並填入金鑰"). Worth
  revisiting if telemetry ever shows users hammering 重試 in this state.

- **New i18n keys must land in both locales.** → `localeParity.test.ts` and
  `hardCodedStrings.test.tsx` fail the build otherwise; that is the gate.

- **`back` does not mean the same thing in every wizard.** Match's
  `review.back` and Convert's / Translate's `options.back` call `restart()` —
  they return to step 1, not to the immediately preceding step — because the
  backend holds one plan at a time and re-entering has to re-preview. Sync's
  back actions really do step back one screen. Left as is: the destination is
  still *backwards*, which is what the label promises, and reconciling the two
  families would mean either caching plans in the frontend or renaming controls,
  neither of which belongs in a change about position. Worth revisiting if the
  backend ever holds more than one plan.

## Migration Plan

Not applicable — pre-release, single-binary desktop app, no persisted state
touched (theme stays in `localStorage`, AI config stays in `config.toml`).
Rollback is a revert of the change's commits.

## Open Questions

None blocking. One deferred: whether leaving a wizard mid-run should cancel the
backend task or ask for confirmation — deliberately left to a follow-up so this
change stays a layout change.
