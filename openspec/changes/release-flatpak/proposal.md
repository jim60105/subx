## Why

SubX's release pipeline currently publishes unsigned installers for macOS, Windows, and Linux (AppImage/deb/rpm), but Linux users who prefer a sandboxed distribution have no first-class Flatpak bundle. Adding a Flatpak release step gives Linux users a self-contained, sandboxed installer with the WebKit/GTK runtime baked in, so installing on a stock system does not depend on host-level `libwebkit2gtk-4.1-dev` and friends.

## What Changes

- **Modify `.github/workflows/release.yml`** by adding a `build-flatpak` job to the existing release pipeline. A separate workflow file was rejected because it would duplicate the draft-release logic that `prepare` already provides; one pipeline means the Flatpak bundle lands in the same draft release the rest of the matrix uploads into.
  - Same triggers as the release pipeline: `push` on `v*` tags and `workflow_dispatch`.
  - Tag push: build the app in a Flatpak sandbox, produce the `subx.flatpak` bundle, and upload it to the draft release created by `prepare`.
  - Manual dispatch: build the bundle and keep it as a workflow artifact (no release to publish into).
- **Add `flatpak/manifest.json` and `flatpak/subx.desktop`**: the Flatpak build manifest (flatpak-builder format: `app-id` `im.chenj.subx`, `org.freedesktop.Platform` runtime + `org.freedesktop.Sdk`) and the desktop entry for the bundled app. The manifest installs a pinned Rust toolchain inside the sandbox, builds `src-tauri` via `cargo build --release`, and the `post-install` hooks bundle the prebuilt frontend `dist/` plus the `subx` binary and desktop entry into the app.
- **Extend the `release-pipeline` spec**: a new requirement that every release also carries a Linux Flatpak bundle as a GitHub Release download file (explicitly not a Flathub publication), with the same build-provenance attestation as the other bundles.

## Capabilities

### New Capabilities

(none — the behavior change belongs to an existing capability)

### Modified Capabilities

- `release-pipeline`: the release workflow SHALL additionally build a Linux Flatpak bundle in a Flatpak sandbox and attach it to the draft release as a download file, without publishing to Flathub. The bundle is attested like every other published file.

## Impact

- `.github/workflows/release.yml` — one new job (`build-flatpak`); triggers unchanged.
- New files `flatpak/manifest.json` and `flatpak/subx.desktop`.
- `openspec/specs/release-pipeline/spec.md` — delta spec with the new requirement and scenarios.
- No application code changes: `subx-cli` is a crates.io dependency (`subx-cli = "1.8"` in `src-tauri/Cargo.toml`), so the sandbox build fetches it from the registry.
- Caveat for later app work: inside a Flatpak sandbox the user's `~/.config` is a read-only mount, while the app's `$HOME` is `~/.var/app/im.chenj.subx`. If `subx-cli` writes to `~/.config/subx/config.toml` (e.g. saving an API key), that write will fail; the fix is to redirect the config location via `XDG_CONFIG_HOME` so it lands in the app's private home. Out of scope for this pipeline change, but flagged.
