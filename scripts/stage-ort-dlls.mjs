#!/usr/bin/env node
/**
 * Windows bundle staging for onnxruntime's native DLLs.
 *
 * `ort-sys` 2.0.0-rc.10 (pinned by `voice_activity_detector`) copies its
 * downloaded DLLs into `OUT_DIR.ancestors().nth(3)`. Before Cargo 1.100 that
 * resolved to the profile directory beside the executable; the current layout
 * (`build/<crate>/<hash>/out`) resolves it to `<profile>/build` instead. The
 * MSI bundler only collects `*.dll` from the profile directory, so the copies
 * have to move up one level before bundling. Runs as
 * `build.beforeBundleCommand`; every non-Windows target is a no-op.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Copy the DLLs `ort-sys` staged under `<profile>/build` next to the Windows
 * executable, where the bundler collects them. Throws rather than bundling an
 * installer that cannot start.
 *
 * @param {{ triple?: string; rootDir?: string }} [options]
 * @returns {string[]} the staged file names
 */
export function stageOrtDlls(options = {}) {
  const triple = options.triple ?? process.env.TAURI_ENV_TARGET_TRIPLE;
  const rootDir = options.rootDir ?? ROOT;
  if (!triple?.endsWith("windows-msvc")) {
    return [];
  }

  const profileDir = path.join(rootDir, "src-tauri", "target", triple, "release");
  const buildDir = path.join(profileDir, "build");
  if (!fs.existsSync(buildDir)) {
    throw new Error(`${buildDir} is missing; the installer would ship without onnxruntime.dll`);
  }

  const staged = fs.readdirSync(buildDir).filter((name) => name.toLowerCase().endsWith(".dll"));
  if (staged.length === 0) {
    throw new Error(`${buildDir} holds no DLLs; the installer would ship without onnxruntime.dll`);
  }

  for (const name of staged) {
    const source = path.join(buildDir, name);
    if (fs.statSync(source).isFile()) {
      fs.copyFileSync(source, path.join(profileDir, name));
    }
  }
  return staged;
}

/**
 * @param {(output: string) => void} [stdout]
 * @param {(output: string) => void} [stderr]
 * @param {Parameters<typeof stageOrtDlls>[0]} [options]
 * @returns {number}
 */
export function run(stdout = console.log, stderr = console.error, options = {}) {
  try {
    const staged = stageOrtDlls(options);
    if (staged.length > 0) {
      stdout(`stage-ort-dlls: staged ${staged.join(", ")} next to the executable`);
    }
    return 0;
  } catch (error) {
    stderr(`stage-ort-dlls error: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run());
}
