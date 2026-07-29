import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  extractChangelogSection,
  renderReleaseNotes,
  run,
} from "./release-notes.mjs";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "release-notes-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const FIXTURE_CHANGELOG = `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
- Feature in progress

## [0.2.0] - 2026-08-01
### Added
- Feature 2.0 implementation
- Secondary feature 2.0

## [0.1.0] - 2026-07-29
### Added
- Initial release of SubX desktop GUI application.
- Subtitle matching wizard with video pairing.

## [0.0.9] - 2026-07-15
### Added
- Alpha preview build.
`;

const FIXTURE_FOOTER = `## Installation Notes & Security Caveats

This release is distributed without Apple Developer or Windows Authenticode code-signing signatures.

### Linux Compatibility Floor
- Built against **glibc 2.39** (Ubuntu 24.04+, Debian 13+, Fedora 40+).

### macOS Security Gatekeeper
- Remove quarantine attribute: \`xattr -dr com.apple.quarantine /Applications/SubX.app\`

### Windows SmartScreen
- Click **More info**, then select **Run anyway**.

### Verifying Build Provenance
- Verify build provenance with \`gh attestation verify <file> --repo jim60105/subx\`
`;

describe("release-notes", () => {
  // @covers release-pipeline/release-notes-are-written-by-a-maintainer-not-generated-from-commits#the-notes-are-the-changelog-section-for-the-version
  it("extracts the exact changelog section for the requested version without neighbouring version leak", () => {
    const changelogPath = path.join(tmpDir, "CHANGELOG.md");
    const footerPath = path.join(tmpDir, "footer.md");
    fs.writeFileSync(changelogPath, FIXTURE_CHANGELOG);
    fs.writeFileSync(footerPath, FIXTURE_FOOTER);

    const notes = renderReleaseNotes("0.1.0", { changelogPath, footerPath });

    expect(notes).toContain("## [0.1.0] - 2026-07-29");
    expect(notes).toContain("Initial release of SubX desktop GUI application.");
    expect(notes).toContain("Subtitle matching wizard with video pairing.");

    // Assert neighbouring versions do not leak into output
    expect(notes).not.toContain("Feature 2.0 implementation");
    expect(notes).not.toContain("## [0.2.0]");
    expect(notes).not.toContain("## [0.0.9]");
    expect(notes).not.toContain("Alpha preview build");
    expect(notes).not.toContain("Feature in progress");
  });

  // @covers release-pipeline/release-notes-are-written-by-a-maintainer-not-generated-from-commits#a-version-with-no-changelog-section-aborts-the-release
  it("aborts with non-zero exit code and names the missing version when changelog section is missing", () => {
    const changelogPath = path.join(tmpDir, "CHANGELOG.md");
    const footerPath = path.join(tmpDir, "footer.md");
    fs.writeFileSync(changelogPath, FIXTURE_CHANGELOG);
    fs.writeFileSync(footerPath, FIXTURE_FOOTER);

    const out: string[] = [];
    const err: string[] = [];

    // Directly test renderReleaseNotes error
    expect(() =>
      renderReleaseNotes("0.3.0", { changelogPath, footerPath }),
    ).toThrow(/No section found for version "0.3.0"/);

    // Test CLI run function
    const exitCode = run(
      ["v0.3.0"],
      (line: string) => out.push(line),
      (line: string) => err.push(line),
    );

    expect(exitCode).toBe(1);
    expect(err.join("\n")).toMatch(/0\.3\.0/);
    expect(err.join("\n")).toMatch(/release-notes error/);
  });

  // @covers release-pipeline/distribution-is-unsigned-and-every-release-says-so#the-release-body-carries-the-installation-caveats
  it("carries all required installation caveats in the release body footer", () => {
    const notes = renderReleaseNotes("0.1.0");

    // Linux glibc floor
    expect(notes).toContain("glibc 2.39");
    // macOS quarantine removal
    expect(notes).toMatch(/xattr\s+-d/);
    // Windows SmartScreen
    expect(notes).toContain("SmartScreen");
    expect(notes).toContain("More info");
    expect(notes).toContain("Run anyway");
    // gh attestation verify
    expect(notes).toContain("gh attestation verify");
    expect(notes).toContain("jim60105/subx");
  });

  describe("extractChangelogSection edge cases", () => {
    it("returns null for empty content or version", () => {
      expect(extractChangelogSection("", "0.1.0")).toBeNull();
      expect(extractChangelogSection("content", "")).toBeNull();
    });

    it("handles version with or without 'v' prefix", () => {
      const section1 = extractChangelogSection(FIXTURE_CHANGELOG, "v0.1.0");
      const section2 = extractChangelogSection(FIXTURE_CHANGELOG, "0.1.0");
      expect(section1).not.toBeNull();
      expect(section1).toBe(section2);
    });
  });

  describe("renderReleaseNotes edge cases", () => {
    it("throws if rawVersion is missing", () => {
      expect(() => renderReleaseNotes("")).toThrow("Version argument is required");
    });

    it("throws if CHANGELOG.md does not exist", () => {
      const nonExistentPath = path.join(tmpDir, "missing-changelog.md");
      expect(() =>
        renderReleaseNotes("0.1.0", { changelogPath: nonExistentPath }),
      ).toThrow(/CHANGELOG.md not found/);
    });

    it("throws if footer file does not exist", () => {
      const changelogPath = path.join(tmpDir, "CHANGELOG.md");
      const nonExistentFooter = path.join(tmpDir, "missing-footer.md");
      fs.writeFileSync(changelogPath, FIXTURE_CHANGELOG);
      expect(() =>
        renderReleaseNotes("0.1.0", {
          changelogPath,
          footerPath: nonExistentFooter,
        }),
      ).toThrow(/Release notes footer not found/);
    });
  });

  describe("run CLI handler", () => {
    it("returns 1 if version argument is missing", () => {
      const err: string[] = [];
      const code = run([], () => {}, (msg) => err.push(msg));
      expect(code).toBe(1);
      expect(err.join("\n")).toContain("Version argument is required");
    });

    it("returns 0 and prints notes for valid version", () => {
      const out: string[] = [];
      const code = run(["0.1.0"], (msg) => out.push(msg), () => {});
      expect(code).toBe(0);
      expect(out.join("\n")).toContain("Initial release of SubX desktop GUI application");
    });
  });
});
