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
