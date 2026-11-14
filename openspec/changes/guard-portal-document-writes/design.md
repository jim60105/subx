# Design

## Context

See proposal.md for motivation. The code this design touches, as it stands today:

- `src-tauri/src/paths.rs` — holds `path_key`; private module (`mod paths;` in `lib.rs`), already imported by `convert.rs`, `sync.rs`, `translate.rs`.
- `src-tauri/src/commands/match.rs`
  - `execute_selected_impl(match_state, plan_id, operation_ids)` builds `selected: Vec<MatchOperation>` and calls `engine.execute_operations_audit(&selected, false)`.
  - `build_report(selected: &[MatchOperation], outcomes: &[OperationOutcome])` zips both into `ExecutionOutcomeDto { subtitle_name, target_path, applied, error }`.
  - `display_target(op)` computes the final path: `op.relocation_target_path`, else `op.subtitle_file.path.parent().join(&op.new_subtitle_name)`.
  - `MatchOperation` (from `subx-core`) is `#[derive(Debug)]` only: it cannot be cloned.
- `src-tauri/src/commands/convert.rs` — `preview_conversion_impl(service, convert_state, paths, options)` computes `skip_reason` per item in an `if / else if` chain (`CODE_ALREADY_TARGET_FORMAT`, `CODE_OUTPUT_COLLISION`). Three references to the function: its definition, the `preview_conversion` command wrapper, and the test helper `preview`.
- `src-tauri/src/commands/translate.rs` — `preview_translation_impl(service, translate_state, paths, options)` computes `skip_reason` (`CODE_UNPARSABLE`, `CODE_REPLACE_ARCHIVE_FORBIDDEN`), then resolves `output`, then claims the collision slot, then applies `CODE_OUTPUT_EXISTS`. Three references, same shape as convert.
- `src-tauri/src/commands/sync.rs` — `apply_sync_offset_impl(service, subtitle_path, offset_ms, output_path, overwrite)` resolves `output`, rejects `output_is_input()`, then checks `output.exists()`, then loads, shifts and saves.
- Both previews already have the rule "an item with a skip reason is unselectable and refused by the executor", covered by existing tests; the frontend renders any skip reason through `tError("codes.<code>")` and any `ErrorDto` through `ErrorNotice` (code plus hint).
- `src/i18n/backendCodeParity.test.ts` scans Rust production sources for string literals matching `(core|config|match|convert|sync|translate).<name>[.hint]` and requires `en` and `zh-TW` entries for each.

Portal facts relied on (verified from xdg-desktop-portal 1.22.1 `document-portal-fuse.c`, see `tmp/design-flatpak-portal-paths.md`): a single-file document is the directory `/run/user/<uid>/doc/<doc-id>/` holding one file; any other name created or renamed-to directly in that directory is backed by a `.xdp-*` temporary. Inside a directory document (`/run/user/<uid>/doc/<doc-id>/<dir>/...`) renames are real. The host also exposes a per-application view at `/run/user/<uid>/doc/by-app/<app-id>/<doc-id>/`.

## Goals / Non-Goals

**Goals:**

- No workflow reports a successful write whose destination lies directly inside a portal document directory.
- One classifier, one error code, shared by all four workflows.
- The refusal is decided before any filesystem mutation.

**Non-Goals:**

- No change to `subx-core`, IPC command signatures, DTOs, `src/types/bindings.ts`, or any `.tsx` component.
- No refusal of *reading* inputs from portal documents, and no refusal of writes into directory documents (depth 2 or deeper): both are safe.
- No early warning in the source-selection or review steps; the refusal appears in the match execution report, the convert/translate preview list, and the sync apply error. An earlier warning is a possible follow-up.
- No detection through `statfs`, `FLATPAK_ID`, or `$XDG_RUNTIME_DIR`; classification is lexical (D1).
- No handling of the `/run/flatpak/doc` alias: the pickers were observed to return `/run/user/<uid>/doc/...` paths only.
- Match move mode with `general.backup_enabled` on, where the *source* subtitle is a single-file document and the target is elsewhere: the move itself is correct, but the crate's backup copy lands beside the source and becomes a `.xdp-*` file. Not covered here (see Risks).

## Decisions

### D1. Lexical classifier in `paths.rs`

Add to `src-tauri/src/paths.rs`, above the `#[cfg(test)] mod tests`, changing the existing `use std::path::Path;` to `use std::path::{Component, Path};` and adding `use crate::error::ErrorDto;`. This code was compiled and run against the spec's example paths during planning; copy it verbatim.

