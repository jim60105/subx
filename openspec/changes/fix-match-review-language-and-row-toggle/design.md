# Design

## Context

See proposal.md - Why. All statements below were read from `e70d69a` and `subx-core` 1.1.0.

**Root cause of the language bug.** The name and the chip come from two unrelated detections:

1. `subx-core` `src/core/matcher/engine.rs:1718-1758` (`generate_subtitle_name`) picks the tag in order: AI `target_filename_suffix`, AI `language`, path detector, none. The AI infers language from dialogue *content* (`services/ai/prompts.rs`, "The content sample is the primary signal").
2. `MatchOperation` has no language field, so the AI's answer survives only inside `new_subtitle_name`. The cache item (`matcher/cache.rs` `OpItem`) also stores only the name.
3. `src-tauri/src/commands/match.rs:474` then re-detects from the *source* path: `language_detector.get_primary_language(&op.subtitle_file.path)`. That detector (`core/language.rs`) only knows tc, sc, en, ja, ko, fr, de, es, pt, ru, only matches a lowercase 2-3 letter token bounded by `.`/`_`/`-` before a `.`, tests only the first hit of each pattern, and never reads content. Anything else is `None`.
4. `src/features/match/languageGroups.ts:15` puts `null` in Other. The frontend is correct given its input.

The source names' endings were truncated in the report, so which detector limit each row hit is not known; the fix does not depend on it. `th` is a certain miss: it is not in the detector's map.

**Row toggle.** `PairRow` in `src/features/match/ReviewStep.tsx` renders an `<li>` whose only handler is the checkbox's `onChange`. Nested controls are exactly the checkbox and, for a confident row with reasoning, `<summary>`. `<summary>` is a block, so it currently spans the whole subtitle column.

## Goals / Non-Goals

**Goals:** chips and badge agree with the resulting name, on fresh and cached analyses; large pointer target without changing the accessibility tree.

**Non-Goals:** changing `subx-core` or generated names; detecting language from content in the GUI; guessing a language when the resulting name has none (an AI suffix of `2` without a marker in the source stays Other); range selection, arrow-key navigation, or a listbox/grid role; restyling the checkbox; changing the Execute step; merging two-letter and three-letter codes (`th`/`tha`) or splitting compound tags (`sc-en`).

## Decisions

### D1. Derive the language from `new_subtitle_name` in the backend

Add two private functions in `src-tauri/src/commands/match.rs`, next to `build_plan_dto`, and call `operation_language(&language_detector, op)` at line 474 in place of the direct detector call:

```rust
/// Tags that fit a language code's shape but never name a language.
const NON_LANGUAGE_TAGS: [&str; 3] = ["und", "cc", "sdh"];

fn operation_language(detector: &LanguageDetector, op: &MatchOperation) -> Option<String> {
    language_in_target_name(detector, op)
        .or_else(|| detector.get_primary_language(&op.subtitle_file.path))
}

fn language_in_target_name(detector: &LanguageDetector, op: &MatchOperation) -> Option<String> {
    let video = &op.video_file;
    // The engine's own rule: an upper-case extension is not stripped, because
    // `extension` is lower-cased at discovery.
    let base = video
        .name
        .strip_suffix(&format!(".{}", video.extension))
        .unwrap_or(&video.name);
    let rest = op.new_subtitle_name.strip_prefix(base)?.strip_prefix('.')?;
    let (tag, _extension) = rest.rsplit_once('.')?;
    let raw = detector.normalize(strip_counter(tag))?;
    let code = match raw.as_str() {
        "zh-tw" | "zh_tw" | "zh-hk" | "zh_hk" => "tc".to_string(),
        "zh-cn" | "zh_cn" => "sc".to_string(),
        _ => raw,
    };
    is_language_code(&code).then_some(code)
}
```

```rust
/// Drops a trailing counter (`tc.2`, `en-2`); a bare number or `tc2` is kept.
fn strip_counter(tag: &str) -> &str {
    let head = tag.trim_end_matches(|c: char| c.is_ascii_digit());
    if head.len() == tag.len() {
        return tag;
    }
    match head.strip_suffix(['.', '-', '_']) {
        Some(stem) if !stem.is_empty() => stem,
        _ => tag,
    }
}

fn is_language_code(code: &str) -> bool {
    if NON_LANGUAGE_TAGS.contains(&code) {
        return false;
    }
    let mut parts = code.split(['-', '_']);
    let primary_ok = parts
        .next()
        .is_some_and(|p| (2..=3).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphabetic()));
    primary_ok
        && parts.all(|p| (1..=8).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphanumeric()))
}
```

