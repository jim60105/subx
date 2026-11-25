# Design

## Context

Approved design: `docs/superpowers/specs/2026-11-25-sync-preview-design.md`, "Packaging". `flatpak/manifest.json` has six `finish-args` and no audio socket. `tauri.conf.json` has no `bundle.linux`. Both keys exist in tauri-utils 2.10.2 (`AppImageConfig::bundle_media_framework`, `DebConfig::recommends`). `release.yml` installs Linux dependencies in "Install Linux system dependencies" of the `build` job.

## Goals / Non-Goals

**Goals:** configuration and a manual procedure.

**Non-Goals:** application code, signing, other Linux package formats, `Info.plist` changes, adding codec extensions without evidence.

## Decisions

- **D1** Append `"--socket=pulseaudio"` after `"--socket=x11"` in `finish-args`.
- **D2** `tauri.conf.json` `bundle.linux`: `{ "appimage": { "bundleMediaFramework": true }, "deb": { "recommends": ["gstreamer1.0-plugins-base", "gstreamer1.0-plugins-good", "gstreamer1.0-libav"] } }`.
- **D3** Add the same three packages to the `apt-get install` list of that step only; `ci.yml` builds no bundle.
- **D4** Flatpak codecs. On a machine with Flatpak run
  `flatpak run --command=gst-inspect-1.0 org.gnome.Platform//50 avdec_h264` and the same with `avdec_aac` (install the runtime from Flathub first). Both found → no change. Either missing → stop and report the output: an extension's exact name, version and mount point depend on the runtime and are an owner decision. Not runnable → report "unverified".
- **D5** macOS: no change. If a macOS run shows App Transport Security blocking `http://127.0.0.1` media, `NSAllowsLocalNetworking` is a follow-up. If WKWebView blocks it as mixed content the preview reports `unavailable`; the asset protocol is not a fallback (https://github.com/tauri-apps/tauri/issues/3725).

## Risks / Trade-offs

- [Bundled plugins and the host's GStreamer may disagree] → the manual check plays a file from the AppImage.
- [A release dry run is the only proof that the AppImage still builds] → listed in the manual check; a workflow dispatch is the owner's action and a gate before publishing. If it fails in the GStreamer plugin step, the first candidates are `libgstreamer1.0-dev` and `libgstreamer-plugins-base1.0-dev`.
