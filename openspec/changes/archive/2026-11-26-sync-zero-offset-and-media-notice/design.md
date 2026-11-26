# Design

## Context

See proposal.md (Why, What Changes). Current code facts this design relies on:

- `src/features/sync/useSyncWizard.ts` holds `offsetMs` (an integer number of ms in normal use). It starts at 0. `skipDetection` sets it to 0, a successful detection sets it to `result.offsetMs`, and `setMediaPath`/`setSubtitlePath`/`restart` reset it to 0. It derives `offsetExceedsMax = defaults !== null && Math.abs(offsetMs) > defaults.maxOffsetMs`.
- `src/features/sync/SyncWizard.tsx`, offset branch: `next = { label: t("offset.continue"), disabled: wizard.offsetExceedsMax, onClick: wizard.toApply }`. `WizardShell` renders `next.disabled` as the native `disabled` attribute. `WizardNavAction` has no description/`aria-describedby` field.
- `src/features/sync/OffsetField.tsx` renders the millisecond `<input type="number">` with `aria-describedby={hintId}` (the visually hidden sign sentence) and `onChange={(e) => onChange(Number(e.target.value))}`. Clearing the field therefore reports `Number("") === 0`. When `exceedsMax` is set it renders `<p className="offset-field__error" role="alert">`.
- `src/features/sync/SyncOffsetStep.tsx` exports `SyncOffsetStep` and `SyncOffsetView` (props `defaults`, `detection`, `offsetMs`, `offsetExceedsMax`, `onOffsetChange`, plus `session` for the view). `SyncOffsetView` is rendered directly by `TimeRule.test.tsx` and `SyncPlayer.test.tsx`; `SyncOffsetStep` by `src/i18n/hardCodedStrings.test.tsx`.
- `src/features/sync/SyncDetectStep.tsx:113` renders `<p className="sync-detect__needs-media">{t("detect.needsMedia")}</p>` when not detecting and without media. `SyncDetectStep.css` styles it with `margin: 0; font-size: var(--text-sm); color: var(--ink-2);`.
- `src/styles/tokens.css` declares, per theme: `--accent` (light `#c23b12`, dark `#ff7648`), `--accent-ink` (light `#b23510`, dark `#ff8a62`), `--del`, `--add`, and the ink/paper tokens. There is no warning token. `src/styles/tokens.contrast.test.ts` holds `--accent-ink` (in `TEXT_TOKENS`) to 4.5:1 against `--paper` and `--paper-2`, and `--accent` to 3:1 against `--paper`, in both themes.
- `src/styles/layout.test.ts` already reads `SyncDetectStep.css` as text with `read(...)` and `declarationsOf(css, selector)` (see `describe("the sync detect step")`). That is the established way to test a CSS mechanism.

## Goals / Non-Goals

**Goals:**

- One derived flag, `offsetIsZero`, is the single source for disabling Continue and for showing the reason.
- The reason sits next to the field it is about, is visible, is announced politely, and is part of the input's accessible description.
- Both caution notices reuse existing tokens with the same declarations.

**Non-Goals:**

- No backend guard. `apply_sync_offset` keeps accepting `offset_ms = 0`, and `toApply` gets no new guard; the existing over-limit rule also relies only on the disabled button.
- No change to `WizardShell`/`WizardNavAction`. No `aria-disabled` focusable-disabled pattern, no tooltip, no `note`.
- No change to the keep/skip/reset rules, the detection DTO, the facts list, analysis warnings, the preview or the over-limit error.
- No rounding rule. Zero means `offsetMs === 0`; `-0 === 0` holds in JS. Fractional input such as `0.4` is outside this change: the backend's `i32` argument already cannot take it.
- No new colour token, no edit to `tokens.css`, no restyle of `ErrorNotice`, `inputs.subtitleOnly` (`.sync-inputs__note`), `.sync-detect__sensitivity-note` or `.offset-field__error`.
- No live-region role on the needs-media paragraph. It is static content rendered with the step and stays a plain `<p>`.

## Decisions

### D1. `offsetIsZero` lives in `useSyncWizard`

Add `offsetIsZero: boolean` to the `SyncWizard` interface, documented as "True when `offsetMs` is exactly 0: saving would write an unshifted copy.", next to `offsetExceedsMax`. Compute it as `const offsetIsZero = offsetMs === 0;` and return it. In `SyncWizard.tsx` the offset branch becomes `disabled: wizard.offsetExceedsMax || wizard.offsetIsZero`, and `offsetIsZero={wizard.offsetIsZero}` is passed to `SyncOffsetStep`.
*Alternative:* compute `offsetMs === 0` separately in `SyncWizard.tsx` and in the view. Rejected: two copies of the rule could drift, which is how a disabled button ends up with no reason shown.

### D2. The reason is an `OffsetField` notice, chosen by `SyncOffsetView`

- `SyncOffsetFieldsProps` gains `offsetIsZero: boolean` (required, documented "Continue is blocked because the offset is 0.").
- `SyncOffsetView` computes
  `const zeroNotice = offsetIsZero ? t(detection !== null && detection.offsetMs === 0 ? "offset.zeroDetected" : "offset.zero") : undefined;`
  and passes `notice={zeroNotice}` to `OffsetField`.
- `OffsetFieldProps` gains `notice?: string`, documented "A caution shown under the row and added to the field's description, such as why Continue is unavailable." `OffsetField` gets `const noticeId = useId();`. The input's `aria-describedby` becomes `notice === undefined ? hintId : \`${hintId} ${noticeId}\``. After the hint paragraph and before the `exceedsMax` paragraph it renders:
  `{notice !== undefined && (<p id={noticeId} className="offset-field__notice" role="status">{notice}</p>)}`
