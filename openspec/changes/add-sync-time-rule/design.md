# Design

## Context

Approved design: `docs/superpowers/specs/2026-11-25-sync-preview-design.md`, "Step 3 interface". Visual reference: layout C (`data-layout="rule"`) of `.superpowers/brainstorm/847440-1795612948/content/sync-preview-v1.html` (git-ignored).

After `add-sync-preview-player`: `SyncPlayer` owns the position; `OffsetField` renders `OffsetPreview` between the headline and the field; `SyncOffsetView` renders facts, warnings, player and field.

## Goals / Non-Goals

**Goals:** time rule, offset row, removal of `OffsetPreview`.

**Non-Goals:** dragging, waveform, cue list, new tokens, changes to `usePreviewSession`, to the media states or to the backend.

## Decisions

### D1 Window function (`cueTiming.ts`)

```ts
export const RULE_PX_PER_SECOND = 78;
export interface RuleCue { index: number; startMs: number; endMs: number; shiftedStartMs: number; shiftedEndMs: number; active: boolean; }
export function visibleCues(cues: readonly PreviewCueDto[], positionMs: number, offsetMs: number, halfWindowMs: number): RuleCue[];
```

A cue is included when `[startMs, endMs]` or its shifted interval intersects `[position - half, position + half]`. `active` uses the rule of `activeCues`.

### D2 `TimeRule`

Props `{ cues, positionMs, offsetMs }`. Root `.time-rule[aria-hidden="true"]`, height 74px, `border-block: 1px solid var(--hair)`, `overflow: hidden`, `position: relative`. Width is read with `ResizeObserver` when it exists; `halfWindowMs = max(clientWidth, 0) / 2 / 78 * 1000`, or 10000 when the width is 0 (jsdom).

Inside: `.time-rule__belt` at `left: 50%` with inline `transform: translateX(-<position px>px)`; ticks, hollow bars (`data-row="original"`, top 18px, 1px `--ink-3` border) and solid bars (`data-row="shifted"`, top 42px, `--ink`, `data-active="true"` → `--accent`) placed on the belt with inline `left` and `width` in px from 0 ms. Keys are `row-index`. A cue whose shifted length is 0 gets no shifted bar. `.time-rule__needle` is a 2px `--accent` line at 50%. Row labels reuse `offset.preview.original` / `offset.preview.shifted`. Shifted bars have `transition: left var(--motion-base) var(--ease-out)`: bars sit on the moving belt, so only an offset change triggers it. `pointer-events: none`.

`SyncPlayer` renders `TimeRule` between stage and transport when `media.status` is `video` or `audio` and `cueError === undefined` and there is at least one cue.

### D3 `OffsetField` row

`OffsetPreview` import and element, its files, its constants and the `previewShift` tests are deleted. One `.offset-field__row` (flex, wrap off): figure + unit, the two nudge buttons with visible text `−50 ms` / `+50 ms` (locale keys `offset.nudgeDown`, `offset.nudgeUp` with `{{step}}`) and the existing accessible names, the number input with its label `visually-hidden` and a visible unit text. Optional prop `children` is rendered at the inline end; `SyncOffsetView` passes the facts `dl` there. Hint, seconds echo and limit error keep their markup below the row.

Figure motion: a `key` change per value with `data-direction="up|down"` set from the previous value held in a ref; the keyframes translate 6px or −6px to 0 over `--motion-fast`. No animation on first render. The global reduced-motion rule ends it at once.

### D4 `SyncOffsetView`

Order: visually hidden `h2`, `SyncPlayer` (stage, rule, transport), `cueError` notice, `OffsetField` row with facts, then warnings. The title's visible description is dropped. Root stays `flex: 1 0 auto`; the stage keeps `flex: 1 1 0; min-height: 6rem`. Everything but the stage has `flex-shrink: 0`. At 860×600 the figure uses `--text-3xl` through `@media (max-width: 900px)`.

### D5 Traceability

The renamed requirement keeps its three scenario headings, so the existing `// @covers` lines stay on updated tests with their old ids during implementation ("Preview follows the sign" and "Preview is schematic" move to `TimeRule.test.tsx`). Archive renames the requirement; the post-sync repair rewrites those ids. New scenarios stay unannotated until archive.

## Risks / Trade-offs

- [Re-render per frame] → at most the visible cues plus ticks; `visibleCues` scans the list linearly, which is fine for a few thousand cues.
- [Without playable media the user loses the schematic direction hint] → the mockup shows no rule then; the hint text and the figure's sign remain.

## Human review

`visual-review.md` in this change directory; not enforced by tests.
