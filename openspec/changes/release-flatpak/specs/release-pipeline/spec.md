## ADDED Requirements

### Requirement: Releases include a Linux Flatpak bundle

The release workflow SHALL additionally build a Linux Flatpak bundle and attach it to the draft release as a download file. The bundle SHALL be built inside a Flatpak sandbox on the `org.gnome.Platform//50` runtime (which ships the WebKitGTK 4.1 that Tauri 2 requires — no separate WebKit extension is needed), and the generated bundle SHALL name the Flathub repository as the source for that runtime, so end users can install it with `flatpak install ./subx.flatpak` plus the Flathub remote. A pinned Rust toolchain is installed into the build sandbox for the compile step. The bundle SHALL be published to the GitHub release rather than to Flathub. The bundle SHALL carry a build-provenance attestation like every other published file.

#### Scenario: A Flatpak bundle is published with every release

- **WHEN** the workflow runs for a version tag
- **THEN** it builds a Flatpak bundle in a Flatpak sandbox, produces a `subx.flatpak` file, and uploads it to the draft release as a download file

#### Scenario: A manual dispatch keeps the bundle as an artifact

- **WHEN** the workflow is started manually rather than by a tag
- **THEN** it builds the Flatpak bundle and retains it as a workflow artifact, and it uploads the bundle to no release

#### Scenario: The bundle is built in a sandbox with its own runtime

- **WHEN** the Flatpak build step is inspected
- **THEN** the build runs inside a Flatpak sandbox on the `org.gnome.Platform//50` runtime, which ships WebKitGTK 4.1 and the GTK system libraries, and a pinned Rust toolchain is installed into the sandbox so `cargo build --release` succeeds; the produced bundle needs no host-level `libwebkit2gtk` or GTK installation

#### Scenario: A re-run replaces the bundle asset

- **WHEN** the workflow runs again for a tag that already has a published Flatpak bundle
- **THEN** the re-upload replaces the existing `subx.flatpak` asset in place, so no duplicate download file is created

#### Scenario: The bundle carries build provenance

- **WHEN** the Flatpak bundle is produced
- **THEN** the workflow attaches a build-provenance attestation to the bundle, and `gh attestation verify` accepts it for the downloaded file
