import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkReleaseTag, run } from "./check-release-tag.mjs";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "check-release-tag-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixturePackageJson(version: string) {
  const pkgPath = path.join(tmpDir, "package.json");
  fs.writeFileSync(pkgPath, JSON.stringify({ name: "subx", version }));
  return pkgPath;
}

describe("check-release-tag", () => {
  // @covers release-pipeline/the-released-version-is-declared-once#a-tag-that-disagrees-with-the-declared-version-aborts-the-release
  it("aborts the release and names both tag and declared version when tag disagrees", () => {
    const packageJsonPath = writeFixturePackageJson("0.1.0");

    // Check with mismatched tag
    const resultMismatch = checkReleaseTag("v0.2.0", { packageJsonPath });
    expect(resultMismatch.valid).toBe(false);
    expect(resultMismatch.tag).toBe("v0.2.0");
    expect(resultMismatch.version).toBe("0.1.0");
    expect(resultMismatch.expectedTag).toBe("v0.1.0");

    // Check with malformed tag
    const resultMalformed = checkReleaseTag("0.1.0", { packageJsonPath });
    expect(resultMalformed.valid).toBe(false);
    expect(resultMalformed.tag).toBe("0.1.0");
    expect(resultMalformed.version).toBe("0.1.0");

    // Test CLI run function output and exit code for mismatch
    const out: string[] = [];
    const err: string[] = [];

    const exitCode = run(
      ["v0.2.0"],
      (msg) => out.push(msg),
      (msg) => err.push(msg),
    );

    expect(exitCode).toBe(1);
    const errText = err.join("\n");
    expect(errText).toContain("v0.2.0");
    expect(errText).toContain("0.1.0");
    expect(errText).toContain("check-release-tag error");
  });

  it("passes when tag matches 'v' + declared package.json version", () => {
    const packageJsonPath = writeFixturePackageJson("0.1.0");

    const result = checkReleaseTag("v0.1.0", { packageJsonPath });
    expect(result.valid).toBe(true);
    expect(result.tag).toBe("v0.1.0");
    expect(result.version).toBe("0.1.0");

    const out: string[] = [];
    const err: string[] = [];
    const exitCode = run(
      ["v0.1.0"],
      (msg) => out.push(msg),
      (msg) => err.push(msg),
    );

    expect(exitCode).toBe(0);
    expect(out.join("\n")).toContain("v0.1.0");
    expect(out.join("\n")).toContain("0.1.0");
    expect(err).toHaveLength(0);
  });

  describe("checkReleaseTag edge cases", () => {
    it("throws if package.json does not exist", () => {
      const missingPkgPath = path.join(tmpDir, "non-existent-package.json");
      expect(() =>
        checkReleaseTag("v0.1.0", { packageJsonPath: missingPkgPath }),
      ).toThrow(/package.json not found/);
    });

    it("throws if package.json does not have a version field", () => {
      const invalidPkgPath = path.join(tmpDir, "invalid-package.json");
      fs.writeFileSync(invalidPkgPath, JSON.stringify({ name: "subx" }));
      expect(() =>
        checkReleaseTag("v0.1.0", { packageJsonPath: invalidPkgPath }),
      ).toThrow(/does not have a valid "version" field/);
    });
  });

  describe("run CLI handler edge cases", () => {
    it("returns 1 if tag argument is missing", () => {
      const err: string[] = [];
      const code = run([], () => {}, (msg) => err.push(msg));
      expect(code).toBe(1);
      expect(err.join("\n")).toContain("Tag argument is required");
    });
  });
});
