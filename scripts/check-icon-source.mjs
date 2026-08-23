#!/usr/bin/env node
/**
 * Icon staleness gate.
 *
 * Recomputes the SHA-256 of each hand-authored icon source and compares it
 * against the generation record `icons:generate` wrote alongside the output
 * (`src-tauri/icons/.icon-source.json`). Exits non-zero, naming the offending
 * file, when a source was edited without regenerating — the same shape of
 * promise `bindings:check` makes for generated IPC bindings (design.md D5).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ICONS_DIR, RECORD_FILENAME, sha256File } from "./generate-icons.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Check the committed icon sources against the generation record.
 *
 * @param {{ recordPath?: string; rootDir?: string }} [options]
 * @returns {{ ok: boolean; problems: string[] }}
 */
export function checkIconSource(options = {}) {
  const rootDir = options.rootDir ?? ROOT;
  const recordPath = options.recordPath ?? path.join(ICONS_DIR, RECORD_FILENAME);

  if (!fs.existsSync(recordPath)) {
    return {
      ok: false,
      problems: [`generation record not found at ${recordPath}; run "npm run icons:generate"`],
    };
  }

  /** @type {import('./generate-icons.d.mts').GenerationRecord} */
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const problems = [];

  for (const key of ["master", "macos"]) {
    const source = record.sources?.[key];
    if (!source) {
      problems.push(`generation record at ${recordPath} is missing an entry for the "${key}" source`);
      continue;
    }

    const sourcePath = path.join(rootDir, source.path);
    if (!fs.existsSync(sourcePath)) {
      problems.push(`${source.path} no longer exists but is recorded as an icon source`);
      continue;
    }

    const actual = sha256File(sourcePath);
    if (actual !== source.sha256) {
      problems.push(
        `${source.path} has drifted from the generation record ` +
          `(recorded ${source.sha256}, actual ${actual}); run "npm run icons:generate"`,
      );
    }
  }

  // `icon.icns` cannot be re-hashed (it is not byte-reproducible between
  // runs), so this only checks that every slot the record claims to have
  // produced is still present — it catches a generated file being deleted, or
  // a future tauri-cli version silently dropping an output slot, without
  // depending on output-content reproducibility.
  const iconsDir = path.dirname(recordPath);
  for (const slot of Object.keys(record.outputs ?? {})) {
    if (!fs.existsSync(path.join(iconsDir, slot))) {
      problems.push(`${slot} is recorded as generated output but is missing from ${iconsDir}`);
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * CLI runner for check-icon-source script.
 *
 * @param {(output: string) => void} [stdout]
 * @param {(output: string) => void} [stderr]
 * @param {Parameters<typeof checkIconSource>[0]} [options]
 * @returns {number}
 */
export function run(stdout = console.log, stderr = console.error, options = {}) {
  const { ok, problems } = checkIconSource(options);
  if (!ok) {
    for (const problem of problems) {
      stderr(`check-icon-source error: ${problem}`);
    }
    return 1;
  }
  stdout("check-icon-source: generated icons are in sync with their sources");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run());
}
