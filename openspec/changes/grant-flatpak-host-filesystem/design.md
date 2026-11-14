# Design

## Context

See proposal.md for the failure. The facts that shape the approach:

- `flatpak/manifest.json` `finish-args` today: `--share=ipc`, `--share=network`, `--socket=wayland`, `--socket=x11`.
- `src/platform/filePickers.ts` uses `@tauri-apps/plugin-dialog` `open()` and the webview drag-drop event. Inside a Flatpak both go through xdg-desktop-portal, which returns the real path when the app already has access to the location and registers a document (a `/run/user/<uid>/doc/...` path) when it does not.
- The rename itself is `std::fs::rename` inside `subx-core` 1.0; the GUI must not fork that crate.
- The bundle is published on GitHub Releases only, never on Flathub (`release-pipeline`, "Releases include a Linux Flatpak bundle"), so Flathub's linter policy on broad filesystem permissions does not apply.
- `scripts/release-config.test.ts` already parses `flatpak/manifest.json` (`MANIFEST_RAW`) in the `release workflow flatpak bundle` describe block.

Verified on the maintainer's machine (Fedora Atomic 44, Flatpak 1.18.4) with one-off `flatpak run --filesystem=... --command=sh im.chenj.subx` probes, no persistent override:

| finish-args probed | `/mnt` (symlink to `/var/mnt`) | `/var/mnt/<cifs share>` | `/run/media`, `/media` | home |
|---|---|---|---|---|
| `--filesystem=host` | visible | visible | visible | visible |
| `--filesystem=home --filesystem=/mnt` | visible | visible | hidden | visible |

So `host` alone exposes the CIFS mounts under `/var/mnt` on an Atomic system even though the Flatpak documentation lists `/var` as excluded from `host`: the top-level `/mnt` symlink is followed.

## Goals / Non-Goals

**Goals:**

- A default installation of the Flatpak receives host paths from the file picker and from drag-and-drop for media in the home directory, on local mounts, on removable media, and on file-manager (GVFS) network mounts.
- The permission is pinned by an automated test so it cannot be dropped silently.

**Non-Goals:**

- No Rust or frontend application code. Refusing writes into a single-file portal document is change `guard-portal-document-writes`.
- No `--filesystem=host-os`, `host-etc`, `/tmp`, `/var` or `--device` permission.
- No change to where SubX stores its configuration inside the sandbox.
- No change to `.github/workflows/release.yml`, `flatpak/subx.desktop` or `flatpak/subx.metainfo.xml`.
- No Flathub submission work.

## Decisions

### D1. `--filesystem=host`, not a narrower list

Chosen: `--filesystem=host` (read-write, the default mode).

Alternative considered: `--filesystem=home` plus `/mnt`, `/media`, `/run/media`. Rejected. SubX works in place on media libraries, and libraries live wherever the user mounted a disk: `/srv`, `/data`, `/storage`, a second-disk mount at an arbitrary top-level directory. Every location missing from an enumerated list falls back to a document-portal path, which is exactly the silent-corruption case this change removes. An enumerated list can only be wrong by omission, and the cost of an omission is data loss, not an error message.

Alternative considered: keep the sandbox and ask for folders only (`pickFolder`), since directory documents rename correctly. Rejected: drag-and-drop of individual files and the single-file pickers used by the sync wizard would still produce single-file documents.

Security trade-off, accepted: with `host` the sandbox no longer confines file access. The AppImage, `.deb`, macOS and Windows builds are unconfined already, so this brings the Flatpak to the same level rather than below it. `host` still excludes `/usr`, `/etc`, `/tmp`, `/var` (other than standard symlinked directories), `~/.var/app` and the reserved paths.

Read-write is required: every workflow renames or creates files next to its inputs. `:ro` would turn every operation into a permission error.

### D2. `--filesystem=xdg-run/gvfs` for file-manager network mounts

`host` does not include `/run/user/<uid>`. Shares mounted through a file manager (SMB, NFS, SFTP via GVFS) appear under `/run/user/<uid>/gvfs/`, and SubX reads them with plain `std::fs` calls, not GIO. The Flatpak documentation names `--filesystem=xdg-run/gvfs` as the permission that gives non-GIO applications access to those FUSE mounts. NAS shares mounted this way are a common home for subtitle libraries.

`--filesystem=xdg-run/gvfsd` and `--talk-name=org.gtk.vfs.*` are not added: they serve the GIO API, which SubX does not use.

This entry could not be exercised on the maintainer's machine (no GVFS mount present). It is covered by the manual check in D4. If it turns out to be ineffective, a write into such a location is still refused by `guard-portal-document-writes` rather than silently corrupted.

