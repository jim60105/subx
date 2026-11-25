# Design

## Context

See proposal.md (Why) for motivation. These facts in the current code (master at 0850b03) shape the approach:

- `WizardShell` (`src/components/WizardShell/WizardShell.tsx`) renders `secondary` buttons keyed by index inside `.wizard__actions-end`, followed by the `next` primary button. It has no focus management and exposes no refs.
- `SyncWizard` (`src/features/sync/SyncWizard.tsx`), detect step: in the detecting state it sets `secondary = { label: t("detect.cancel"), onClick: wizard.cancelDetection }` and `next = { label: t("detect.detecting"), disabled: true }`, and `back` is undefined. Start detection is either `next` (auto default), the only `secondary` (manual default), or the second `secondary` after a review (`[skip, start]`).
  - Starting from `next` disables the focused button, which drops focus.
  - Starting from `secondary[1]` removes the focused button (the slot shrinks to `[cancel]`), which also drops focus.
- `useSyncWizard` (`src/features/sync/useSyncWizard.ts`) keeps the last cancel promise in `pendingCancelRef`. `runDetection` awaits it before calling `detectSyncOffset`, and `cancelDetection` and `restart` both assign `pendingCancelRef.current = cancelQuietly()` and bump `detectionGenRef`. Nothing runs on unmount, so leaving the screen keeps the backend task alive. The backend then refuses the next detection with `sync.detection_in_progress` until the old run ends.
- While a detection runs, the only way out of the detect step is unmounting the whole wizard: `App.tsx` renders `<SyncScreen />` only while `screen === "sync"`, and the header's Home/Settings controls change `screen`. Back is hidden while detecting, success moves to the offset step (no run left), and `restart` already cancels. So "leaving" in this change means unmounting.
- `src/main.tsx` wraps the app in `React.StrictMode`, so mount effects run mount → cleanup → mount in development.
- Nudge buttons (`src/features/sync/OffsetField.tsx`) render `t("offset.nudgeDown"|"offset.nudgeUp", { step })` as text and `t("offset.decrease"|"offset.increase", { step })` as `aria-label`. Both locales have all four keys. `WizardNavAction.accessibleLabel` already documents the "must start with the visible text" convention.
- `cargo fmt --check` (from `src-tauri/`) lists `src/audio_fallback.rs:43` first, followed by many other files. The request scopes the formatting fix to `audio_fallback.rs` only.

## Goals / Non-Goals

**Goals:**

- The exact contracts below, each covered by tests that carry `// @covers` annotations.

**Non-Goals:**

