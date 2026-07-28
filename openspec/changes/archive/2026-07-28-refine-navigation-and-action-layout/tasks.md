## 1. Localization groundwork

- [x] 1.1 Add `actions.home` to `src/locales/en/common.json` ("Back to home") and `src/locales/zh-TW/common.json`（「回到首頁」）; leave `actions.back` in place — the wizards' back slot still uses it
- [x] 1.2 Add the three in-progress primary labels from design D3 to both locales: `match.analysis.running`, `convert.run.converting`, `translate.run.translating`. Sync's detect step keeps `detect.continue` — do not add a `detect.detecting` key
- [x] 1.3 Run `npx vitest run src/i18n/localeParity.test.ts` to confirm `en` / `zh-TW` parity before any component work

## 2. WizardShell action bar

- [x] 2.1 Add the `secondary?: WizardNavAction` prop to `WizardShellProps` and document the three slots' fixed positions in the component doc comment
- [x] 2.2 Render `.wizard__actions` unconditionally (drop the `(back || next)` guard), with `back` in the start position and a `.wizard__actions-end` cluster holding `secondary` then `next`
- [x] 2.3 Add `--control-height` (36px, the header's existing literal) and `--control-height-lg` (the wizard button's box height) to `src/styles/tokens.css`, and replace the repeated 36px literals in `AppHeader.css`
- [x] 2.4 Update `WizardShell.css` per design D1: `justify-content: space-between`, `min-height: var(--control-height-lg)` on the bar so its height is constant across steps, `margin-inline-start: auto` on the end cluster; add a `.wizard__button--secondary` variant if the neutral `.wizard__button` styling is not already right
- [x] 2.5 Extend `src/components/WizardShell/WizardShell.test.tsx`: a lone `back` renders at the start with the primary position empty; the bar renders for a step declaring no actions at all; `secondary` renders before `next`. Annotate with `@covers app-shell/reusable-wizardshell-layout#action-bar-persists-across-steps` and `…#a-lone-back-action-stays-at-the-inline-start`
- [x] 2.6 Add the scroll scenario coverage for `…#scrolling-the-step-body-does-not-move-the-primary-action` — assert the action bar is a sibling of `.wizard__content` (the scroll container) rather than a descendant, since jsdom cannot scroll

## 3. Header brand as the home affordance

- [x] 3.1 Rename `AppHeader`'s `onBack` prop to `onNavigateHome` and update `src/App.tsx`'s call site
- [x] 3.2 Render the brand block as a `<button class="app-header__brand app-header__brand--link">` with `aria-label`/`title` from `common:actions.home` when `onNavigateHome` is defined, and as the current plain-text container when it is not
- [x] 3.3 Delete the `.app-header__back` button and its CSS; keep the brand's 36px control height and existing gradient text styling
- [x] 3.4 Update `src/components/AppHeader/AppHeader.test.tsx`: the brand is a button only on feature screens, clicking it calls `onNavigateHome`, no button named /Back/ remains in the header
- [x] 3.5 Update `src/App.test.tsx` to navigate home via the brand, and add coverage for returning home from a mid-wizard step and from Settings. Annotate `@covers app-shell/navigation-between-home-and-feature-screens#enter-and-leave-a-feature`, `…#brand-returns-home-from-a-mid-flow-wizard-step`, `…#brand-returns-home-from-settings`, `…#brand-is-inert-on-the-hub`
- [x] 3.6 Add coverage for `app-shell/appheader-floating-chrome-and-control-layout#dragging-the-brand-does-not-move-the-window` — assert the brand button carries no `data-tauri-drag-region` attribute

## 4. Home hub 2 × 2 grid

- [x] 4.1 Set `.home__grid` to `grid-template-columns: repeat(2, minmax(0, 1fr))` with a `@media (width <= 40rem)` single-column fallback (design D6)
- [x] 4.2 Add `height: 100%` to `.task-card` so cards in a row share a height
- [x] 4.3 Add a stylesheet assertion test (following the `tokens.colorLiteral.test.ts` file-reading pattern) covering `app-shell/desktop-application-launches-with-the-home-task-entry-hub#task-cards-form-a-two-by-two-grid` and `…#narrow-window-collapses-to-one-column`

## 5. Match wizard actions

- [x] 5.1 Move every Match action into the `MatchWizard.tsx` slot derivation exactly as tabulated in design D2, including the `analysis` running/failed states and the `execute` idle/running/stale-plan/other-error/report states
- [x] 5.2 Strip the action props and `*__actions` markup from `AnalysisStep.tsx` and `ExecuteStep.tsx`, leaving stage list, error notice, and outcome report intact
- [x] 5.3 Delete `.analysis-step__actions`, `.analysis-step__button*`, `.execute-step__actions`, `.execute-step__button*` from the matching CSS files
- [x] 5.4 Update `src/features/match/MatchWizard.test.tsx` so the moved controls are queried inside `.wizard__actions`; keep every existing `@covers` annotation attached to the same assertions

