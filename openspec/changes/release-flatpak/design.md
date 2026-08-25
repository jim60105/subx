## Context

`subx`'s release pipeline (`.github/workflows/release.yml`) already builds five desktop targets on pinned runners and assembles a draft GitHub release (created once by the `prepare` job). Linux users who prefer a sandboxed distribution currently have to install system-level WebKit/GTK libraries by hand. This design adds a Linux Flatpak bundle to the same pipeline, built inside a Flatpak sandbox so the bundle carries its own runtime.

Verified facts (researched this session, flatpak 1.18 CLI checked locally and the flatpak-builder reference read in full):

- GNOME Platform runtimes do **not** ship rustc/cargo (verified for 23.08; the same applies to 50), so the Rust toolchain must be installed inside the build sandbox.
- `flatpak` 1.14.6 and `flatpak-builder` 1.4.2 are available in Ubuntu 24.04's universe repos, so `sudo apt-get install -y flatpak flatpak-builder` works on the `ubuntu-24.04` runner.
- Tauri 2 embeds the frontend assets into the binary at compile time (`tauri-build` codegen). The prebuilt `dist/` is staged into the sandbox as a local directory source and embedded by `tauri_build::build()` — no `/app/share/<app-id>` asset directory is needed at runtime.
- The Flatpak build sandbox has **no network access by default** (builds get `--allow=devel` and `--allow=multiarch` but are "very limited"). Network is enabled per-manifest via `build-options.build-args: ["--share=network"]`. Flathub's own CI ignores `--share=network` (it uses `flatpak-cargo-generator`), but this pipeline does not publish to Flathub, so the flag works.
- `subx-cli` resolves to `subx-cli 1.8.0` from the crates.io registry (confirmed in `src-tauri/Cargo.lock`), so the sandbox build fetches it from the registry.
- **Native CLI semantics (checked against `flatpak 1.18 --help`)**: `flatpak build` runs a command in an already-initialized app dir (no manifest option); `flatpak build-bundle LOCATION FILENAME NAME` where LOCATION is an OSTree repo (from `flatpak build-export`), not a build dir. Manifest-driven builds therefore go through **`flatpak-builder`**: `flatpak-builder --repo=<repo> <build-dir> <manifest.json>`, then `flatpak build-bundle <repo> subx.flatpak im.chenj.subx`.
- **Manifest format (flatpak-builder man page)**: top-level keys are `app-id` (or non-deprecated `id`), `runtime`/`runtime-version`, `sdk` (development runtime — required for compiling), `sdk-extensions` / `platform-extensions` (not a `runtime-extensions` key), `modules`, `finish-args`, and `build-options` with `build-args` for extra `flatpak build` options. Module-level `sources` (e.g. `{"type": "dir", "path": ".."}`) stage the local checkout; a `dir` source's `path` resolves **relative to the manifest file's location** (`flatpak/`), so `..` points at the repository root.
- **Runtime choice (per Flatpak expert review)**: `org.gnome.Platform//50` ships WebKitGTK 4.1 — the exact interface Tauri 2 links against — so **no `org.gnome.Platform.Extension.WebKit` extension is needed** (the extension ref does not even exist in the flathub repo's OSTree summary; the historical GNOME stable repo `https://sdk.gnome.org/gnome.flatpakrepo` is superseded by Flathub mirroring the stable GNOME runtimes). The flathub repo hosts `org.gnome.Platform` and `org.gnome.Sdk` in versions 40–50 (23.08 is no longer served there, which is why the second CI run failed with "Nothing matches org.gnome.Sdk in remote flathub").
- **`flatpak-builder` flag availability (verified in the first CI run)**: Ubuntu 24.04 ships `flatpak-builder 1.4.2`, which has `--install-deps-from` / `--install-deps-only` but **no bare `--install-deps` flag** (confirmed against the 1.4.2 source: `--install-deps-from` alone triggers `builder_manifest_install_deps`, installing the manifest's runtime, SDK and runtime-extensions into the system installation). The first dispatch failed with "Unknown option --install-deps"; the fix is to drop the bare flag.
- **Installation scope (verified in the third CI run)**: `flatpak-builder` defaults to the system installation, which the non-root `runner` user cannot deploy to ("Flatpak system operation Deploy not allowed for user"). The fix is the `--user` flag, which installs the runtime/SDK into the runner user's own flatpak installation.
- **Remote visibility (verified in the fourth CI run)**: with `--user` installs, the flathub remote must exist in the **user** installation ("No remote refs found for 'flathub'" when only a system remote is configured). The workflow therefore adds the remote with `flatpak --user remote-add` (user remote, no sudo), and the sanity checks use `flatpak --user remote-info`.
- Pre-existing bug: `release.yml`'s `prepare` job declares `version: ${{ steps.check_tag.outputs.version }}`, but `scripts/check-release-tag.mjs` never writes `GITHUB_OUTPUT`; the `release_notes` step is the one that writes `version=`. The output points at the wrong step and is currently empty.

## Goals / Non-Goals

**Goals:**

- Add a `build-flatpak` job to the existing `release.yml` (same triggers: `push` on `v*` tags + `workflow_dispatch`).
- On tag push: build the app in a Flatpak sandbox via `flatpak-builder`, produce `subx.flatpak` with `flatpak build-bundle`, and upload it to the draft release as a download file, attested with build provenance.
- On manual dispatch: produce the bundle and keep it as a workflow artifact.
- Keep every existing test in `scripts/release-config.test.ts` green (pinned runner, `shell: bash` on all run steps, only `GITHUB_TOKEN`, per-job permissions, provenance on published files).

**Non-Goals:**

- Publishing to Flathub (explicitly out of scope; the flathub remote is used only as a *source* for the GNOME runtimes/SDK — `org.gnome.Platform//50` + `org.gnome.Sdk//50` — during the build).
- Changing app-level config handling (`~/.config` is not even mounted by default in the sandbox; the app's writable home is `~/.var/app/im.chenj.subx`; redirecting `XDG_CONFIG_HOME` is a follow-up app change).
- Touching the five-target `build` matrix or the `prepare` job's release-creation logic (aside from the one-line `version` output fix).

## Decisions

1. **Extend `release.yml` instead of a new workflow.** A second workflow would duplicate draft-release creation and risk a second draft release per tag. Extending reuses `prepare`'s `release_id` and `version` outputs so the `.flatpak` lands in the same draft release the other bundles use.

2. **Prebuild the frontend on the host, build Rust in the sandbox.** `npm ci && npm run build` runs on the runner (fast, npm-cached); the sandbox only does the Rust build. Since Tauri 2 embeds `dist/` at compile time, the prebuilt `dist/` ships with the source tree (dir source) and is embedded by `tauri_build::build()` — no runtime asset directory needed.

3. **Use `flatpak-builder` for the manifest flow, not raw `flatpak build`.** `flatpak build` cannot consume a manifest; `flatpak build-bundle` takes an OSTree repo, so the native sequence would require `build-init` → `build` → `build-finish` → `build-export` (manual, error-prone). `flatpak-builder` automates: source staging (dir source), `build-init`, module builds, cleanup, `build-finish`, and with `--repo` also `build-export`. Then `flatpak build-bundle <repo> subx.flatpak im.chenj.subx` produces the bundle.

4. **Install the Rust toolchain inside the sandbox in the same module that builds.** The build environment documents `FLATPAK_BUILDER_BUILDDIR` (the per-module scratch dir `/run/build/<module>`, writable and *outside* `/app`). Pin `RUSTUP_HOME`/`CARGO_HOME` into that dir and build in one `sh -c` chain (each `build-commands` entry runs in its own shell, so rustup install + env setup + `cargo build` must be a single chained entry):

   ```
   export RUSTUP_HOME="$FLATPAK_BUILDER_BUILDDIR/rustup" CARGO_HOME="$FLATPAK_BUILDER_BUILDDIR/cargo" &&
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable &&
   export PATH="$CARGO_HOME/bin:$PATH" && . "$CARGO_HOME/env" &&
   cargo build --release
   ```

   Alternative (rejected): the `org.freedesktop.Sdk.Extension.rust-stable` SDK extension — requires the extension to be installed from an external repo; the self-contained rustup approach keeps the pipeline independent. Pin the toolchain version (e.g. `--default-toolchain 1.88.0`) to keep builds reproducible (duck finding).

5. **Enable build-sandbox network** with `"build-options": { "build-args": ["--share=network"] }` so cargo can fetch `subx-cli` and other registry deps. Valid for `flatpak-builder` builds (not Flathub-CI, where `--share=network` is ignored — we don't publish there).

6. **Stage the local checkout as a directory source**: top-level `sources: [{"type": "dir", "path": ".", "skip": [".git", "node_modules"]}` — includes the prebuilt `dist/`; `dist/` must NOT be skipped.

7. **Upload with `gh release upload` into the prepared draft release** (matching the `gh api` style in `prepare`), with `--clobber` so re-runs replace the asset in place (spec: re-run reuses the existing release). On manual dispatch, fall back to a workflow artifact (no release exists).

8. **Attest the bundle** with `actions/attest-build-provenance@v3`, matching the existing build job and the spec's "every published file carries verifiable build provenance".

9. **Fix the `prepare.version` output** (`release.yml:45`): point it at `steps.release_notes.outputs.version`, the step that actually writes the version. The new job's `gh release upload "v${{ needs.prepare.outputs.version }}"` depends on this output being populated.

### `flatpak/manifest.json` (target shape, flatpak-builder manifest format)

```json
{
  "app-id": "im.chenj.subx",
  "runtime": "org.gnome.Platform",
  "runtime-version": "50",
  "sdk": "org.gnome.Sdk",
  "command": "subx",
  "finish-args": ["--share=ipc", "--share=network", "--socket=wayland", "--socket=x11"],
  "build-options": { "build-args": ["--share=network"] },
  "modules": [
    {
      "name": "subx",
      "buildsystem": "simple",
      "subdir": "src-tauri",
      "sources": [
        { "type": "dir", "path": "..", "skip": [".git", "node_modules"] }
      ],
      "build-commands": [
        "export RUSTUP_HOME=\"$FLATPAK_BUILDER_BUILDDIR/rustup\" CARGO_HOME=\"$FLATPAK_BUILDER_BUILDDIR/cargo\" && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.97.1 && export PATH=\"$CARGO_HOME/bin:$PATH\" && . \"$CARGO_HOME/env\" && cargo build --release"
      ],
      "post-install": [
        "install -Dm755 target/release/subx /app/bin/subx",
        "install -Dm644 ../flatpak/subx.desktop /app/share/applications/im.chenj.subx.desktop",
        "install -Dm644 icons/128x128.png /app/share/icons/hicolor/128x128/apps/im.chenj.subx.png",
        "install -Dm644 ../flatpak/subx.metainfo.xml /app/share/metainfo/im.chenj.subx.metainfo.xml"
      ]
    }
  ]
}
```

Notes:
- `runtime: org.gnome.Platform//50` ships the GUI system libraries **and** WebKitGTK 4.1 (the interface Tauri 2 links against) — no WebKit extension is needed; `sdk: org.gnome.Sdk//50` provides the dev packages (headers, pkg-config) required to compile `webkit2gtk-sys`.
- The generated bundle is emitted with `--runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo` so end users can `flatpak install ./subx.flatpak` with only the Flathub remote configured (a single-file bundle does not embed its runtime).
- `sources` is a **module-level** key; the `dir` source's `path` resolves relative to the manifest file's directory (`flatpak/`), so `".."` = repository root. `.git` and `node_modules` are skipped; the prebuilt `dist/` is kept and embedded by `tauri_build::build()` at compile time.
- `subdir: "src-tauri"`: build-commands **and** post-install run with cwd inside `src-tauri/`, so post-install paths are relative to that directory (`target/release/subx`, `icons/128x128.png`, `../flatpak/...` for the repo-root assets).
- `finish-args` include `--share=network` because the running app (subx) makes outbound calls to AI provider APIs.

### `flatpak/subx.desktop`

```ini
[Desktop Entry]
Name=SubX
Comment=AI-powered subtitle matching, conversion, sync, and translation
Exec=subx
Icon=im.chenj.subx
Type=Application
Categories=Utility;
```
(`Icon` uses the canonical app-id name, matching the installed icon filename `im.chenj.subx.png`.)

### `flatpak/subx.metainfo.xml`

Minimal AppStream metainfo so the bundle presents correctly in software centers and eases later Flathub publication:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>im.chenj.subx</id>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>GPL-3.0-or-later</project_license>
  <name>SubX</name>
  <summary>AI-powered subtitle matching, conversion, sync, and translation</summary>
  <description>
    <p>SubX is a cross-platform desktop application for managing, matching, converting, synchronizing, and translating subtitles powered by AI and subx-cli.</p>
  </description>
  <url type="homepage">https://github.com/jim60105/subx</url>
  <icon type="stock">im.chenj.subx</icon>
  <categories>
    <category>Utility</category>
  </categories>
  <provides>
    <binary>subx</binary>
  </provides>
  <launchable type="desktop-id">im.chenj.subx.desktop</launchable>
</component>
```

### `build-flatpak` job (target shape)

```yaml
  build-flatpak:
    name: Build Flatpak
    needs: prepare
    if: always() && (needs.prepare.result == 'success' || needs.prepare.result == 'skipped')
    runs-on: ubuntu-24.04
    permissions:
      contents: write
      id-token: write
      attestations: write
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 'lts/*'
          cache: npm
      - name: Install flatpak tooling
        shell: bash
        run: |
          sudo apt-get update
          sudo apt-get install -y flatpak flatpak-builder
      - name: Configure flatpak remote for runtimes
        shell: bash
        # User installation: the build installs deps with --user, so the
        # flathub remote must exist in the runner's user flatpak installation.
        run: |
          flatpak --user remotes | awk '{print $1}' | grep -qx flathub || flatpak --user remote-add flathub https://dl.flathub.org/repo/flathub.flatpakrepo
      - name: Build frontend
        shell: bash
        run: |
          npm ci
          npm run build
      - name: Build flatpak app in sandbox
        shell: bash
        run: |
          BUILD_DIR="${RUNNER_TEMP}/subx-flatpak-build"
          REPO_DIR="${RUNNER_TEMP}/subx-flatpak-repo"
          mkdir -p "$BUILD_DIR" "$REPO_DIR"
          # Cheap sanity check: the required runtime/SDK refs must exist in the flathub remote before spending the whole build on a missing ref.
          flatpak --user remote-info flathub org.gnome.Platform//50
          flatpak --user remote-info flathub org.gnome.Sdk//50
          # --user: the runner user cannot deploy into the root-owned system
          # installation, so install the runtime/SDK into the user installation.
          flatpak-builder --repo="$REPO_DIR" --install-deps-from=flathub --user "$BUILD_DIR" flatpak/manifest.json
          flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo "$REPO_DIR" subx.flatpak im.chenj.subx
      - name: Attest build provenance
        uses: actions/attest-build-provenance@v3
        with:
          subject-path: subx.flatpak
      - name: Upload to draft release
        if: github.event_name == 'push'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        shell: bash
        run: |
          TAG="v${{ needs.prepare.outputs.version }}"
          gh release upload "$TAG" subx.flatpak --clobber
      - name: Upload workflow artifact
        if: github.event_name == 'workflow_dispatch'
        uses: actions/upload-artifact@v6
        with:
          name: subx.flatpak
          path: subx.flatpak
```

## Risks / Trade-offs

- [Pinned toolchain drifts from the floating `@stable` used by the other release jobs] → the flatpak job pins `1.97.1` while the matrix jobs use `dtolnay/rust-toolchain@stable`. Upgrading the pinned toolchain is an explicit release-maintenance step (bump the manifest + this design).
- [The GNOME Platform + WebKit extension are not yet proven to satisfy Tauri's WebKitGTK build requirements] → verified by the first `workflow_dispatch` dry run (task 4.3); if the WebKit extension or a dev package is missing, add a manifest module that builds/installs the missing libraries into `/app`.
- [The `.flatpak` artifact is not meaningfully validated] → optional smoke test (duck finding, deferred): `flatpak install --user subx.flatpak` then `xvfb-run -a timeout 30 flatpak run im.chenj.subx` (headless runner needs Xvfb; plain `flatpak run` can hang without a display).
- [End-user install prerequisite] → a downloaded bundle references `org.gnome.Platform//50`; the bundle is emitted with `--runtime-repo` pointing at the Flathub repo, so a user with the Flathub remote can install it directly. Users without any Flatpak remote still need to add the Flathub remote first. Mitigation: document the prerequisite in the release-notes footer (follow-up, out of scope for this pipeline change).
- [Draft release re-run] → `gh release upload --clobber` replaces the existing `subx.flatpak` asset instead of creating a duplicate.
- [`post-install` cwd / build-user home are not fully specified in the docs] → the build uses the documented `FLATPAK_BUILDER_BUILDDIR` env var instead of `$HOME`; verify on the first CI run (task 1.3 doubles as the probe).
- [Trade-off: single pipeline vs new workflow] → one `release.yml` keeps one draft release per tag; cost is a longer file and one more job.

## Migration Plan

CI-only change: no deployment or rollback concerns. Rollback = revert the `build-flatpak` job, `flatpak/` directory, and the spec delta. The five-target matrix and `prepare` job are untouched except for the one-line `version` output fix.

## Open Questions

1. Whether the pinned Rust toolchain (1.97.1) and `org.gnome.Platform//50` + `org.gnome.Sdk//50` (which ship WebKitGTK 4.1) cover every native library Tauri/WebKitGTK needs — validated by the `workflow_dispatch` dry run (task 4.3).
2. Exact `flatpak-builder` invocation on a clean `ubuntu-24.04` runner (user remote added, `--install-deps-from=flathub`, `--user`): confirm the GNOME Platform/SDK 50 install into the user installation correctly; the dry run validates end-to-end.
