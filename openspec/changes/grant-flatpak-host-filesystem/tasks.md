# Tasks

## 1. Manifest permission and its test

- [x] 1.1 Edit `flatpak/manifest.json`: append exactly two strings to the `finish-args` array, after `"--socket=x11"`, in this order: `"--filesystem=host"`, `"--filesystem=xdg-run/gvfs"`. Change nothing else in the file. Verify: `node -e "const a=require('./flatpak/manifest.json')['finish-args']; if(a.length!==6||a[4]!=='--filesystem=host'||a[5]!=='--filesystem=xdg-run/gvfs') process.exit(1)"` exits 0.
- [x] 1.2 Sync the delta into the main spec: append the requirement block `### Requirement: The Flatpak bundle is granted host file access` and its scenario from `openspec/changes/grant-flatpak-host-filesystem/specs/release-pipeline/spec.md` to the end of `openspec/specs/release-pipeline/spec.md`, text unchanged; the file currently ends with the scenario `The bundle carries build provenance`, so the new block goes after it (repo precedent: the main spec is synced during apply and the archive step uses `--skip-specs`). Verify: `npm run spec:trace -- --report` lists scenario id `release-pipeline/the-flatpak-bundle-is-granted-host-file-access#the-manifest-declares-host-and-gvfs-file-access`. If the reported id differs, use the reported id in 1.3.
- [x] 1.3 In `scripts/release-config.test.ts`, inside `describe("release workflow flatpak bundle", ...)`, add the test given verbatim in design.md D3 directly after the test `declares the GNOME 50 runtime and a pinned Rust toolchain in the manifest`, including its `// @covers` line. Do not modify any existing test. Verify: `npx vitest run scripts/release-config.test.ts` passes, and temporarily removing `"--filesystem=host"` from the manifest makes the new test fail (restore the manifest afterwards).

## 2. Documentation

- [x] 2.1 `README.md`: in `## Download`, add a fourth bullet after the Windows bullet: `- **Linux Flatpak (x86_64)**: a \`subx.flatpak\` bundle; install it with \`flatpak install ./subx.flatpak\` (requires the Flathub remote for the GNOME runtime).` In `### System Requirements & Installation Caveats`, add this paragraph directly after the `glibc` paragraph: `The Flatpak bundle is granted read-write access to the host filesystem (\`--filesystem=host\`) and to the directory where file managers place network mounts (\`--filesystem=xdg-run/gvfs\`). SubX renames and creates subtitle files next to your media, which a sandboxed single-file grant cannot do safely. If you revoke this permission (for example with Flatseal or \`flatpak override\`), add whole folders to SubX instead of individual files.` Verify: `grep -c "filesystem=host" README.md` prints `1`.
- [x] 2.2 `README.zh-TW.md`: mirror 2.1. Bullet after the Windows bullet in `## 下載`: `- **Linux Flatpak (x86_64)** — \`subx.flatpak\` 套件，以 \`flatpak install ./subx.flatpak\` 安裝（需要 Flathub 遠端來源提供 GNOME 執行環境）。` Paragraph directly after the `glibc` paragraph in `### 系統需求與安裝說明`: `Flatpak 套件具有主機檔案系統（\`--filesystem=host\`）與檔案管理員放置網路掛載的目錄（\`--filesystem=xdg-run/gvfs\`）的讀寫權限。SubX 會在媒體檔案旁重新命名與建立字幕檔，沙箱的單一檔案授權無法安全完成這類操作。若你撤銷此權限（例如透過 Flatseal 或 \`flatpak override\`），請將整個資料夾加入 SubX，不要加入個別檔案。` Verify: `grep -c "filesystem=host" README.zh-TW.md` prints `1`.
- [x] 2.3 `docs/verification.md`: insert the section given verbatim in design.md D4 immediately before the `## Adding a feature` heading. Do not edit the `## Waivers` section or `scripts/spec-coverage.config.json`. Verify: `grep -n "^## Manual Flatpak file-access check" docs/verification.md` prints one line whose line number is lower than that of `## Adding a feature`.

## 3. Integration check

- [x] 3.1 Run `npm run verify` and confirm it exits 0 (covers `tsc`, both coverage gates, `spec:trace` with zero unverified scenarios and zero dangling annotations, `bindings:check`, `icons:check`).

## Workflow follow-up

- Archive with `openspec archive grant-flatpak-host-filesystem --skip-specs` (the main spec is already synced in 1.2).
- Before the next release is published, a maintainer runs `docs/verification.md` "Manual Flatpak file-access check" against the built bundle and reviews the README wording. This is human review, not part of `npm run verify`.
