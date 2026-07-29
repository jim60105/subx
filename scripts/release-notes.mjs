#!/usr/bin/env node
/**
 * Release notes renderer script.
 *
 * Extracts the version section from `CHANGELOG.md` and appends
 * `.github/release-notes-footer.md`. Exits non-zero if the version section is missing.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Extract the section for a given version from changelog content.
 *
 * @param {string} changelogContent
 * @param {string} rawVersion
 * @returns {string | null}
 */
export function extractChangelogSection(changelogContent, rawVersion) {
  if (!changelogContent || !rawVersion) {
    return null;
  }

  const version = rawVersion.replace(/^v/, "");
  const lines = changelogContent.split(/\r?\n/);
  const escapedVer = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRegex = new RegExp(`^##\\s+\\[?v?${escapedVer}\\]?(?:\\s+.*)?$`, "i");

  let startIndex = -1;
  let endIndex = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    if (headerRegex.test(lines[i].trim())) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    return null;
  }

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i].trim())) {
      endIndex = i;
      break;
    }
  }

  const sectionLines = lines.slice(startIndex, endIndex);
  return sectionLines.join("\n").trim();
}

/**
 * Render the full release notes for a version.
 *
 * @param {string} rawVersion
 * @param {{ changelogPath?: string; footerPath?: string }} [options]
 * @returns {string}
 */
export function renderReleaseNotes(rawVersion, options = {}) {
  if (!rawVersion) {
    throw new Error("Version argument is required");
  }

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const changelogPath = options.changelogPath ?? path.join(rootDir, "CHANGELOG.md");
  const footerPath =
    options.footerPath ?? path.join(rootDir, ".github", "release-notes-footer.md");

  if (!fs.existsSync(changelogPath)) {
    throw new Error(`CHANGELOG.md not found at ${changelogPath}`);
  }
  if (!fs.existsSync(footerPath)) {
    throw new Error(`Release notes footer not found at ${footerPath}`);
  }

  const changelogContent = fs.readFileSync(changelogPath, "utf8");
  const footerContent = fs.readFileSync(footerPath, "utf8");

  const section = extractChangelogSection(changelogContent, rawVersion);
  if (!section) {
    throw new Error(`No section found for version "${rawVersion}" in CHANGELOG.md`);
  }

  return `${section}\n\n${footerContent.trim()}\n`;
}

/**
 * CLI runner for release-notes script.
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
  const version = argv[0];
  if (!version) {
    stderr("release-notes error: Version argument is required");
    return 1;
  }

  try {
    const notes = renderReleaseNotes(version);
    stdout(notes.trimEnd());
    return 0;
  } catch (error) {
    stderr(`release-notes error: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run());
}