```rust
/// Stable code for a write refused because it would land directly inside a
/// document-portal document directory.
pub const CODE_PORTAL_DOCUMENT_TARGET: &str = "path.portal_document_target";
pub const HINT_PORTAL_DOCUMENT_TARGET: &str = "path.portal_document_target.hint";

/// Answers "must a write to this path be refused?". A function pointer so the
/// preview commands can be tested with a substitute: a real portal path cannot
/// be created inside a test's temporary directory.
pub type WriteGuard = fn(&Path) -> bool;

/// True when `path` names an entry directly inside an xdg document-portal
/// document directory: `/run/user/<uid>/doc/<doc-id>/<name>`, or the
/// per-application view `/run/user/<uid>/doc/by-app/<app-id>/<doc-id>/<name>`.
///
/// For a single-file document that directory holds exactly the one granted
/// file. Any other name created or renamed-to there is backed by a hidden
/// `.xdp-<name>-XXXXXX` host file that the portal may later unlink, while the
/// call reports success. Paths one level deeper belong to a directory
/// document, where writes are real, and are not matched.
///
/// Purely lexical on purpose: the interesting operand is an output path that
/// does not exist yet, and the answer must not depend on a FUSE mount being
/// reachable.
pub fn is_portal_document_entry(path: &Path) -> bool {
    let mut owned: Vec<String> = Vec::new();
    let mut rooted = false;
    for component in path.components() {
        match component {
            Component::RootDir => rooted = true,
            Component::Normal(part) => owned.push(part.to_string_lossy().into_owned()),
            // `..`, a leading `.`, or a Windows prefix: never a portal path.
            _ => return false,
        }
    }
    if !rooted {
        return false;
    }
    let parts: Vec<&str> = owned.iter().map(String::as_str).collect();
    let is_uid = |part: &str| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit());
    match parts.as_slice() {
        ["run", "user", uid, "doc", rest @ ..] if is_uid(uid) => match rest {
            ["by-app", _app_id, _doc_id, _name] => true,
            [doc_id, _name] => *doc_id != "by-app",
            _ => false,
        },
        _ => false,
    }
}

/// The refusal every workflow reports for such a target.
pub fn portal_document_target(target: &Path) -> ErrorDto {
    ErrorDto::new(
        CODE_PORTAL_DOCUMENT_TARGET,
        format!(
            "refusing to write {}: a new file directly inside a document-portal document is not stored under its own name",
            target.display()
        ),
    )
    .with_hint(HINT_PORTAL_DOCUMENT_TARGET)
}
```

Why lexical rather than probing the filesystem: output paths do not exist yet; the rule is exact for the path shape the portal hands out; and it is unit-testable on every CI platform. Why "any depth-1 entry" rather than "any name other than the document's main file": the main file's name cannot be known from the path, and the only depth-1 write that would be safe (overwriting the main file in place) never occurs without an unsafe sibling write in SubX's workflows (convert writes a temporary sibling first; sync forbids output = input; translate replace mode is excluded by D4).

Why one shared `path.` code rather than four per-feature codes: the condition and the advice are identical in every workflow, and four copies of the same sentence in two languages would drift.

### D2. Match: refuse per operation, keep the report in selection order

In `src-tauri/src/commands/match.rs`:

1. Add `use crate::paths::{is_portal_document_entry, portal_document_target};`.
2. Split `display_target` so the path is available as a `PathBuf`:

```rust
/// The path a subtitle will end up at.
fn target_path(op: &MatchOperation) -> PathBuf {
    op.relocation_target_path.clone().unwrap_or_else(|| {
        let parent = op.subtitle_file.path.parent().unwrap_or_else(|| Path::new("."));
        parent.join(&op.new_subtitle_name)
    })
}

/// The same path, for display in the review and report.
fn display_target(op: &MatchOperation) -> String {
    target_path(op).display().to_string()
}
```

3. Replace `build_report` with three functions (the counting rule is unchanged: applied counts as success; otherwise an error counts as failure):

```rust
/// One report row for an operation the engine ran.
fn outcome_item(op: &MatchOperation, outcome: &OperationOutcome) -> ExecutionOutcomeDto {
    ExecutionOutcomeDto {
        subtitle_name: op.subtitle_file.name.clone(),
        target_path: display_target(op),
        applied: outcome.applied,
        error: outcome.error.as_ref().map(operation_error_to_dto),
    }
}

/// One report row for an operation refused before the engine saw it.
fn refused_item(op: &MatchOperation) -> ExecutionOutcomeDto {
    let target = target_path(op);
    ExecutionOutcomeDto {
        subtitle_name: op.subtitle_file.name.clone(),
        target_path: target.display().to_string(),
        applied: false,
        error: Some(portal_document_target(&target)),
    }
}

/// Builds the per-item execution report from finished rows.
fn build_report(items: Vec<ExecutionOutcomeDto>) -> ExecutionReportDto {
    let success_count = items.iter().filter(|item| item.applied).count() as u32;
    let failure_count = items
        .iter()
        .filter(|item| !item.applied && item.error.is_some())
        .count() as u32;
    ExecutionReportDto {
        outcomes: items,
        success_count,
        failure_count,
    }
}
```

