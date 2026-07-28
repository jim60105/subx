## Why

The four task cards on the home hub reflow into a 3 + 1 arrangement on a typical
window width, leaving one orphaned card and an unbalanced hub. Inside the
wizards the situation is worse: the "continue" affordance is not one control in
one place. Steps 1–2 put it in the shell footer, but every terminal step
(`ExecuteStep`, `ConvertRunStep`, `SyncApplyStep`, `TranslateRunStep`,
`TranslateReportStep`) and every recovery state (`AnalysisStep`,
`SyncDetectStep`) render their own primary button *inside the scrolling panel
body*. The user therefore has to re-locate the forward action on nearly every
step, and its position additionally depends on how far the panel is scrolled.
Finally, the header brand — the most obvious "home" target in any app — is inert
text, while the actual escape hatch is a button mislabelled `common.actions.back`
("上一步" / "Back"), which reads as *step*-back although it abandons the whole
feature.

## What Changes

**Home hub layout**
- The task grid becomes a fixed 2 × 2 arrangement at normal window widths,
  collapsing to a single column only on genuinely narrow windows.
- Cards in a row share one height so the grid reads as a balanced block.

**One fixed primary-action position across every wizard**
- `WizardShell` renders a **persistent action bar** below the content panel. It
  is always present (even when a step exposes no actions) and never scrolls with
  the panel body, so the forward action never changes position between steps.
- The bar has three named slots with fixed positions: `back` at the inline
  start; `secondary` then `next` in the inline-end cluster, with `next` — the
  primary, forward action — always the last (bottom-right) control.
- Every forward action currently rendered inside a step body moves into the
  `next` slot: 開始執行 / 開始轉換 / 開始翻譯 / 套用位移 / 確認覆寫 / 完成 / 重試.
  While a batch runs, `next` stays in place as a disabled progress label
  ("轉換中…") and 取消 occupies `secondary`, so the primary position never
  changes meaning.
- Escape-hatch actions that are not forward motion (開啟設定 from an
  `ai_not_configured` error) occupy `secondary`.
- Step components become presentational: they render state, not navigation.
- The `back` slot stays anchored at the inline start even when it is the only
  action (today a lone back button slides to the right edge).

**Header brand as the home affordance**
- The `SubX` / `AI 字幕工具` brand block becomes a single interactive control
  that returns to the home hub from any screen, including mid-wizard and from
  Settings.
- On the home screen itself the brand is rendered as non-interactive text.
- The separate, mislabelled header back button is removed — it duplicated the
  brand's destination while implying step-level navigation. `common.actions.back`
  remains in the locale files because the wizards' own back slot uses it.

**Consistency pass**
- The Settings screen's save row is aligned to the inline end, matching the
  wizard bar's primary-right convention.

## Capabilities

### New Capabilities

None. All three changes live inside the existing application shell.

### Modified Capabilities

- `app-shell`: the home hub gains an explicit 2 × 2 grid requirement; the
  `WizardShell` requirement gains the persistent, fixed-position action bar
  contract and the rule that features route *all* forward actions through it;
  the navigation requirement moves the home affordance onto the header brand and
  the `AppHeader` layout requirement drops the separate back button.

## Impact

**Frontend**
- `src/components/WizardShell/WizardShell.tsx` + `.css` — new `secondary` slot,
  always-rendered bar, start/end clustering.
- `src/components/AppHeader/AppHeader.tsx` + `.css` — brand becomes a button;
  back button removed; `onBack` prop renamed to `onNavigateHome`.
- `src/App.tsx` — wires the renamed prop.
- `src/features/home/HomeScreen.css`, `src/components/TaskCard/TaskCard.css` —
  2 × 2 grid, equal-height cards.
- `src/features/{match,convert,sync,translate}/*Wizard.tsx` — own the footer
  actions for every step, including terminal and error states.
- `src/features/match/{AnalysisStep,ExecuteStep}.tsx`,
  `src/features/convert/ConvertRunStep.tsx`,
  `src/features/sync/{SyncDetectStep,SyncApplyStep}.tsx`,
  `src/features/translate/{TranslateRunStep,TranslateReportStep}.tsx` — action
  props and in-body buttons removed; the matching `.css` action rules go with
  them.
- `src/features/settings/SettingsScreen.css` — action row alignment.
- `src/styles/tokens.css` — `--control-height` / `--control-height-lg` so the
  action bar can reserve its height without a literal.
- `src/locales/{en,zh-TW}/` — `common.actions.home` for the brand's accessible
  label; three in-progress primary labels (`match.analysis.running`,
  `convert.run.converting`, `translate.run.translating`); `sync.detect.cancel`
  removed as unused (design D5.1). `common.actions.back` stays — the wizards'
  own back slot uses it.

**Tests**
- `src/App.test.tsx`, `src/components/AppHeader/AppHeader.test.tsx`,
  `src/components/WizardShell/WizardShell.test.tsx`, and the four
  `*Wizard.test.tsx` suites query the moved controls; their `@covers`
  annotations follow the requirements they cover.

**Not affected**
- No Rust, IPC, DTO, or `bindings.ts` change; no workflow capability's
  behavioural requirements change — only where their controls are drawn.