### D3. Test placement and shape

Add one `it(...)` to the existing `describe("release workflow flatpak bundle", ...)` block in `scripts/release-config.test.ts`, directly after the test named `declares the GNOME 50 runtime and a pinned Rust toolchain in the manifest`. It parses `MANIFEST_RAW` with `JSON.parse` and asserts on the `finish-args` array. Exact body:

```ts
  // @covers release-pipeline/the-flatpak-bundle-is-granted-host-file-access#the-manifest-declares-host-and-gvfs-file-access
  it("grants read-write host and GVFS file access in the manifest", () => {
    const finishArgs: string[] = JSON.parse(MANIFEST_RAW)["finish-args"];
    // Exact entries: a `:ro` or `:create` suffix would be a different string.
    expect(finishArgs).toContain("--filesystem=host");
    expect(finishArgs).toContain("--filesystem=xdg-run/gvfs");
    expect(finishArgs.filter((arg) => arg.startsWith("--nofilesystem"))).toEqual([]);
  });
```

This asserts a permission contract of the build configuration, the same kind of assertion the neighbouring test makes about the runtime. It does not assert README wording or any other copy.

### D4. Human-reviewed evidence lives in `docs/verification.md`

Whether a real picker returns a host path cannot be asserted headless: it needs an installed bundle, a desktop session and xdg-desktop-portal. That check is therefore a manual procedure, section `## Manual Flatpak file-access check` in `docs/verification.md`, run by a person before publishing a release. It is deliberately not expressed as a spec scenario and needs no entry in `scripts/spec-coverage.config.json`. The README wording (D5) is reviewed by a person in the same pass.

Exact section text (insert immediately before the `## Adding a feature` heading):

```markdown
## Manual Flatpak file-access check

Not a waiver: no spec scenario depends on this. It is the human check that the
Flatpak's file permission has its intended effect, run before publishing a
release that changes `flatpak/manifest.json`.

1. Install the bundle: `flatpak install --user ./subx.flatpak`.
2. `flatpak info --show-permissions im.chenj.subx` lists `host` and
   `xdg-run/gvfs` under `filesystems=`.
3. Note the current output of `flatpak documents im.chenj.subx`.
4. In the match wizard, add one video file and one subtitle file individually
   (file picker, not folder picker) from a directory outside the home
   directory, such as a mounted disk. Run the match in rename mode and execute.
5. On the host, the subtitle carries the new name shown in the report, and the
   directory contains no file whose name starts with `.xdp-`.
6. `flatpak documents im.chenj.subx` shows no entry that was not there in step 3.
7. Start a new match, and this time drag one video file and one subtitle file
   from the file manager onto the wizard instead of using the picker. Execute
   in rename mode and repeat the checks of steps 5 and 6. Dropped files go
   through the file-transfer portal, a different path from the file chooser.
8. If a file-manager network mount is available, repeat steps 4 to 6 with files
   under `/run/user/<uid>/gvfs/`.
```

Expected outcome of steps 5 to 7: with static access to the location, both the file chooser portal and the file-transfer portal hand over the real host path and register no document. This expectation comes from how xdg-desktop-portal registers documents only as needed by the application; it was not exercised during planning, which is why the procedure checks the picker and the drop separately. If step 7 fails while step 5 passes, the permission fixes the picker only, and that finding must be raised before the release is published.

### D5. README wording

Both READMEs gain a Linux Flatpak bullet in the Download list and one paragraph in the installation-caveats section. Exact text is given in tasks.md 2.1 and 2.2. The paragraph tells a user who revokes the permission to add folders instead of individual files; that advice is true with or without the guard change, because directory documents rename correctly.

## Risks / Trade-offs

- [The Flatpak sandbox no longer limits file access] → Accepted and documented in the README; equal to every other SubX build. Users who want confinement can run `flatpak override --user --nofilesystem=host im.chenj.subx` and work with folders.
- [A location outside `host` (`/tmp`, a path under `/var` with no top-level symlink) still yields a single-file document] → Out of reach of any static permission. `guard-portal-document-writes` refuses those writes with a localized error.
- [`xdg-run/gvfs` is unverified on real hardware] → Step 8 of the manual check; harmless if the directory does not exist. The README names the permission without promising verified network-share support.
- [Drag-and-drop may not return host paths even with the permission] → Step 7 of the manual check exercises it separately; `guard-portal-document-writes` turns any remaining portal path into a refusal instead of a corrupted name.
- [A later manifest edit drops the permission] → The D3 test fails `npm run verify`.
