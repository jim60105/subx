# Design

## Context

Approved design: `docs/superpowers/specs/2026-11-25-sync-preview-design.md`, "Flow". Visual reference: the "02 詢問 / 偵測中 / 失敗" screens of `.superpowers/brainstorm/847440-1795612948/content/sync-preview-v1.html` (git-ignored).

Today: `SyncStepId = "inputs" | "method" | "detect" | "apply"`; `SyncMethodStep` holds the radio group, slider and an `OffsetField`; `SyncDetectStep` runs and reviews; drops are subscribed for the wizard's whole life; `SyncMethodDto` is also `SyncDefaultsDto.defaultMethod`.

`app-shell` currently says "Forward actions SHALL use `next`, non-forward `secondary`", which contradicts Skip and Start detection as two forward choices. Both affected requirements are in this change's delta.

## Goals / Non-Goals

**Goals:** the flow of the design document, nothing else.

**Non-Goals:** preview, player, time rule, removal of `OffsetPreview`, `OffsetField` markup, backend changes, the apply step.

## Decisions

### D1 `useSyncWizard.ts`

```ts
export type SyncStepId = "inputs" | "detect" | "offset" | "apply";
export type DetectPhase = "ask" | "detecting" | "failed";
```

Removed from `SyncWizard`: `method`, `setMethod`, `canDetect`, `isDetecting`, `toMethod`, `backToMethod`. Added:

```ts
hasMedia: boolean;            // mediaPath !== null
prefersManual: boolean;       // defaults?.defaultMethod === "manual"
hasReview: boolean;           // offset step entered for the current files
detectPhase: DetectPhase;
toDetect: () => void;         // inputs → detect, phase ask
startDetection: () => void;   // ask|failed → detecting
cancelDetection: () => void;  // detecting → ask
skipDetection: () => void;    // ask|failed → offset, offset 0, detection null
keepOffset: () => void;       // ask|failed → offset, offset and detection kept
backToDetect: () => void;     // offset → detect, phase ask, offset and detection kept
backToOffset: () => void;     // apply → offset
```

- `detectPhase` is derived: `isDetecting ? "detecting" : detectError !== undefined ? "failed" : "ask"`. `toDetect`, `backToDetect`, `cancelDetection`, `backToInputs` and `skipDetection` clear `detectError`.
- `hasReview` becomes true on every entry to the offset step and false on a file change and on `restart`. An offset of 0 counts. `keepOffset` clears `detectError`.
- `startDetection` clears `detectError` and sets `isDetecting`; it does not clear `detection` or `offsetMs`. Success sets `detection`, `offsetMs` and `step: "offset"` under the existing generation guard.
- `cancelDetection` bumps the generation and stores the promise of `cancelSyncDetection()` (rejections swallowed) in a ref; `startDetection` awaits that ref before calling `detectSyncOffset` and re-checks the generation after the await, so a pending cancel cannot abort the next run.
- `setMediaPath` / `setSubtitlePath` become wrappers: if the path differs from the current one, reset `offsetMs` to 0, `detection` to null and `detectError` to undefined. Selecting the same path resets nothing.
- `restart` is unchanged apart from removed names.

### D2 `SyncWizard.tsx` action bar

| Step / phase | back | secondary | next |
|---|---|---|---|
| inputs | – | – | Continue, disabled without subtitle |
| detect / ask, media, auto | Back | Skip | Start detection |
| detect / ask, media, `prefersManual` | Back | Start detection | Skip |
| detect / ask, no media | Back | – | Skip |
| detect / ask, `hasReview`, media | Back | Skip, Start detection | Keep {{offset}} |
| detect / ask, `hasReview`, no media | Back | Skip | Keep {{offset}} |
| detect / detecting | – | Cancel | Detecting… (disabled) |
| detect / failed | Back | Skip | Try again |
| detect / failed, `hasReview` | Back | Skip, Keep {{offset}} | Try again |
| offset | Back | – | Continue, disabled when `offsetExceedsMax` |
| apply | unchanged; Back is `backToOffset` | | |

