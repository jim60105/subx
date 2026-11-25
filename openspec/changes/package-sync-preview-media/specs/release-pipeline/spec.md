# Spec Delta

## ADDED Requirements

### Requirement: The Flatpak bundle is granted audio output

The Flatpak manifest SHALL declare, in its `finish-args`, access to the PulseAudio socket, so that media played by the application can reach the sound server.

#### Scenario: The manifest declares the audio socket

- **WHEN** the `finish-args` of `flatpak/manifest.json` are parsed
- **THEN** they contain `--socket=pulseaudio` exactly and no `--nosocket=pulseaudio`

### Requirement: Linux packages declare media playback support

The AppImage bundle SHALL include the media framework, the Linux release build SHALL install the GStreamer plugins to bundle, and the deb package SHALL recommend them.

#### Scenario: AppImage bundles the media framework

- **WHEN** the bundle configuration is parsed
- **THEN** `bundle.linux.appimage.bundleMediaFramework` is true

#### Scenario: Deb recommends the plugins

- **WHEN** the bundle configuration is parsed
- **THEN** `bundle.linux.deb.recommends` contains `gstreamer1.0-plugins-base`, `gstreamer1.0-plugins-good` and `gstreamer1.0-libav`

#### Scenario: Release build installs the plugins

- **WHEN** the release workflow's Linux dependency step is inspected
- **THEN** it installs those three packages
