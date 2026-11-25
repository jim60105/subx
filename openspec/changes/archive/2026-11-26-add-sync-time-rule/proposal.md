# Proposal

## Why

The offset step still shows the schematic `OffsetPreview`, whose bars are unrelated to the real subtitle, and stacks its controls so that they compete with the player for height. The owner chose layout C: player, time rule of real cues, transport, one row of offset controls.

## What Changes

- A time rule scrolls the real cues past a fixed needle: hollow bars at the original times, solid bars at the shifted times. It replaces `OffsetPreview`, which is removed.
- The offset controls become one row: figure, −50 / +50 ms, millisecond field, and the detected offset and confidence; warnings follow.
- The figure moves in the direction of the change.
- Final layout, motion and look are **human-reviewed** in `visual-review.md` and not enforced by a test.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync-workflow`: renames and modifies the offset figure requirement; adds the time rule requirement.

## Impact

- `src/features/sync/`: new `TimeRule.tsx/.css`; `cueTiming.ts`, `SyncPlayer.tsx`, `OffsetField.*`, `SyncOffsetStep.*`; deletes `OffsetPreview.tsx/.css`.
- Both `sync.json` locales, `layout.test.ts`, `scripts/preview/views.tsx`, `README.md`, `CHANGELOG.md`.

## Batch:

depends-on: add-sync-preview-player
Conflict notes: edits the files `add-sync-preview-player` creates; no overlap with `package-sync-preview-media` except `CHANGELOG.md`.
