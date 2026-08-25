/**
 * Release workflow configuration assertions (design D10).
 *
 * Checks that .github/workflows/release.yml is correctly armed and configured:
 * - Triggers on version tags and manual dispatch, but NOT on branch pushes.
 * - Build matrix covers all 5 desktop targets with pinned runners and fail-fast: false.
 * - Draft release is created once in prepare job before build jobs run, and never published.
 * - Build jobs upload artifacts into the prepared release and generate build-provenance attestations.
 * - Only regular files are submitted to provenance attestation.
 * - Top-level permissions are empty, and minimal permissions are granted per-job.
 * - No signing secrets are referenced (only GITHUB_TOKEN).
 * - No updater JSON is published.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW_PATH = path.resolve(__dirname, "..", ".github", "workflows", "release.yml");
const WORKFLOW_RAW = fs.readFileSync(WORKFLOW_PATH, "utf8");
const MANIFEST_PATH = path.resolve(__dirname, "..", "flatpak", "manifest.json");
const MANIFEST_RAW = fs.readFileSync(MANIFEST_PATH, "utf8");
const METAINFO_PATH = path.resolve(__dirname, "..", "flatpak", "subx.metainfo.xml");
const METAINFO_RAW = fs.readFileSync(METAINFO_PATH, "utf8");

// The Flatpak assertions are scoped to the build-flatpak job block so a
// matching fragment in another job (or comment) cannot satisfy them.
function flatpakJobRaw(): string {
  const match = WORKFLOW_RAW.match(/build-flatpak:([\s\S]*$)/);
  expect(match, "build-flatpak job must be present").not.toBeNull();
  return match![1];
}

describe("release workflow trigger configuration", () => {
  // @covers release-pipeline/releases-are-cut-from-version-tags-and-from-nothing-else#a-version-tag-starts-the-release
  it("starts the release when a version tag matching v* is pushed", () => {
    expect(WORKFLOW_RAW).toMatch(/on:\s*[\s\S]*?push:\s*[\s\S]*?tags:\s*[\s\S]*?-\s*['"]v\*['"]/);
  });

  // @covers release-pipeline/releases-are-cut-from-version-tags-and-from-nothing-else#a-branch-push-does-not-start-a-release
  it("does not start a release on branch pushes", () => {
    // The push trigger must filter on tags only and contain no branches filter.
    const pushBlockMatch = WORKFLOW_RAW.match(/push:\s*([\s\S]*?)(?=\n\s*(?:workflow_dispatch|permissions|jobs|$))/);
    expect(pushBlockMatch, "push trigger must be present").not.toBeNull();
    const pushBlock = pushBlockMatch![1];
    expect(pushBlock).toContain("tags:");
    expect(pushBlock).not.toContain("branches:");
  });

  // @covers release-pipeline/releases-are-cut-from-version-tags-and-from-nothing-else#a-manual-dispatch-builds-every-target-and-publishes-nothing
  it("supports manual workflow_dispatch with prepare job gated on event_name", () => {
    expect(WORKFLOW_RAW).toMatch(/workflow_dispatch:/);
    // prepare job must be gated strictly on github.event_name == 'push'
    const prepareIf = WORKFLOW_RAW.match(/prepare:[\s\S]*?if:\s*(.*)/);
    expect(prepareIf, "prepare job must have an if condition").not.toBeNull();
    expect(prepareIf![1]).toContain("github.event_name == 'push'");
    // No ref-based test (e.g. refs/tags/) used for the prepare gate
    expect(prepareIf![1]).not.toMatch(/refs\/tags\//);
  });

  it("preflight wiring: prepare checks release tag script, build depends on prepare with success or skipped", () => {
    expect(WORKFLOW_RAW).toMatch(/node scripts\/check-release-tag\.mjs/);
    const buildIf = WORKFLOW_RAW.match(/build:[\s\S]*?if:\s*(.*)/);
    expect(buildIf, "build job must have an if condition").not.toBeNull();
    expect(buildIf![1]).toContain("needs.prepare.result == 'success' || needs.prepare.result == 'skipped'");
  });
});

describe("release workflow build matrix and environment pinning", () => {
  // @covers release-pipeline/every-supported-desktop-target-is-built-from-a-pinned-environment#the-matrix-covers-every-supported-target
  it("covers all 5 supported desktop targets in the matrix", () => {
    const requiredTargets = [
      "aarch64-apple-darwin",
      "x86_64-apple-darwin",
      "x86_64-unknown-linux-gnu",
      "aarch64-unknown-linux-gnu",
      "x86_64-pc-windows-msvc",
    ];
    for (const target of requiredTargets) {
      expect(WORKFLOW_RAW, `matrix target ${target}`).toContain(target);
    }
  });

  // @covers release-pipeline/every-supported-desktop-target-is-built-from-a-pinned-environment#build-environments-are-pinned-not-floating
  it("pins build environment runner labels with no floating -latest labels", () => {
    expect(WORKFLOW_RAW).not.toMatch(/-latest/);
    const pinnedRunners = ["ubuntu-24.04", "ubuntu-24.04-arm", "macos-15", "windows-2025"];
    for (const runner of pinnedRunners) {
      expect(WORKFLOW_RAW, `runner label ${runner}`).toContain(runner);
    }
  });

  // @covers release-pipeline/every-supported-desktop-target-is-built-from-a-pinned-environment#one-target-s-failure-does-not-abandon-the-others
  it("configures fail-fast: false so one target failure does not abandon others", () => {
    expect(WORKFLOW_RAW).toMatch(/fail-fast:\s*false/);
  });
});

describe("release assembly and privacy", () => {
  // @covers release-pipeline/a-release-is-assembled-privately-and-published-by-a-person#the-draft-is-created-once-before-any-build
  it("creates the draft release once in prepare job before build jobs run", () => {
    const buildJobMatch = WORKFLOW_RAW.match(/build:[\s\S]*?needs:\s*(.*)/);
    expect(buildJobMatch, "build job must state needs").not.toBeNull();
    expect(buildJobMatch![1]).toContain("prepare");
  });

  // @covers release-pipeline/a-release-is-assembled-privately-and-published-by-a-person#build-jobs-upload-into-the-prepared-release
  it("build jobs upload into the prepared release using releaseId output", () => {
    expect(WORKFLOW_RAW).toMatch(/releaseId:\s*\$\{\{\s*needs\.prepare\.outputs\.release_id\s*\}\}/);
    // tauri-action in build job must not set tagName or releaseName
    const tauriStepMatch = WORKFLOW_RAW.match(/uses:\s*tauri-apps\/tauri-action@v1[\s\S]*?(?=\n\s*-\s|\n\s*name:|$)/);
    expect(tauriStepMatch, "tauri-action step must be present").not.toBeNull();
    const tauriStep = tauriStepMatch![0];
    expect(tauriStep).not.toMatch(/tagName:/);
    expect(tauriStep).not.toMatch(/releaseName:/);
  });

  // @covers release-pipeline/a-release-is-assembled-privately-and-published-by-a-person#the-workflow-never-publishes
  it("creates draft releases and never automatically publishes them", () => {
    expect(WORKFLOW_RAW).toMatch(/-F draft=true/);
    expect(WORKFLOW_RAW).toMatch(/releaseDraft:\s*true/);
    expect(WORKFLOW_RAW).not.toMatch(/-F draft=false/);
    expect(WORKFLOW_RAW).not.toMatch(/releaseDraft:\s*false/);
  });

  // @covers release-pipeline/a-release-is-assembled-privately-and-published-by-a-person#a-re-run-reuses-the-existing-release
  it("checks for existing release for the tag and reuses it on re-run", () => {
    expect(WORKFLOW_RAW).toMatch(/gh api "repos\/\$\{\{ github\.repository \}\}\/releases\/tags\/\$\{TAG\}"/);
    expect(WORKFLOW_RAW).toMatch(/if \[ -z "\$RELEASE_ID" \]; then/);
  });
});

describe("build provenance and permissions", () => {
  // @covers release-pipeline/every-published-file-carries-verifiable-build-provenance#each-build-job-attests-the-files-it-produced
  it("attests build provenance for generated files using attest-build-provenance action", () => {
    expect(WORKFLOW_RAW).toMatch(/uses:\s*actions\/attest-build-provenance@v3/);
  });

  // @covers release-pipeline/every-published-file-carries-verifiable-build-provenance#only-regular-files-are-submitted-as-subjects
  it("filters build outputs to regular files before passing to attestation action", () => {
    expect(WORKFLOW_RAW).toMatch(/if \[ -f "\$item" \]/);
  });

  // @covers release-pipeline/every-published-file-carries-verifiable-build-provenance#permissions-are-granted-per-job-not-workflow-wide
  it("grants minimal permissions per job with empty top-level permissions", () => {
    expect(WORKFLOW_RAW).toMatch(/^permissions:\s*\{\}\s*$/m);

    const preparePermissions = WORKFLOW_RAW.match(/prepare:[\s\S]*?permissions:[\s\S]*?contents:\s*write/);
    expect(preparePermissions, "prepare job must have permissions.contents: write").not.toBeNull();

    const buildPermissions = WORKFLOW_RAW.match(/build:[\s\S]*?permissions:[\s\S]*?id-token:\s*write/);
    expect(buildPermissions, "build job must have id-token: write").not.toBeNull();
    expect(WORKFLOW_RAW).toMatch(/attestations:\s*write/);
  });
});

describe("unsigned distribution caveats and configuration", () => {
  // @covers release-pipeline/distribution-is-unsigned-and-every-release-says-so#the-workflow-needs-no-signing-secrets
  it("requires no signing secrets and references only GITHUB_TOKEN", () => {
    const secretMatches = [...WORKFLOW_RAW.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
    for (const secret of secretMatches) {
      expect(secret, "referenced secret").toBe("GITHUB_TOKEN");
    }
    expect(WORKFLOW_RAW).not.toMatch(/APPLE_CERTIFICATE/);
    expect(WORKFLOW_RAW).not.toMatch(/TAURI_SIGNING_PRIVATE_KEY/);
  });

  // @covers release-pipeline/distribution-is-unsigned-and-every-release-says-so#no-update-endpoint-is-published
  it("disables updater manifest publishing with uploadUpdaterJson: false", () => {
    expect(WORKFLOW_RAW).toMatch(/uploadUpdaterJson:\s*false/);
  });

  it("ensures all shared run steps explicitly declare shell: bash", () => {
    const stepsWithRun = WORKFLOW_RAW.match(/- name:[\s\S]*?run:[\s\S]*?(?=\n\s*-|\n\s*jobs:|$)/g) || [];
    expect(stepsWithRun.length).toBeGreaterThan(0);
    for (const step of stepsWithRun) {
      expect(step, "step with run must declare shell: bash").toMatch(/shell:\s*bash/);
    }
  });
});

describe("release workflow flatpak bundle", () => {
  it("uses AppStream-compatible license, icon, and launchable metadata", () => {
    expect(METAINFO_RAW).toContain("<metadata_license>CC0-1.0</metadata_license>");
    expect(METAINFO_RAW).toContain("<project_license>GPL-3.0-or-later</project_license>");
    expect(METAINFO_RAW).toContain('<icon type="stock">im.chenj.subx</icon>');
    expect(METAINFO_RAW).toContain('<launchable type="desktop-id">im.chenj.subx.desktop</launchable>');
    expect(METAINFO_RAW).not.toMatch(/<license>/);
  });

  // @covers release-pipeline/releases-include-a-linux-flatpak-bundle#a-flatpak-bundle-is-published-with-every-release
  it("builds and publishes a flatpak bundle with every tag release", () => {
    const job = flatpakJobRaw();
    // --user: the non-root runner user cannot deploy into the root-owned system installation.
    expect(job).toMatch(/flatpak-builder --repo=.*--install-deps-from=flathub --user/);
    expect(job).toMatch(/flatpak build-bundle --runtime-repo=https:\/\/dl\.flathub\.org\/repo\/flathub\.flatpakrepo "\$REPO_DIR" subx\.flatpak im\.chenj\.subx/);
    expect(job).toMatch(/gh release upload "\$TAG" subx\.flatpak --clobber/);
  });

  // @covers release-pipeline/releases-include-a-linux-flatpak-bundle#a-manual-dispatch-keeps-the-bundle-as-an-artifact
  it("keeps the flatpak bundle as a workflow artifact on manual dispatch", () => {
    const job = flatpakJobRaw();
    const artifactStep = job.match(/- name: Upload workflow artifact[\s\S]*?(?=\n\s*- name:|$)/);
    expect(artifactStep, "upload-artifact step must be present").not.toBeNull();
    expect(artifactStep![0]).toMatch(/if:\s*github\.event_name == 'workflow_dispatch'/);
    expect(artifactStep![0]).toMatch(/uses:\s*actions\/upload-artifact@v6/);
    expect(artifactStep![0]).toContain("subx.flatpak");
  });

  // @covers release-pipeline/releases-include-a-linux-flatpak-bundle#the-bundle-is-built-in-a-sandbox-with-its-own-runtime
  it("declares the GNOME 50 runtime and a pinned Rust toolchain in the manifest", () => {
    const manifest = JSON.parse(MANIFEST_RAW);
    expect(manifest["app-id"]).toBe("im.chenj.subx");
    expect(manifest.runtime).toBe("org.gnome.Platform");
    expect(manifest["runtime-version"]).toBe("50");
    // WebKitGTK 4.1 ships inside org.gnome.Platform/Sdk 50, so no WebKit extension is declared.
    expect(manifest["runtime-extensions"]).toBeUndefined();
    expect(manifest.sdk).toBe("org.gnome.Sdk");
    expect(manifest["build-options"]["build-args"]).toContain("--share=network");
    expect(manifest.modules[0]["build-commands"][0]).toContain("--default-toolchain 1.97.1");
  });

  it("verifies the required GNOME runtime refs exist in the flathub remote before building", () => {
    const job = flatpakJobRaw();
    expect(job).toMatch(/flatpak --user remote-info flathub org\.gnome\.Platform\/\/50/);
    expect(job).toMatch(/flatpak --user remote-info flathub org\.gnome\.Sdk\/\/50/);
  });

  // @covers release-pipeline/releases-include-a-linux-flatpak-bundle#a-re-run-replaces-the-bundle-asset
  it("replaces the existing subx.flatpak asset on re-run", () => {
    const job = flatpakJobRaw();
    const uploadStep = job.match(/- name: Upload to draft release[\s\S]*?--clobber/);
    expect(uploadStep, "upload step must use --clobber").not.toBeNull();
  });

  // @covers release-pipeline/releases-include-a-linux-flatpak-bundle#the-bundle-carries-build-provenance
  it("attests the flatpak bundle with build provenance", () => {
    const job = flatpakJobRaw();
    expect(job).toMatch(/uses:\s*actions\/attest-build-provenance@v3[\s\S]*?subject-path:\s*subx\.flatpak/);
  });
});
