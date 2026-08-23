#!/usr/bin/env node
/**
 * Icon generation script.
 *
 * Runs `tauri icon` twice against the two hand-authored sources under
 * `assets/brand/` and assembles a single `src-tauri/icons/` output set from the
 * two passes:
 *
 *   - The full-bleed master (`subx-icon.svg`) feeds every slot.
 *   - The macOS-inset source (`subx-icon-macos.svg`) feeds `icon.icns` only,
 *     because `tauri icon` applies no platform inset of its own (design.md D2).
 *
 * The project ships desktop targets only, so the Android and iOS trees the CLI
 * also emits are removed by their known subpaths rather than by deleting the
 * `android/`/`ios/` directories wholesale (design.md D3) — a future `tauri-cli`
 * version that starts emitting something this script does not know about fails
 * loudly instead of silently leaving stray files behind.
 *
 * A generation record, `.icon-source.json`, is written alongside the output so
 * `check-icon-source.mjs` can later detect a source that was edited without
 * regenerating (design.md D5). `icon.icns` is not byte-reproducible between
 * runs of `tauri icon` (measured: ~71,953 of ~74,000 bytes differ), so the
 * record tracks source digests rather than output digests.
 *
 * The record-writing and icns-guard logic are exported separately so they can
 * be unit-tested against temp fixtures without invoking the Tauri CLI.
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MASTER_SOURCE = path.join(ROOT, "assets/brand/subx-icon.svg");
export const MACOS_SOURCE = path.join(ROOT, "assets/brand/subx-icon-macos.svg");
export const ICONS_DIR = path.join(ROOT, "src-tauri/icons");
export const RECORD_FILENAME = ".icon-source.json";

/**
 * Subpaths `tauri-cli` 2.11.x writes under `src-tauri/icons/android/` for a
 * project with no Android target. Enumerated (not wildcard-deleted) so a CLI
 * upgrade that changes this list is caught rather than silently ignored.
 */
const ANDROID_SUBPATHS = [
  "mipmap-anydpi-v26/ic_launcher.xml",
  "mipmap-hdpi/ic_launcher_foreground.png",
  "mipmap-hdpi/ic_launcher.png",
  "mipmap-hdpi/ic_launcher_round.png",
  "mipmap-mdpi/ic_launcher_foreground.png",
  "mipmap-mdpi/ic_launcher.png",
  "mipmap-mdpi/ic_launcher_round.png",
  "mipmap-xhdpi/ic_launcher_foreground.png",
  "mipmap-xhdpi/ic_launcher.png",
  "mipmap-xhdpi/ic_launcher_round.png",
  "mipmap-xxhdpi/ic_launcher_foreground.png",
  "mipmap-xxhdpi/ic_launcher.png",
  "mipmap-xxhdpi/ic_launcher_round.png",
  "mipmap-xxxhdpi/ic_launcher_foreground.png",
  "mipmap-xxxhdpi/ic_launcher.png",
  "mipmap-xxxhdpi/ic_launcher_round.png",
  "values/ic_launcher_background.xml",
];

/** Subpaths `tauri-cli` 2.11.x writes under `src-tauri/icons/ios/`. */
const IOS_SUBPATHS = [
  "AppIcon-20x20@1x.png",
  "AppIcon-20x20@2x-1.png",
  "AppIcon-20x20@2x.png",
  "AppIcon-20x20@3x.png",
  "AppIcon-29x29@1x.png",
  "AppIcon-29x29@2x-1.png",
  "AppIcon-29x29@2x.png",
  "AppIcon-29x29@3x.png",
  "AppIcon-40x40@1x.png",
  "AppIcon-40x40@2x-1.png",
  "AppIcon-40x40@2x.png",
  "AppIcon-40x40@3x.png",
  "AppIcon-512@2x.png",
  "AppIcon-60x60@2x.png",
  "AppIcon-60x60@3x.png",
  "AppIcon-76x76@1x.png",
  "AppIcon-76x76@2x.png",
  "AppIcon-83.5x83.5@2x.png",
];

/**
 * SHA-256 digest of a file's contents, as lowercase hex.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/**
 * Recursively remove empty directories under (and including) `dirPath`,
 * bottom-up. Leaves non-empty directories in place.
 *
 * @param {string} dirPath
 */
function pruneEmptyDirs(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      pruneEmptyDirs(path.join(dirPath, entry.name));
    }
  }
  if (fs.readdirSync(dirPath).length === 0) {
    fs.rmdirSync(dirPath);
  }
}

/**
 * List every regular file that remains under `dirPath`, as paths relative to
 * it, using forward slashes.
 *
 * @param {string} dirPath
 * @returns {string[]}
 */
function listFilesRelative(dirPath) {
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRelative(entryPath).map((p) => `${entry.name}/${p}`));
    } else {
      out.push(entry.name);
    }
  }
  return out;
}

/**
 * Delete the Android and iOS output trees `tauri icon` writes into
 * `iconsDir`, by their known subpaths, then remove the directory shells once
 * they are empty. Throws, naming the file, if a subpath is present in the
 * directory that this script does not recognise — that means `tauri-cli`
 * changed what it emits and the deletion list above needs updating.
 *
 * @param {string} [iconsDir]
 */
