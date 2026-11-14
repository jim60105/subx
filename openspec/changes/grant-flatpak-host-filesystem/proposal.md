# Proposal

## Why

The SubX Flatpak (`im.chenj.subx`) declares no `--filesystem` permission, so every file the user picks or drops reaches the app as an xdg document-portal path (`/run/user/<uid>/doc/<doc-id>/<name>`). An individually picked file is a single-file document: renaming or copying a subtitle to a sibling name inside it is backed by a hidden host file `.xdp-<name>-XXXXXX`, the portal reports success, and the portal may later unlink that file. A match run therefore reports "30 succeeded" while the host files are misnamed and at risk of deletion. SubX exists to rename and create files next to the user's media, so the bundle must hand it real host paths.

## What Changes

- `flatpak/manifest.json` `finish-args` gains `--filesystem=host` and `--filesystem=xdg-run/gvfs`. With access to the picked location, the file chooser and file-transfer portals return the real host path instead of registering a document, and a rename is an ordinary rename.
- `scripts/release-config.test.ts` gains one assertion that parses the manifest and checks both permissions are declared read-write.
- `README.md` and `README.zh-TW.md` list the Flatpak bundle under Download and state its file-access permission and what happens when a user revokes it.
- `docs/verification.md` gains a manual, human-run "Flatpak file-access check" procedure. It is human-reviewed evidence, not an automated gate and not a traceability waiver: no spec scenario depends on it.

Not in this change: the backend guard that refuses writes into single-file portal documents (change `guard-portal-document-writes`), and any change to `subx-core`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `release-pipeline`: adds a requirement that the Flatpak bundle's manifest declares read-write host file access and GVFS mount access.

## Impact

- `flatpak/manifest.json` — two new `finish-args` entries; nothing else in the manifest changes.
- `scripts/release-config.test.ts` — one new test in the existing `release workflow flatpak bundle` block.
- `README.md`, `README.zh-TW.md`, `docs/verification.md` — documentation.
- `openspec/specs/release-pipeline/spec.md` — one added requirement with one scenario.
- No Rust, TypeScript application code, IPC binding, or workflow file changes.
- Security posture: the Flatpak no longer confines file access. This matches the AppImage and `.deb` builds, which have never been confined. See design.md D1.

## Batch: flatpak-portal-paths

- This change: `grant-flatpak-host-filesystem` (1 of 2).
- depends-on: none
- Conflicts: none. `guard-portal-document-writes` touches only `src-tauri/src/**`, `src/locales/**` and `src/i18n/backendCodeParity.test.ts`; the two changes share no file and may be applied in either order. Apply this one first because it removes the bug for the default installation.
