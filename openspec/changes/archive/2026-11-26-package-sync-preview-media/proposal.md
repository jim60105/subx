# Proposal

## Why

The preview needs media decoders and audio access that the packages do not provide: the Flatpak manifest grants no audio socket, the AppImage bundles no media framework, and the deb names no GStreamer plugins.

## What Changes

- Flatpak: `--socket=pulseaudio` in `finish-args`.
- AppImage: `bundleMediaFramework: true`, and the Linux release build installs the GStreamer plugins that are to be bundled.
- deb: recommends `gstreamer1.0-plugins-base`, `gstreamer1.0-plugins-good`, `gstreamer1.0-libav`.
- A manual packaged-preview check in `docs/verification.md`. Audible output from a package is **human-checked**, not tested.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `release-pipeline`: adds requirements for the Linux packages' media configuration.

## Impact

- `flatpak/manifest.json`, `src-tauri/tauri.conf.json`, `.github/workflows/release.yml`, `scripts/release-config.test.ts`, `docs/verification.md`, `CHANGELOG.md`. The design document does not name `release.yml`; without the plugins on the build machine the AppImage has nothing to bundle.
- AppImage grows by roughly 15 to 35 MB (Tauri's own estimate).

## Evidence limits

Audible output, Flatpak, AppImage, Windows and macOS are unverified. macOS App Transport Security behaviour for `http://127.0.0.1` is unverified; no `Info.plist` key is added without an observed block.

## Batch:

depends-on: add-sync-preview-player
Conflict notes: shares `tauri.conf.json` with `add-sync-media-server` (different keys) and `CHANGELOG.md` with the frontend changes. The configuration is independent; the dependency exists because the manual check needs a player.