- Formatting any Rust file other than `src-tauri/src/audio_fallback.rs`. Adding a `cargo fmt` gate to `npm run verify` or CI.
- Focus management on step transitions (for example, detection success moving to the offset step, or the apply step's disabled "Applying…" button). Only the detect step's entry into detecting is in scope.
- Any change to the backend `cancel_sync_detection` / `detect_sync_offset` commands, IPC bindings or epoch logic.
- Generic focus restoration inside `WizardShell` (the shell does not guess where focus should go). The behaviour is opt-in per action.
- Renaming or removing locale keys. Only the values of `offset.decrease` / `offset.increase` change.

## Decisions

### D1. Formatting: rustfmt on one file

Run `rustfmt --edition 2021 src-tauri/src/audio_fallback.rs`. The crate is `edition = "2021"` and has no rustfmt config. The file's only module is an inline `mod tests`, so rustfmt touches no other file. Expected result, replacing line 45:

```rust
static SILENCE: [u8; (SILENCE_CHUNK_FRAMES * 2) as usize] =
    [0; (SILENCE_CHUNK_FRAMES * 2) as usize];
```

Alternative rejected: `cargo fmt` over the crate. It would reformat a dozen unrelated files, which is outside the request.

### D2. `WizardNavAction.takeFocus` (opt-in, secondary only)

Contract added to `WizardNavAction` in `WizardShell.tsx`:

```ts
  /**
   * Moves keyboard focus to this control when it becomes marked (including
   * the shell's first render), if focus is on the document body or inside the
   * action bar. Honoured on `secondary` only.
   */
  takeFocus?: boolean;
```

Implementation in `WizardShell`:

```tsx
const actionsRef = useRef<HTMLDivElement>(null);
const secondaryRefs = useRef<(HTMLButtonElement | null)[]>([]);
const secondaryActions = secondaryList(secondary);
const focusIndex = secondaryActions.findIndex((action) => action.takeFocus === true);

// Keyed on the index alone, so a mark that stays never re-takes focus.
useEffect(() => {
  if (focusIndex === -1) return;
  const active = document.activeElement;
  const bar = actionsRef.current;
  if (active !== null && active !== document.body && !(bar?.contains(active) ?? false)) return;
  secondaryRefs.current[focusIndex]?.focus();
}, [focusIndex]);
```

Add `ref={actionsRef}` to `<div className="wizard__actions">`, and add `ref={(element) => { secondaryRefs.current[index] = element; }}` to each secondary `<button>`. Map over `secondaryActions` instead of calling `secondaryList(secondary)` again. Import `useEffect` and `useRef` from `react`.

Why the "body or inside the action bar" guard: browsers differ when a focused button is disabled. Some move focus to `body`, while jsdom and some engines leave `activeElement` on the disabled button. Removing a focused element sends focus to `body` everywhere. Either way the user's focus was in the bar, so moving it is safe. Focus in the content panel, such as the sensitivity slider, is never taken.

Alternatives rejected:
- Focusing the elapsed-time status (`role="status"`, with `tabIndex={-1}`) in `SyncDetectStep`. The status unmounts on failure or cancel, so focus would be dropped again, and a focused live region that updates every second is noisy.
- Generic "if a focused bar button is disabled, move focus" logic in the shell. It would silently change the Match, Convert and Translate wizards (non-goal).

### D3. Sync detecting state marks Cancel

In `SyncWizard.tsx`, detecting branch:

```ts
secondary = { label: t("detect.cancel"), onClick: wizard.cancelDetection, takeFocus: true };
```

Nothing else in the action-bar mapping changes, so the "A running operation keeps the primary slot occupied" placement rule still holds. Once the user cancels, the same index-0 DOM button becomes Skip and keeps focus. Failure shows Retry as `next` and Skip at index 0, and focus stays on the index-0 button.

### D4. Cancel on unmount, module-scoped pending cancel

In `useSyncWizard.ts`:

1. Replace `const pendingCancelRef = useRef<Promise<void>>(Promise.resolve());` with module-scope state next to `cancelQuietly`:

   ```ts
   /**
    * The most recent cancel request, shared by every wizard instance: a run
    * started from a freshly mounted wizard must still wait for the cancel the
    * previous one sent on its way out.
    */
   let pendingCancel: Promise<void> = Promise.resolve();

   /** Test isolation only: forgets a cancel left pending by an earlier test. */
   export function resetPendingCancelForTests(): void {
     pendingCancel = Promise.resolve();
   }
   ```

2. Replace every `pendingCancelRef.current` with `pendingCancel`: the `await` in `runDetection`, and the assignments in `cancelDetection` and `restart`. Remove the old ref and its comment, and keep the ordering comment on the module variable.

3. Add, after the defaults effect:

   ```ts
   // Leaving the screen mid-run abandons the detection exactly as Cancel does;
   // the late result is dropped by the generation bump. Nothing is set in
   // React state: the component is going away. A run still waiting on the
   // previous cancel also counts as running; its extra cancel is harmless.
   useEffect(
     () => () => {
       if (!detectingRef.current) return;
       pendingCancel = cancelQuietly();
       detectionGenRef.current += 1;
       detectingRef.current = false;
     },
     [],
   );
   ```

   Under StrictMode the first simulated cleanup runs with `detectingRef.current === false`, so it sends nothing.

Alternative rejected: keeping the per-instance ref and cancelling on unmount without sharing. A remounted wizard would start a run before the old cancel lands, and the backend abort could hit the new run. That breaks the existing ordering guarantee.

`resetPendingCancelForTests` follows the existing precedent `resetPreviewQueueForTests` in `usePreviewSession.ts`. Call it in the top-level `beforeEach` of `useSyncWizard.test.ts`, `SyncWizard.test.tsx` and `src/features/actionPlacement.test.tsx`.

### D5. Nudge accessible names begin with the visible text

Only the values of the two existing keys change. The visible `nudgeDown` / `nudgeUp` keys stay exactly as they are (the minus is U+2212 `−`).

| File | Key | New value |
|---|---|---|
| `src/locales/en/sync.json` | `offset.decrease` | `−{{step}} ms, decrease offset` |
| `src/locales/en/sync.json` | `offset.increase` | `+{{step}} ms, increase offset` |
| `src/locales/zh-TW/sync.json` | `offset.decrease` | `−{{step}} 毫秒，減少偏移量` |
| `src/locales/zh-TW/sync.json` | `offset.increase` | `+{{step}} 毫秒，增加偏移量` |

Each `decrease` value must begin with the same characters as the matching `nudgeDown` value, and each `increase` value with `nudgeUp`. `OffsetField.tsx` needs no change.

The new test asserts only this mechanism: the accessible name starts with the rendered text, for every language in `SUPPORTED_LANGUAGES`. It never pins the wording.

### Human review: nudge accessible-name wording

This section is the human-reviewed document for this change. A reviewer listens to the four strings in D5 with a screen reader (Orca on Linux) in each locale and records the verdict here or in the merge discussion. The check: the name reads naturally, it states the direction of the change, and the zh-TW text uses full-width punctuation. No automated test covers wording. If the reviewer asks for new wording, edit the locale values and keep the name-begins-with-visible-text rule, which the test enforces.

## Risks / Trade-offs

- [Module-scoped `pendingCancel` leaks between tests] → `resetPendingCancelForTests()` in every `beforeEach` that renders the wizard, following the preview-queue precedent.
- [`takeFocus` on a mouse click moves focus to Cancel, which can show a focus ring] → `:focus-visible` heuristics usually suppress the ring after pointer interaction. This is accepted.
- [Pressing Enter twice quickly, or holding Enter long enough for key auto-repeat, now cancels the run it just started] → Accepted. This follows from putting focus on the only actionable control. Cancel is non-destructive, because the offset is kept (see "Offset reset rules"). No debounce is added.
- [The new unmount cleanup sends a cancel when RTL's auto-cleanup unmounts a test that ended mid-detection, and that call can be counted in the next test] → Tests that count `cancelSyncDetection` calls clear that mock immediately before the action under test (task 4.3).
- [Wider `cargo fmt --check` drift stays] → Recorded in the proposal as observed and out of scope. It needs a separate request.