The `.n` form is the collision counter of `apply_unique_target_paths`. A numeric region is dropped with it (`es-419` becomes `es`), which is accepted.

Call these on the `op` already passed to `build_plan_dto`; by then the archive rewrite and the uniqueness pass are done. Update the doc comment on `MatchOperationDto::language` (`src-tauri/src/dto.rs:132`) to: `The language tag in the resulting file name, else the path-detected primary code.` and regenerate bindings.

Alternatives rejected:
- *Language field on `MatchOperation`*: a breaking `subx-core` release, plus a cache schema bump for `OpItem`. Cleaner long term; not needed here.
- *Record the AI response by wrapping `AIProvider`*: a cached analysis makes no AI call, so it would fail exactly on re-runs.
- *Derive in TypeScript from `targetPath`*: needs a copy of the engine's alias map and of its base-name rule.
- *Run `LanguageDetector` on the target name*: still does not know `th` and reads directory names and parts of the video name.

### D2. Name unlabelled languages through `Intl.DisplayNames`

Add to `src/features/match/languageGroups.ts`:

```ts
/** The platform's name for a plain two- or three-letter code, else the code itself. */
export function platformLanguageName(code: string, locale: string): string {
  if (!/^[a-z]{2,3}$/.test(code)) return code;
  return new Intl.DisplayNames([locale], { type: "language", fallback: "none" }).of(code) ?? code;
}
```

The pattern keeps `.of` from throwing a `RangeError`. In `ReviewStep`, read `i18n` from the existing `useTranslation("match")` and use `t("review.languages.<code>", { defaultValue: platformLanguageName(group.code, i18n.language) })`. The hand-written labels keep priority: `tc` and `sc` are not BCP 47 Chinese (`sc` is Sardinian to `Intl`), so they must never reach it. No locale key is added. The row badge keeps the upper-cased code.

Alternative rejected: adding locale keys per language; the AI's code set is open.

### D3. A click handler on the row, not a label and not an ARIA widget

In `PairRow`, on the `<li>`:

- `onMouseDown`: store `{ x: event.clientX, y: event.clientY }` in a `useRef`.
- `onClick`: return when `(event.target as Element).closest("input, summary, button, a, select, textarea, label")` is not null; return when the pointer moved more than 4 px on either axis since the stored press **and** `window.getSelection()?.isCollapsed === false`; otherwise `onToggle(operation.id)`.

Both conditions are needed. Selection alone would swallow a click on already selected text (engines differ on whether the press or the release collapses it) and the second half of a double click (which selects a word). Movement alone would swallow a slightly shaky click. A double click therefore toggles twice; native word selection is left alone.

No `role`, `tabIndex`, or key handler on the `<li>`. Keyboard users keep the native checkbox (Space) and summary (Enter/Space); their synthesized clicks bubble from `input`/`summary` and are ignored by the first check. Any future control in a row is ignored for the same reason. Unmatched rows get no handler.

Reasoning text counts as row content (the user asked for the entire row); only `summary` is exempt, not `details`.

Alternatives rejected: wrapping the row in `<label>` (all row text would join the label and an interactive `<summary>` would be nested in a label); `role="checkbox"`/`option` on the row (nested interactive content is not exposed inside those roles, and it duplicates the tab stop).

### D4. Styling

In `ReviewStep.css`: `.review-ledger__row[data-kind="pair"] { cursor: pointer; }`, `.review-ledger__row[data-kind="pair"]:hover { background: var(--paper-2); }`, and `.review-ledger__reasoning summary { width: fit-content; }` (added to the existing rule) so the blank space beside the disclosure belongs to the row. Text tokens on `--paper-2` stay at or above 4.5:1 (`--ink-3` light is about 4.9:1). Appearance is judged by a person in `visual-review.md`.

## Risks / Trade-offs

- [The base-name rule mirrors a private engine function] -> If upstream changes it, the prefix stops matching and the result degrades to today's path detection; unit tests feed engine-shaped names, and one test runs the real engine.
- [A short non-language AI suffix such as `new` is taken for a language] -> Shown as its own control, still selectable; the prompt restricts suffixes to languages or numbers.
- [A video base name ending in `.<digits>` that collides is renumbered by the engine (`show.2.mkv` -> `show.3.srt`)] -> Prefix does not match; path fallback.
- [Accidental toggles are easier] -> The count beside Continue and the hover background make them visible; a second click reverts.
