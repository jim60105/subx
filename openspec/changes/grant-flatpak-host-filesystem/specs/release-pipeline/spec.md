# Spec Delta

## ADDED Requirements

### Requirement: The Flatpak bundle is granted host file access

The Flatpak manifest SHALL declare, in its `finish-args`, read-write access to the host filesystem and to the user's GVFS mount directory, so that files the user selects reach the application as host paths rather than document-portal paths.

#### Scenario: The manifest declares host and GVFS file access

- **WHEN** the `finish-args` of `flatpak/manifest.json` are parsed
- **THEN** they contain `--filesystem=host` and `--filesystem=xdg-run/gvfs` exactly, with no `:ro` or `:create` suffix on either, and they contain no `--nofilesystem` entry