The mockup draws Cancel at the inline start; `app-shell` requires a distinct cancel in `secondary`, which wins. The drop subscription's effect runs only while `wizard.step === "inputs"` and unsubscribes on leaving it, including when the subscribe promise resolves late. `WizardShell.tsx`: `secondary?: WizardNavAction | readonly [WizardNavAction, WizardNavAction]`, rendered in order with the existing button markup; its comment becomes "Inline-end cluster, before `next`: cancel, escape hatches, or the non-primary forward choices. At most two."

Placement of Keep: three forward choices need three controls. A button in the panel would break "no forward action inside the content panel"; a fourth slot would change every wizard; a checkbox would change what Skip means. Letting the existing slot hold two controls changes no position, and `next` stays last. Keep is primary because it is the only choice that discards nothing. `{{offset}}` is `formatSeconds(offsetMs)`, which rounds to 10 ms, so the accessible name is the same localized text with the three-decimal seconds.

### D3 Components

- Delete `SyncMethodStep.tsx/.css/.test.tsx`.
- Rewrite `SyncDetectStep` (step 2). Props: `{ phase, hasMedia, defaults, defaultsError, sensitivity, detectError, onSensitivityChange }`. Markup: `.sync-detect` > `.sync-detect__intro` (title and description per phase), `.sync-detect__clock[role=status]` only while detecting, `.sync-detect__instrument[aria-hidden=true][data-listening]` with 48 `.sync-detect__bar` elements whose `--h` comes from `abs(sin(i*0.37)*cos(i*0.113))*0.8+0.08` in inline style, `ErrorNotice` when failed, and the slider block moved verbatim from `SyncMethodStep` (ask and failed only, not without media). Without media a `.sync-detect__needs-media` paragraph replaces the slider. `useElapsedSeconds` stays. `defaultsError` is shown as today.
- New `SyncOffsetStep.tsx/.css` (step 3): title, facts `dl`, warnings and `OffsetField`, moved from the review half of the old `SyncDetectStep`. Props: `{ defaults, detection, offsetMs, offsetExceedsMax, onOffsetChange }`.
- CSS: existing tokens only. Bars use `--hair`, and `--ink` with an animation under `[data-listening="true"]`; `@media (prefers-reduced-motion: reduce) { .sync-detect__bar { animation: none; } }`.

### D4 Locale keys (`sync.json`, both languages)

`steps`: `inputs, detect, offset, apply`. Namespace `method` is removed; `detect` holds `ask.title, ask.description, running.title, running.description, failed.title, failed.description, needsMedia, elapsed` (with `{{seconds}}`), `start, skip, keep, keepLabel, cancel, detecting, retry, back` and `sensitivity.*` (moved); `offset` gains `title, description, detected, confidence, confidenceValue, back, continue`. `inputs.subtitleOnly` is reworded to say that detection will be skipped and the offset set by the user. `errors.json` `sync.vad_unavailable.hint` is reworded to say detection can be skipped: the old text tells the user to go back and enter the offset, which step 2 no longer offers.

`WizardNavAction` gains optional `accessibleLabel?: string`, rendered as `aria-label`. It must contain the visible text (WCAG 2.5.3): `keep` is "Keep {{offset}} s" and `keepLabel` is that text followed by the exact seconds.

### D5 Tests and traceability

MODIFIED requirements keep every existing scenario heading, so the existing `// @covers` lines stay on the updated tests (the slider line moves to `SyncDetectStep.test.tsx`). New scenarios stay unannotated until archive. Rust tests are untouched.

## Risks / Trade-offs

- [Primary action swaps when defaults arrive after step 2 is shown] → defaults load when the screen mounts; until then Start detection is primary.

## Human review

`visual-review.md` in this change directory. Not enforced by tests.
