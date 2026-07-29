#!/usr/bin/env node
/**
 * Release tag verification script.
 *
 * Verifies that the provided release tag matches 'v' + package.json version.
 * Exits non-zero and names both the tag and the package version if they disagree.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Check if tag matches 'v' + package.json version.
 *
 * @param {string} tag
 * @param {{ packageJsonPath?: string }} [options]
 * @returns {{ valid: boolean; tag: string; expectedTag: string; version: string }}
 */
export function checkReleaseTag(tag, options = {}) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const pkgPath = options.packageJsonPath ?? path.join(rootDir, "package.json");

  if (!fs.existsSync(pkgPath)) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const version = pkg.version;
  if (!version) {
    throw new Error(`package.json at ${pkgPath} does not have a valid "version" field`);
  }

  const expectedTag = `v${version}`;
  const valid = tag === expectedTag;

  return { valid, tag, expectedTag, version };
}

/**
 * CLI runner for check-release-tag script.
 *
 * @param {string[]} [argv]
 * @param {(output: string) => void} [stdout]
 * @param {(output: string) => void} [stderr]
 * @returns {number}
 */
export function run(
  argv = process.argv.slice(2),
  stdout = console.log,
  stderr = console.error,
) {
  const tag = argv[0];
  if (!tag) {
    stderr("check-release-tag error: Tag argument is required");
    return 1;
  }

  try {
    const result = checkReleaseTag(tag);
    if (!result.valid) {
      stderr(
        `check-release-tag error: Release tag "${result.tag}" disagrees with declared version "${result.version}" in package.json (expected "${result.expectedTag}")`,
      );
      return 1;
    }
    stdout(
      `check-release-tag: Release tag "${result.tag}" matches declared version "${result.version}" in package.json`,
    );
    return 0;
  } catch (error) {
    stderr(`check-release-tag error: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run());
}
