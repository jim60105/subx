# Tasks

Scenario IDs below are the `// @covers` values, derived by `scripts/check-spec-coverage.mjs` `slugify` (`<capability>/<requirement-slug>#<scenario-slug>`). Put each annotation on the line directly above its `it(`, as existing tests do.

## 1. Rust formatting (design D1)

- [x] 1.1 From the repository root, run `cargo fmt --manifest-path src-tauri/Cargo.toml`. Make no manual edits and add no rustfmt config. Verify:
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check` exits 0.
  - `git diff --stat` lists only `.rs` files under `src-tauri/`; the 11 files named in design Context are expected.
- [x] 1.2 Run `cargo test --manifest-path src-tauri/Cargo.toml` and verify it passes. Then commit the formatting on its own, with nothing else in the commit, for example `style(tauri): apply rustfmt to the src-tauri crate`.

## 2. WizardShell `takeFocus` (design D2, spec app-shell)

- [x] 2.1 In `src/components/WizardShell/WizardShell.tsx`, add the `takeFocus?: boolean` field with the exact doc comment from design D2 to `WizardNavAction`. Add the `actionsRef` / `secondaryRefs` / `focusIndex` / `useEffect` logic verbatim from D2, `ref={actionsRef}` on `.wizard__actions`, and the callback ref on each secondary button. Render secondary buttons from `secondaryActions`. Do not change classes, order or attributes of any button. Verify: `npx tsc --noEmit` passes and the existing `npx vitest run src/components/WizardShell` tests still pass unchanged. (The effect also runs on the first render, which the spec allows. No current caller mounts the shell with a marked action.)
- [x] 2.2 In `src/components/WizardShell/WizardShell.test.tsx`, add a `describe("secondary takeFocus")` block. Drive re-renders with `rerender` from `renderWithI18n(...)`, and focus elements with `element.focus()` inside `act`. Add four tests, each annotated:
  - `// @covers app-shell/secondary-action-can-take-keyboard-focus#focus-moves-from-a-control-that-became-disabled`: render `secondary={{label:"Skip"}}` and `next={{label:"Start", onClick}}`, then focus Start. Re-render with `secondary={{label:"Cancel", takeFocus:true}}` and `next={{label:"Working", disabled:true}}`. Expect `document.activeElement` to be the Cancel button.
  - `// @covers app-shell/secondary-action-can-take-keyboard-focus#focus-moves-when-the-focused-control-is-removed`: render `secondary={[{label:"Skip"},{label:"Start"}]}`, then focus Start. Re-render with `secondary={{label:"Cancel", takeFocus:true}}`. Expect focus on Cancel.
  - `// @covers app-shell/secondary-action-can-take-keyboard-focus#focus-outside-the-action-bar-is-not-taken`: put an `<input aria-label="Field" />` in the children and focus it. Re-render with a `takeFocus` secondary. Expect focus still on the input.
  - `// @covers app-shell/secondary-action-can-take-keyboard-focus#a-mark-that-stays-does-not-take-focus-again`: render `back={{label:"Back"}}` with a `takeFocus` secondary. Focus Back. Re-render with the same props but a new `secondary` label. Expect focus still on Back.

  Verify: `npx vitest run src/components/WizardShell` passes.

## 3. Sync detecting state moves focus to Cancel (design D3, spec sync-workflow)

- [x] 3.1 In `src/features/sync/SyncWizard.tsx`, change only the detecting-branch `secondary` assignment to the line in design D3. Verify: the existing `npx vitest run src/features/sync/SyncWizard.test.tsx src/features/actionPlacement.test.tsx` passes with no assertion edits.
- [x] 3.2 In `src/features/sync/SyncWizard.test.tsx`, add two tests. Each uses a `deferred` detection, so the run stays pending, and resolves it with `act` at the end:
  - `// @covers sync-workflow/starting-detection-keeps-keyboard-focus#start-from-the-primary-position`: `reachDetect(user)`, then `primary().focus()` inside `act`, then `await user.keyboard("{Enter}")`. Expect `document.activeElement` toBe `within(actionBar()).getByRole("button", { name: "Cancel" })`.
  - `// @covers sync-workflow/starting-detection-keeps-keyboard-focus#start-from-a-secondary-position`: `reachOffset(user)` with the default mock. Click Back. Then set `detectSyncOffset` to return a deferred, focus the `Start detection` secondary button, and press Enter. Expect focus on Cancel.

  Verify: `npx vitest run src/features/sync/SyncWizard.test.tsx` passes.

## 4. Cancel on unmount with module-scoped pending cancel (design D4, spec sync-workflow)

