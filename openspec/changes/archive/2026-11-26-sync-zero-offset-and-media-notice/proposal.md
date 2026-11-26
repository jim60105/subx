# Proposal

## Batch:

single change — no `depends-on`. It is the only open change; it touches the sync wizard's offset and detect steps only.

## Why

On the sync wizard's offset step (step 3), Continue is enabled while the offset is 0 ms, so the user can go on and save a `_synced` copy that is identical in timing to the original. Skipping detection lands exactly there. Separately, the detect step's "add a video or audio file to enable detection" notice (`detect.needsMedia`) is styled as ordinary secondary text (`--ink-2`), so the one sentence explaining why detection is unavailable reads like body copy.

## What Changes

- The offset step disables Continue while the offset under review is exactly 0 ms, whatever produced it: skipping (which always enters at 0), a detection that reported 0, editing, nudging, or clearing the millisecond field (the field reports an empty value as 0).
- While Continue is disabled for this reason, the step shows a visible polite status (`role="status"`) under the offset row explaining why, and the millisecond input's accessible description includes that status. Two reasons exist: a generic one, and one used when the held detection itself reported 0 ms, which says detection found no offset.
- A detected offset of exactly 0 is held and shown like any other detection: the offset step opens with 0 in the field, the detected offset (`0.000 seconds`), the confidence and any analysis warnings; keeping, going back and the reset rules are unchanged. Only Continue is blocked until the user changes the offset.
- Nothing else about the offset step changes. The limit check, its `role="alert"` error, the analysis warnings, the detection facts, the preview, Back, Skip and Keep stay as they are. A zero offset is always within the limit, so the two reasons never apply at once.
- The `detect.needsMedia` notice on the detect step and the new zero-offset reason both use the project's existing caution styling: text in `--accent-ink` and a 2 px inline-start rule in `--accent`. The text colour follows existing precedent. The accent rule is new for a notice (the app already uses an `--accent` rule on the preview subtitle slip), and this styling choice is flagged for the user to confirm. No colour token is added or changed. `tokens.css` has no token named "warning". `--del` is the failure/alert token (`ErrorNotice`, the over-limit error). `--accent-ink` is the token the app already uses for non-failure cautions: the overwrite flags in convert and translate, and translate's resend notice. Contrast in both themes is already enforced by `tokens.contrast.test.ts`: `--accent-ink` is a text token held to 4.5:1 against `--paper` and `--paper-2`, and `--accent` is the marker held to 3:1 against `--paper`.
- These similar notices stay unchanged on purpose: `inputs.subtitleOnly` on the files step (it confirms an accepted choice while media can still be added), the per-run sensitivity note, every `ErrorNotice` (including detection warnings, the defaults error and the cue error, because changing the shared component would restyle every workflow), and the over-limit error (a blocking validation error, correctly `--del`).

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `sync-workflow`: adds a requirement that a zero offset blocks Continue on the offset step, with a perceivable reason and a separate rule for a detected zero, and a requirement that the missing-media notice and the zero-offset reason use the caution tokens. It also rewords two existing scenarios that said Continue becomes or stays available, so they allow for the zero rule: "Detected offset beyond the maximum can be reduced" and "Subtitle failure keeps playback".

## Impact

- Frontend only: `src/features/sync/useSyncWizard.ts`, `SyncWizard.tsx`, `SyncOffsetStep.tsx`, `OffsetField.tsx`, `OffsetField.css`, `SyncDetectStep.css`, `src/locales/{en,zh-TW}/sync.json`, plus tests (`SyncWizard.test.tsx`, `OffsetField.test.tsx`, `useSyncWizard.test.ts`, `src/styles/layout.test.ts`, `src/i18n/hardCodedStrings.test.tsx`, `SyncDetectStep.test.tsx`, and the `SyncOffsetView` call sites in `TimeRule.test.tsx` and `SyncPlayer.test.tsx`), and the preview harness `scripts/preview/views.tsx` (`SyncOffsetHarness` and the `SyncOffsetStep` registry entry).
- No backend, IPC, configuration or token change. `apply_sync_offset` still accepts 0; the guard is the wizard's.
- Human-reviewed, not tested: the wording of the two new reasons in English and Traditional Chinese, and how both caution notices look in the light and dark themes. Both go in this change's `review.md`, named in design.md.