4. In `execute_selected_impl`, keep everything up to and including the construction of `selected` unchanged, and replace the remainder of the function body with:

```rust
    // Nothing selected is a no-op the UI already blocks; short-circuit rather
    // than driving the engine over an empty batch.
    if selected.is_empty() {
        return Ok(build_report(Vec::new()));
    }

    // Refuse, before the engine sees them, operations whose target sits
    // directly inside a document-portal document: the portal would report the
    // write as successful while storing it under a hidden temporary name.
    // `MatchOperation` is not `Clone`, so each slot remembers either the
    // finished refusal row or the operation's index among the runnable ones.
    let mut runnable: Vec<MatchOperation> = Vec::new();
    let mut slots: Vec<Result<usize, ExecutionOutcomeDto>> = Vec::with_capacity(selected.len());
    for op in selected {
        if is_portal_document_entry(&target_path(&op)) {
            slots.push(Err(refused_item(&op)));
        } else {
            slots.push(Ok(runnable.len()));
            runnable.push(op);
        }
    }

    // The audit variant continues past per-item failures (design D8); the plain
    // `execute_operations` aborts on the first.
    let outcomes = if runnable.is_empty() {
        Vec::new()
    } else {
        engine
            .execute_operations_audit(&runnable, false)
            .await
            .map_err(ErrorDto::from)?
    };

    let items = slots
        .into_iter()
        .filter_map(|slot| match slot {
            Ok(index) => outcomes
                .get(index)
                .map(|outcome| outcome_item(&runnable[index], outcome)),
            Err(item) => Some(item),
        })
        .collect();
    Ok(build_report(items))
```

`execute_selected_impl` keeps its signature, so its existing call sites and tests are untouched. The one existing direct caller of `build_report` in the test module (the test that builds two `OperationOutcome`s by hand and asserts `core.file_operation_failed`) changes its call to `build_report(selected.iter().zip(outcomes.iter()).map(|(op, outcome)| outcome_item(op, outcome)).collect())`; its assertions stay as they are.

No seam is needed for match tests: an operation's target is a field the test sets directly, the guard runs before any filesystem access, so a test can use the literal path `/run/user/1000/doc/a1b2c3d4/v.srt` with the production classifier.

Alternative considered: fail the whole `execute_selected` command when any operation is refused. Rejected: the workflow's contract is a per-item report that continues past failures, and a mixed selection (some files in a real folder) should still do the safe part.

### D3. Convert: a skip reason at preview time, through a `WriteGuard` parameter

In `src-tauri/src/commands/convert.rs`:

1. Change the import to `use crate::paths::{is_portal_document_entry, path_key, WriteGuard, CODE_PORTAL_DOCUMENT_TARGET};`.
2. Add a trailing parameter `is_blocked: WriteGuard` to `preview_conversion_impl`.
3. The `preview_conversion` command wrapper passes `is_portal_document_entry` as that argument. The existing test helper `preview` also passes `is_portal_document_entry`, so every existing test keeps exercising production behaviour.
4. Extend the skip-reason chain, placing the new arm between the two existing ones so a refused item never claims a collision slot:

```rust
        let skip_reason = if path_key(&output) == path_key(&input) {
            Some(CODE_ALREADY_TARGET_FORMAT.to_string())
        } else if is_blocked(&output) {
            Some(CODE_PORTAL_DOCUMENT_TARGET.to_string())
        } else if !claimed.insert(path_key(&output)) {
            Some(CODE_OUTPUT_COLLISION.to_string())
        } else {
            None
        };
```

The existing line `let output_exists = skip_reason.is_none() && output.exists();` already keeps a refused item from being flagged as an overwrite. Execution needs no change: the executor already refuses items that carry a skip reason.

Why a parameter and not a direct call: a convert output is derived from the input path, the input must exist for the scan, and a test cannot create `/run/user/<uid>/doc/<id>/`. A substitute guard lets the test drive the real preview code with real files. The residual untested line is the wrapper passing `is_portal_document_entry`, the same kind of residue the existing `ProductionAiFactory` seam leaves in `match.rs`; the classifier itself is unit-tested in D1 and exercised unsubstituted in the match and sync tests.

### D4. Translate: same mechanism, and it survives the overwrite option

In `src-tauri/src/commands/translate.rs`:

1. Change the import to `use crate::paths::{is_portal_document_entry, path_key, WriteGuard, CODE_PORTAL_DOCUMENT_TARGET};`.
2. Add a trailing parameter `is_blocked: WriteGuard` to `preview_translation_impl`; the `preview_translation` wrapper and the existing test helper `preview` pass `is_portal_document_entry`.
3. Directly after the line `let output = resolve_output_path(&input, &collected, replace_mode, &target_language);` and before the collision-claim `if`, insert:

