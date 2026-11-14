# Proposal

## Why

Inside an xdg document-portal single-file document (`/run/user/<uid>/doc/<doc-id>/<name>`), creating or renaming to a sibling name succeeds from the application's point of view while the host receives a hidden `.xdp-<name>-XXXXXX` file that the portal may later unlink. SubX then reports success for work that is misnamed on disk and at risk of deletion. `grant-flatpak-host-filesystem` removes this for a default Flatpak installation, but a user who revokes that permission, a stricter sandbox, or a file under a location the permission does not cover (`/tmp`, parts of `/var`) still reaches the same path. SubX must never report success for such a write.

## What Changes

- New path classifier in `src-tauri/src/paths.rs` that recognizes, from the path text alone, an entry directly inside a portal document directory.
- Match execution refuses each selected operation whose target is such an entry: the operation is not handed to the `subx-core` engine and is reported as failed with the stable code `path.portal_document_target` and a hint; the other operations run as before.
- Convert and translate previews mark such items excluded with the same code as their skip reason, using the existing skip-reason mechanism (excluded items are already unselectable and refused by the executor).
- Sync apply refuses such an output path with the same code before reading or writing anything.
- `en` and `zh-TW` strings for the code and its hint; `src/i18n/backendCodeParity.test.ts` scans the new `path.` code prefix. The wording of those strings is human-reviewed copy (design.md D7), not asserted by tests.

Known gap, left as a follow-up: match move mode with `general.backup_enabled` on, when the source subtitle is itself a single-file document and the target is elsewhere. The move is correct, but the crate's backup copy is written beside the source and is stored under a hidden temporary name (design.md, Risks and Open Questions).

No change to `subx-core`, to any IPC command signature or DTO, to generated bindings, or to frontend components: the existing error and skip-reason rendering already localizes any backend code.

## Capabilities

### New Capabilities

- `portal-path-safety`: recognizing document-portal entries and refusing, with a localized reason, every write SubX would otherwise place directly inside a portal document directory, across the match, convert, translate and sync workflows.

### Modified Capabilities

(none — the workflow specs keep their requirements; the refusals surface through their existing per-item failure, skip-reason and apply-error mechanisms)

## Impact

- `src-tauri/src/paths.rs` — classifier, code constants, error constructor, guard type, unit tests.
- `src-tauri/src/commands/match.rs`, `convert.rs`, `translate.rs`, `sync.rs` — one guard call each plus tests.
- `src/locales/en/errors.json`, `src/locales/zh-TW/errors.json` — one code and one hint each.
- `src/i18n/backendCodeParity.test.ts` — `path` added to the scanned prefixes; one new test.
- `openspec/specs/portal-path-safety/spec.md` — new capability.
- User-visible: in a restricted sandbox, operations that used to "succeed" and corrupt names now fail with an explanation and leave files untouched.

## Batch: flatpak-portal-paths

- This change: `guard-portal-document-writes` (2 of 2).
- depends-on: none
- Conflicts: none. `grant-flatpak-host-filesystem` touches only `flatpak/manifest.json`, `scripts/release-config.test.ts`, `README.md`, `README.zh-TW.md`, `docs/verification.md` and `openspec/specs/release-pipeline/spec.md`; the two changes share no file. Recommended order: `grant-flatpak-host-filesystem` first (it fixes the default installation), then this one.