export function removeUnshippedPlatformOutput(iconsDir = ICONS_DIR) {
  for (const [dirName, knownSubpaths] of [
    ["android", ANDROID_SUBPATHS],
    ["ios", IOS_SUBPATHS],
  ]) {
    const dirPath = path.join(iconsDir, dirName);
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    for (const subpath of knownSubpaths) {
      const filePath = path.join(dirPath, subpath);
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
      }
    }

    pruneEmptyDirs(dirPath);

    if (fs.existsSync(dirPath)) {
      const leftover = listFilesRelative(dirPath);
      throw new Error(
        `src-tauri/icons/${dirName}/ still contains unrecognised output after cleanup: ${leftover.join(", ")}. ` +
          `Update the subpath list in scripts/generate-icons.mjs.`,
      );
    }
  }
}

/**
 * Confirm a `tauri icon` pass produced a usable `icon.icns` in `tempDir`.
 * Throws rather than letting a failed macOS pass leave the master's
 * full-bleed `icon.icns` silently in place (design spec: "a failed macOS pass
 * cannot leave a full-bleed icns behind").
 *
 * @param {string} tempDir
 * @returns {string} the path to the verified `icon.icns`
 */
export function assertMacosIcnsProduced(tempDir) {
  const icnsPath = path.join(tempDir, "icon.icns");
  if (!fs.existsSync(icnsPath)) {
    throw new Error(`macOS icon pass produced no icon.icns at ${icnsPath}`);
  }
  if (fs.statSync(icnsPath).size === 0) {
    throw new Error(`macOS icon pass produced an empty icon.icns at ${icnsPath}`);
  }
  return icnsPath;
}

/**
 * List the generated icon files directly under `iconsDir`, excluding the
 * generation record itself — a rerun finds the previous run's record still
 * sitting there (nothing removes it beforehand), and it is not an icon.
 *
 * @param {string} iconsDir
 * @returns {string[]}
 */
export function listOutputFiles(iconsDir) {
  return fs
    .readdirSync(iconsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== RECORD_FILENAME)
    .map((entry) => entry.name);
}

/**
 * Build the generation record content: each source's digest, and which
 * source fed each output slot (`icon.icns` from the macOS source, everything
 * else from the master).
 *
 * @param {{ masterPath: string; macosPath: string; outputFiles: string[] }} args
 * @returns {{ sources: Record<string, { path: string; sha256: string }>; outputs: Record<string, "master" | "macos"> }}
 */
export function buildGenerationRecord({ masterPath, macosPath, outputFiles }) {
  const toRepoRelative = (p) => path.relative(ROOT, p).split(path.sep).join("/");

  /** @type {Record<string, "master" | "macos">} */
  const outputs = {};
  for (const file of outputFiles) {
    outputs[file] = file === "icon.icns" ? "macos" : "master";
  }

  return {
    sources: {
      master: { path: toRepoRelative(masterPath), sha256: sha256File(masterPath) },
      macos: { path: toRepoRelative(macosPath), sha256: sha256File(macosPath) },
    },
    outputs,
  };
}

/**
 * Serialise and write a generation record to disk.
 *
 * @param {string} recordPath
 * @param {ReturnType<typeof buildGenerationRecord>} record
 */
export function writeGenerationRecord(recordPath, record) {
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Confirm a `tauri icon` master pass produced a usable desktop icon set in
 * `tempDir`, checking the two files every downstream slot ultimately derives
 * from. Staging the master pass in a temp directory (like the macOS pass)
 * means a CLI crash mid-run leaves the temp directory broken rather than
 * partially overwriting the committed `src-tauri/icons/` tree.
 *
 * @param {string} tempDir
 */
export function assertMasterOutputProduced(tempDir) {
  for (const name of ["icon.png", "icon.ico"]) {
    const filePath = path.join(tempDir, name);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      throw new Error(`master icon pass produced no usable ${name} at ${filePath}`);
    }
  }
}

/**
 * Run the full two-pass generation: master into a temp directory (validated,
 * then copied into `iconsDir`), macOS source into its own temp directory
 * whose verified `icon.icns` is copied over the master's, then platform
 * cleanup and the generation record.
 *
 * @param {{ masterSource?: string; macosSource?: string; iconsDir?: string }} [options]
 */
export function generateIcons(options = {}) {
  const masterSource = options.masterSource ?? MASTER_SOURCE;
  const macosSource = options.macosSource ?? MACOS_SOURCE;
  const iconsDir = options.iconsDir ?? ICONS_DIR;

  const masterTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subx-icon-master-"));
  try {
    execFileSync("npx", ["tauri", "icon", masterSource, "-o", masterTempDir], {
      cwd: ROOT,
      stdio: "inherit",
    });
    assertMasterOutputProduced(masterTempDir);
    fs.cpSync(masterTempDir, iconsDir, { recursive: true });
  } finally {
    fs.rmSync(masterTempDir, { recursive: true, force: true });
  }

  const macosTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subx-icon-macos-"));
  try {
    execFileSync("npx", ["tauri", "icon", macosSource, "-o", macosTempDir], {
      cwd: ROOT,
      stdio: "inherit",
    });
    const icnsPath = assertMacosIcnsProduced(macosTempDir);
    fs.copyFileSync(icnsPath, path.join(iconsDir, "icon.icns"));
  } finally {
    fs.rmSync(macosTempDir, { recursive: true, force: true });
  }

  removeUnshippedPlatformOutput(iconsDir);

  const record = buildGenerationRecord({
    masterPath: masterSource,
    macosPath: macosSource,
    outputFiles: listOutputFiles(iconsDir),
  });
  writeGenerationRecord(path.join(iconsDir, RECORD_FILENAME), record);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateIcons();
}
