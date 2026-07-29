import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml");
const cargoLockPath = path.join(rootDir, "src-tauri", "Cargo.lock");
const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");

describe("version consistency across project manifests", () => {
  // @covers release-pipeline/the-released-version-is-declared-once#disagreeing-version-declarations-fail-the-test-suite
  it("asserts package.json, Cargo.toml, and Cargo.lock declare matching versions", () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const packageVersion = packageJson.version;

    const cargoTomlContent = fs.readFileSync(cargoTomlPath, "utf8");
    const cargoTomlMatch = cargoTomlContent.match(/\[package\][\s\S]*?\bversion\s*=\s*"([^"]+)"/);
    const cargoTomlVersion = cargoTomlMatch ? cargoTomlMatch[1] : null;

    const cargoLockContent = fs.readFileSync(cargoLockPath, "utf8");
    const cargoLockMatch = cargoLockContent.match(/\[\[package\]\]\s*\nname\s*=\s*"subx"\s*\nversion\s*=\s*"([^"]+)"/);
    const cargoLockVersion = cargoLockMatch ? cargoLockMatch[1] : null;

    expect(packageVersion, "package.json version must be defined").toBeDefined();
    expect(
      cargoTomlVersion,
      `Cargo.toml version (${cargoTomlVersion}) does not match package.json version (${packageVersion})`,
    ).toBe(packageVersion);
    expect(
      cargoLockVersion,
      `Cargo.lock subx package version (${cargoLockVersion}) does not match package.json version (${packageVersion})`,
    ).toBe(packageVersion);
  });

  // @covers release-pipeline/the-released-version-is-declared-once#the-bundle-version-comes-from-the-authoritative-declaration
  it("asserts tauri.conf.json version points at ../package.json rather than a literal", () => {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
    expect(tauriConf.version).toBe("../package.json");
  });

  // @covers release-pipeline/published-packages-identify-themselves#the-bundle-declares-complete-identity-metadata
  it("asserts tauri.conf.json bundle declares complete identity metadata", () => {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
    const bundle = tauriConf.bundle ?? {};

    const requiredFields = [
      "publisher",
      "homepage",
      "category",
      "copyright",
      "shortDescription",
      "longDescription",
    ] as const;

    for (const field of requiredFields) {
      expect(bundle[field], `bundle.${field} must be defined`).toBeDefined();
      expect(typeof bundle[field]).toBe("string");
      expect(bundle[field].trim().length, `bundle.${field} must be non-empty`).toBeGreaterThan(0);
    }

    expect(bundle.publisher).toBe("SubX Maintainers");
    expect(bundle.homepage).toBe("https://github.com/jim60105/subx");
    expect(bundle.category).toBe("Utility");
    expect(bundle.copyright).toBe("Copyright © 2024 SubX Maintainers");
    expect(bundle.shortDescription).toBe(
      "AI-powered subtitle matching, conversion, sync, and translation desktop app",
    );
    expect(bundle.longDescription).toBe(
      "SubX is a cross-platform desktop application for managing, matching, converting, synchronizing, and translating subtitles powered by AI and subx-cli.",
    );
  });

  // @covers release-pipeline/published-packages-identify-themselves#the-installers-can-present-the-license
  it("asserts tauri.conf.json bundle names a license file that exists in the repository", () => {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
    const licenseFile = tauriConf.bundle?.licenseFile;

    expect(licenseFile, "bundle.licenseFile must be defined").toBeDefined();
    expect(typeof licenseFile).toBe("string");
    expect(licenseFile).toBe("../LICENSE");

    const resolvedLicensePath = path.resolve(rootDir, "src-tauri", licenseFile);
    expect(fs.existsSync(resolvedLicensePath), `License file at ${resolvedLicensePath} must exist`).toBe(true);
  });
});