## 6. Convert wizard actions

- [x] 6.1 Move the `run` step's start / cancel / finish actions into `ConvertWizard.tsx` per design D2, using `run.converting` for the disabled in-progress primary. Keep the error split: only `convert.stale_plan` offers `run.report.finish`; a generic convert failure offers no forward control, exactly as today
- [x] 6.2 Strip the action props and `*__actions` markup from `ConvertRunStep.tsx`, keeping the progress text and the per-item report
- [x] 6.3 Delete `.convert-run__actions` and `.convert-run__button*` from `ConvertRunStep.css`
- [x] 6.4 Update `src/features/convert/ConvertWizard.test.tsx` for the new locations, preserving its `@covers` annotations

## 7. Sync wizard actions

- [x] 7.1 Move the `detect` retry and the `apply` start / confirm-overwrite / finish actions into `SyncWizard.tsx` per design D2. Keep `detect.continue` as the primary label through all three detect phases, and keep the step's single compound `disabled` formula — do not re-derive it per phase, or manual mode loses its Continue
- [x] 7.2 Preserve both apply-error controls: `apply.start` stays available whenever `applyResult === null` (retry to an edited output path), and `apply.confirmOverwrite` appears in `next` only when `canConfirmOverwrite`, pushing `apply.start` to `secondary`
- [x] 7.3 Drop the duplicate `detect.cancel` button (design D5.1 — `detect.back` already calls `backToMethod`) and remove the now-unused `detect.cancel` key from **both** locale files
- [x] 7.4 Strip the action props and `*__actions` markup from `SyncDetectStep.tsx` and `SyncApplyStep.tsx`, keeping the output-path field, detection facts, error notice, and report
- [x] 7.5 Delete `.sync-detect__button*` and `.sync-apply__actions` / `.sync-apply__button*` from the matching CSS files
- [x] 7.6 Update `src/features/sync/SyncWizard.test.tsx` for the new locations, preserving its `@covers` annotations, and add the missing case the current suite lacks: a non-`output_exists` apply failure still offers `apply.start` as the retry

## 8. Translate wizard actions

- [x] 8.1 Move the `translate` step's start / cancel / retry / restart / open-settings actions and the `report` step's finish action into `TranslateWizard.tsx` per design D2, preserving the `ai_not_configured` and `stale_plan` branches
- [x] 8.2 Strip the action props and `*__actions` markup from `TranslateRunStep.tsx` and `TranslateReportStep.tsx`
- [x] 8.3 Delete `.translate-run__actions` / `.translate-run__button*` and `.translate-report__button*` from the matching CSS files
- [x] 8.4 Update `src/features/translate/TranslateWizard.test.tsx` for the new locations, preserving its `@covers` annotations

## 9. Cross-wizard placement guarantee

- [x] 9.1 Add a test that drives each of the four wizards into its terminal, running, and error states and asserts (a) the expected forward control is found inside `.wizard__actions`, and (b) `.wizard__content` contains no `<button>` other than the in-panel selection/browse/remove controls each step legitimately owns — assert the concrete allowed set per step rather than a semantic "forward motion" predicate. Annotate `@covers app-shell/uniform-primary-action-placement-across-feature-screens#forward-actions-share-one-position-in-every-wizard`
- [x] 9.2 Add coverage for `@covers app-shell/uniform-primary-action-placement-across-feature-screens#a-running-operation-keeps-the-primary-slot-occupied` — while a batch runs the `next` control is present and disabled, and the cancel control sits in `secondary` for the three wizards that offer one (sync's detect step has none; `detect.back` is its cancel)

## 10. Settings alignment

- [x] 10.1 Set `.settings__actions` to `justify-content: flex-end` and reorder `SettingsScreen.tsx` so the dirty-state hint precedes the save button, leaving the save button inline-end-most
- [x] 10.2 Add coverage for `@covers app-shell/uniform-primary-action-placement-across-feature-screens#settings-commits-from-the-same-side` following the stylesheet-assertion pattern from 4.3

## 11. Sync specs and verify

- [x] 11.1 Sync `openspec/changes/refine-navigation-and-action-layout/specs/app-shell/spec.md` into `openspec/specs/app-shell/spec.md`
- [x] 11.2 Run `npm run spec:trace -- --report` and confirm every new scenario resolves to a `@covers` annotation with no orphans
- [x] 11.3 Run `npm run verify` and close any coverage gap with tests rather than exclusions
- [x] 11.4 Verify the running app with the `agent-browser` skill: walk all four wizards end to end and confirm the primary button never moves, the home grid is 2 × 2, and the brand returns to the hub from a mid-wizard step
- [x] 11.5 Archive with `openspec archive refine-navigation-and-action-layout --skip-specs`