- [x] 4.1 In `src/features/sync/useSyncWizard.ts`, apply design D4 steps 1–3 verbatim: module-level `pendingCancel` and exported `resetPendingCancelForTests`, every `pendingCancelRef.current` replaced by `pendingCancel`, and the unmount effect. Verify: `grep -n pendingCancelRef src/features/sync/useSyncWizard.ts` prints nothing, and `npx tsc --noEmit` passes.
- [x] 4.2 Import `resetPendingCancelForTests` from `./useSyncWizard` (or `./sync/useSyncWizard` in `actionPlacement.test.tsx`) and call it in the top-level `beforeEach` of `src/features/sync/useSyncWizard.test.ts`, `src/features/sync/SyncWizard.test.tsx` and `src/features/actionPlacement.test.tsx`. Verify: those three files pass with `npx vitest run`.
- [x] 4.3 In `src/features/sync/useSyncWizard.test.ts`, add a `describe("leaving the wizard")` block with three tests:
  - In all three tests, call `vi.mocked(api.cancelSyncDetection).mockClear()` right before `unmount()`. RTL's auto-cleanup of an earlier test that ended mid-detection now sends a cancel that would otherwise be counted here.
  - `// @covers sync-workflow/leaving-the-wizard-cancels-a-running-detection#navigating-away-mid-detection-cancels-the-run`: use `onDetectStep()` with `detectSyncOffset` returning a deferred, then `startDetection`. Wait for `detectSyncOffset` to be called once, then `unmount()`. Expect `api.cancelSyncDetection` toHaveBeenCalledTimes(1). Resolving the deferred afterwards must not throw or log a React state warning.
  - `// @covers sync-workflow/leaving-the-wizard-cancels-a-running-detection#a-new-wizard-waits-for-the-previous-cancel`: as above, but `cancelSyncDetection` uses `mockReturnValueOnce(cancel.promise)` before `unmount()`. Mount a second `onDetectStep()` and `startDetection`, then `await act(async () => {})`. Expect `detectSyncOffset` toHaveBeenCalledTimes(1). Then `await act(async () => cancel.resolve())`, wait for `detectSyncOffset` toHaveBeenCalledTimes(2) and for the second hook's `step` to be `"offset"`.
  - `// @covers sync-workflow/leaving-the-wizard-cancels-a-running-detection#unmounting-while-idle-sends-nothing`: `onDetectStep()`, then `unmount()`. Expect `api.cancelSyncDetection` not toHaveBeenCalled.

  Verify: `npx vitest run src/features/sync/useSyncWizard.test.ts` passes.

## 5. Nudge accessible names (design D5, spec sync-workflow)

- [ ] 5.1 Set the four locale values exactly as in the design D5 table, in `src/locales/en/sync.json` and `src/locales/zh-TW/sync.json`. Do not touch `nudgeDown` / `nudgeUp` or any other key. Verify: `npx vitest run src/i18n` passes (locale parity and hard-coded string checks).
- [ ] 5.2 Update the name queries that pinned the old wording: `src/features/sync/OffsetField.test.tsx` lines 28–29 and 61–62, and `src/features/sync/SyncWizard.test.tsx` line 485 (`"Increase by 50 ms"`). Replace them with queries built from the visible text, for example `screen.getByRole("button", { name: /^\+50 ms/ })` and `{ name: /^−50 ms/ }`. Leave the `toHaveTextContent` checks as they are. Verify: both files pass.
- [ ] 5.3 In `src/features/sync/OffsetField.test.tsx`, add `// @covers sync-workflow/nudge-controls-accessible-names-begin-with-their-visible-text#names-begin-with-the-visible-text-in-each-locale`. Use `it.each(SUPPORTED_LANGUAGES)` (from `../../i18n/languages`): `await setupI18n(language)`, render `<StatefulOffsetField />`, take the two buttons inside `.offset-field__nudge`, and for each expect `button.getAttribute("aria-label")!.startsWith(button.textContent!)` toBe(true), with `textContent` non-empty. Do not assert any literal wording. Verify: `npx vitest run src/features/sync/OffsetField.test.tsx` passes. Temporarily reverting one locale value to the old wording makes this test fail; restore the value afterwards.

## 6. Integration

- [ ] 6.1 Run `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, then `npm run verify`. Expected: both exit 0. That covers tsc, vitest with coverage at or above the 85% floor, Rust coverage, `spec:trace`, bindings unchanged and icons. `git status --short` shows only the files named in tasks 1–5.

## Workflow follow-up

- The human review in design.md ("Human review: nudge accessible-name wording") is done by a person before archive. It is not a tracked task.
- Archive the change after review. `spec:trace` then checks the new scenarios against their `@covers` annotations.