- Which reason applies depends only on whether the held detection reported 0, not on how the user reached 0. A detection of 0 that the user nudges away from and back still shows the detected-zero reason, which stays true. A non-zero detection edited to 0 shows the generic reason.

*Alternatives:* the `WizardNavAction.note` slot. Rejected: it is built for a short serif figure with `aria-hidden` text, and it would sit away from the field. `role="alert"` like the over-limit error. Rejected: skipping lands on 0 every time, and an assertive interruption on every skip is noise. The over-limit case is an error the user typed; zero is the starting state.

### D3. Copy (new keys under `offset` in both locale files)

Insert after `"exceedsMax"` in `src/locales/en/sync.json`:

```json
"zero": "An offset of 0 seconds leaves the subtitle unchanged. Change the offset to continue.",
"zeroDetected": "Detection found no offset: the subtitle already matches the media. Change the offset to save a shifted copy anyway.",
```

Insert in the same place in `src/locales/zh-TW/sync.json`:

```json
"zero": "偏移量為 0 秒時字幕不會有任何變動，請調整偏移量後再繼續。",
"zeroDetected": "偵測結果沒有偏移，字幕已與媒體同步。若仍要另存調整後的副本，請先調整偏移量。",
```

The wording is human-reviewed (D6). Tests locate the status by role and by the English text only as a fixture. They pin neither length nor phrasing beyond that.

### D4. One caution style, two stylesheets

`src/features/sync/SyncDetectStep.css`, replace the `.sync-detect__needs-media` rule with:

```css
/* A caution, not a failure: accent ink and the accent marker, never --del. */
.sync-detect__needs-media {
  padding-block: var(--space-1);
  padding-inline-start: var(--space-3);
  margin: 0;
  font-size: var(--text-sm);
  color: var(--accent-ink);
  border-inline-start: 2px solid var(--accent);
}
```

`src/features/sync/OffsetField.css`, add directly before `.offset-field__error`:

```css
/* Why Continue is unavailable: a caution in accent ink with the accent marker. */
.offset-field__notice {
  padding-block: var(--space-1);
  padding-inline-start: var(--space-3);
  margin: 0;
  font-size: var(--text-sm);
  color: var(--accent-ink);
  border-inline-start: 2px solid var(--accent);
}
```

The layout copies `.offset-field__error` and `ErrorNotice`, so the three notice kinds line up. Only the colour role differs.
*Alternatives:* `--del`. Rejected: it means failure or removal, and neither notice reports a failure. A new `--warning` token. Rejected: the request forbids inventing colours, and an alias would only rename `--accent-ink`. Contrast in both themes needs no new test because the existing token contrast test already covers both tokens (Context).

### D5. Tests and coverage annotations

New scenarios get `// @covers` annotations. Ids follow `scripts/check-spec-coverage.mjs` `slugify`:

- `sync-workflow/a-zero-offset-blocks-continuing#skipping-enters-with-continue-disabled`
- `…#changing-the-offset-re-enables-continue`
- `…#detected-zero-is-held-and-blocks-continue`
- `…#editing-to-zero-after-a-non-zero-detection`
- `…#keeping-a-detected-zero-keeps-continue-disabled`
- `sync-workflow/sync-caution-notices-use-the-accent-tokens#missing-media-notice-uses-the-accent-tokens`
- `…#zero-offset-reason-uses-the-accent-tokens`

The two MODIFIED requirements keep their scenario headings, so the existing annotations on `SyncWizard.test.tsx` ("enters the offset step with a detected offset beyond the maximum, which can be reduced", which reduces to 1000, and "shows a subtitle that cannot be read…", which runs at 1500) still apply and still pass unchanged.

### D6. Human review document

`openspec/changes/sync-zero-offset-and-media-notice/review.md` is the human-review record for what tests cannot judge: the tone and accuracy of `offset.zero`/`offset.zeroDetected` in both locales, and how the needs-media notice and the zero reason look in light and dark themes at the default window size. The reviewer fills it in during apply. It is not an automated gate.

## Risks / Trade-offs

- [The native `disabled` Continue is skipped by Tab, so a keyboard user may not land on it] → The reason is visible, sits beside the field the user is editing, and is part of that field's accessible description. This is the same pattern as the over-limit error today.
- [A `role="status"` region inserted together with its text may not be announced by every screen reader on first render] → The text is still reachable as the field's description and in reading order. The announcement is a bonus, not the only channel.
- [Existing tests that render `SyncOffsetView` at offset 0 now see a status and a longer description] → Tasks update `TimeRule.test.tsx` to match the description with `expect.stringContaining`. `SyncPlayer.test.tsx` renders at 750 and only needs the new prop.
- [Clearing the field mid-edit reports 0, so the reason appears and disappears while the user retypes, and the polite status may re-announce] → Accepted. The empty field really is 0 to the wizard (Continue is disabled too), and the reason disappears as soon as a non-zero digit is typed. No debounce is added.
- [After a detected 0, going back offers `Keep 0.00 s` (as the primary action when a review exists), which returns to a step where Continue is disabled] → Accepted. Keep stays the action that discards nothing, the keep rules stay unchanged, and the step explains itself on arrival.
- [The preview harness `scripts/preview/views.tsx` hard-codes the shell's Continue state] → Tasks mirror the zero rule there, so the human review in D6 sees the same state as the app (`?ms=0`).
- [Users who really want an unshifted copy can no longer make one] → Intended. An unshifted copy is what the original file already is.