```rust
            // A document-portal entry cannot hold a new file under its own
            // name. Decided before the collision claim so a refused item does
            // not take the slot a runnable one needs, and never lifted by
            // `overwrite`: the existing-output branch below only runs for an
            // item that still has no skip reason.
            if skip_reason.is_none() && is_blocked(&output) {
                skip_reason = Some(CODE_PORTAL_DOCUMENT_TARGET.to_string());
            }
```

Nothing else in the loop changes. In replace mode the output is the input itself, so an input that is a document entry is excluded; this is intended, because replace mode also writes a `.backup` sibling when backups are enabled, and whether an in-place overwrite alone is safe was not verified.

### D5. Sync: refuse before reading

In `src-tauri/src/commands/sync.rs`:

1. Change the import to `use crate::paths::{is_portal_document_entry, path_key, portal_document_target};`.
2. In `apply_sync_offset_impl`, directly after the `if path_key(&output) == path_key(subtitle_path) { return Err(output_is_input()); }` block and before `let overwritten = output.exists();`, insert:

```rust
    // A document-portal entry cannot hold a new file under its own name: the
    // portal would report the save as successful while storing it under a
    // hidden temporary name. Refused before anything is read or written.
    if is_portal_document_entry(&output) {
        return Err(portal_document_target(&output));
    }
```

No seam: the output path is an argument, and the default output is derived lexically by the crate's `create_default_output_path`, so tests use literal portal paths with the production classifier.

### D6. Parity scan learns the `path.` prefix

In `src/i18n/backendCodeParity.test.ts`:

- In `backendErrorCodes`, change the alternation `(?:core|config|match|convert|sync|translate)` to `(?:core|config|match|convert|sync|translate|path)`, and extend the doc comment above the function with one sentence: shared, cross-feature codes use the `path.` prefix and live in `src-tauri/src/paths.rs`.
- Add one test inside `describe("every backend code has translations in both locales", ...)`:

```ts
  // @covers portal-path-safety/the-refusal-code-is-localizable#the-parity-scan-finds-the-code-and-both-locales-translate-it
  it("scans the shared path-guard code and finds it translated in both locales", () => {
    expect(codes).toContain("path.portal_document_target");
    expect(hints).toContain("path.portal_document_target.hint");
    for (const resource of [enErrors, zhTWErrors]) {
      expect(Object.keys(resource.codes)).toContain("path.portal_document_target");
      expect(Object.keys(resource.hints)).toContain("path.portal_document_target.hint");
    }
  });
```

This asserts that the entries exist, not what they say. No backend string literal of the form `"path.<name>"` exists today (checked with `grep -rnE '"path\.[a-z_]+' src-tauri/src`), so widening the pattern picks up nothing else.

### D7. Locale strings (human-reviewed copy)

Add to the `codes` object of both `errors.json` files, after the `translate.empty_cue_fallback` entry, and to the `hints` object, after the last entry. No test asserts this wording; it is reviewed by a person when the change is reviewed. Starting text:

| key | `en` | `zh-TW` |
|---|---|---|
| `codes` → `path.portal_document_target` | `This location grants access to a single file only, so a new file cannot be created here.` | `這個位置只授權存取單一檔案，無法在此建立新檔案。` |
| `hints` → `path.portal_document_target.hint` | `Add the folder that contains the file instead of the file itself, or allow SubX to access that folder in its Flatpak permissions.` | `請改為加入檔案所在的資料夾，或在 Flatpak 權限中允許 SubX 存取該資料夾。` |

The code message must stand on its own: convert and translate previews show a skip reason's `codes` text without its hint.

## Risks / Trade-offs

- [A safe in-place overwrite of a single-file document's main file is refused (translate replace mode with backups off)] → Accepted: conservative, the user is told to add the folder, and it avoids depending on unverified portal behaviour.
- [Match move mode with backups enabled writes its backup beside a single-file-document source] → Not covered: the moved subtitle is correct and only the backup copy is hidden. Covering it needs `backup_enabled` at execution time, which the plan does not carry today. Recorded as an open question.
- [The portal changes its mount layout in a future version] → The classifier stops matching and behaviour returns to today's; the unit tests pin the layout this change targets, and `grant-flatpak-host-filesystem` keeps the default installation off portal paths altogether.
- [The `WriteGuard` seam lets a wrapper pass the wrong function unnoticed] → Two wrappers, one obvious argument each; the classifier is exercised unsubstituted by the `paths`, match and sync tests.
- [A user of the default Flatpak never sees this code] → Intended: it is a safety net.

## Open Questions

- Should match move mode also be refused when the source subtitle is a document entry and `general.backup_enabled` is on? Answering yes later adds one field to the stored plan and one condition to the D2 guard; it does not change anything specified here.
