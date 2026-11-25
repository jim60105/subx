# Proposal

## Why

The sync wizard asks for a method on step 2, may ask for the offset there, and detects on step 3, so offset editing happens on two pages. The approved design (`docs/superpowers/specs/2026-11-25-sync-preview-design.md`, "Flow") puts detection and its waiting state on step 2 and offset editing on step 3 only, which is where the preview will live.

## What Changes

- Steps become Files, Detect, Offset, Save.
- Step 2 asks whether to detect (Ask, Detecting, Failed). Skip enters step 3 with offset 0; a successful detection enters step 3 with the detected offset. The method radio group and step 2's offset field are removed. On a first visit without media, Skip is the only forward action and the reason is shown.
- When the user returns to step 2 after a visit to step 3, a third forward choice keeps the current offset and detection facts.
- `sync.default_method = manual` makes Skip the primary action.
- Offset editing, detection facts and warnings exist on step 3 only; a limit violation blocks Continue there.
- Changing either file resets the offset and detection. Window drops are accepted on step 1 only.
- `WizardShell`'s `secondary` slot may hold the non-primary forward choices, at most two controls.
- The waiting illustration's look is **human-reviewed** in `visual-review.md` and not enforced by a test.

The schematic `OffsetPreview` stays until `add-sync-time-rule` replaces it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-workflow`: input selection, method selection, detection and review, sensitivity slider; adds the step 2 states and offset reset requirements.
- `app-shell`: the `secondary` slot contract. The design document does not list this; the main spec forbids forward actions in `secondary`, so it must change with the flow.

## Impact

- `src/features/sync/*`, `src/components/WizardShell/WizardShell.tsx` and its test, both `sync.json` and `errors.json` locales, `actionPlacement.test.tsx`, `hardCodedStrings.test.tsx`, `layout.test.ts`, `scripts/preview/views.tsx`, `README.md`, `CHANGELOG.md`.
- No backend code, command or configuration key changes.

## Batch:

depends-on: none
Conflict notes: shares `errors.json` with `add-sync-media-server` and `add-sync-audio-fallback`; must land before `add-sync-preview-player` and `add-sync-time-rule`, which build on its step 3.
