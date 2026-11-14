/**
 * Windows bundle-staging assertions (ort-sys DLL placement).
 *
 * `ort-sys` 2.0.0-rc.10 stages its DLLs under `<profile>/build` once Cargo's
 * layout resolves `OUT_DIR.ancestors().nth(3)` there, while the MSI bundler
 * only collects `*.dll` beside the executable. These cases pin the copy and
 * its loud failures without needing a Windows runner.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { run, stageOrtDlls } from "./stage-ort-dlls.mjs";

const WINDOWS_TRIPLE = "x86_64-pc-windows-msvc";
const createdDirs: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "stage-ort-dlls-"));
  createdDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("stage-ort-dlls", () => {
  it("copies the DLLs ort-sys leaves in build/, following its symlinks", () => {
    const root = tempRoot();
    const profile = path.join(root, "src-tauri", "target", WINDOWS_TRIPLE, "release");
    const build = path.join(profile, "build");
    const cache = path.join(root, "ort-cache");
    mkdirSync(build, { recursive: true });
    mkdirSync(cache);
    writeFileSync(path.join(cache, "onnxruntime.dll"), "onnxruntime bytes");
    symlinkSync(path.join(cache, "onnxruntime.dll"), path.join(build, "onnxruntime.dll"));
    writeFileSync(path.join(build, "build-script.log"), "not a DLL");

    const logged: string[] = [];
    const status = run(
      (line) => logged.push(line),
      () => {},
      { triple: WINDOWS_TRIPLE, rootDir: root },
    );

    expect(status).toBe(0);
    expect(logged).toEqual([`stage-ort-dlls: staged onnxruntime.dll next to the executable`]);
    expect(readFileSync(path.join(profile, "onnxruntime.dll"), "utf8")).toBe("onnxruntime bytes");
    expect(stageOrtDlls({ triple: WINDOWS_TRIPLE, rootDir: root })).toEqual(["onnxruntime.dll"]);
  });

  it("is a no-op for every non-Windows target", () => {
    const root = tempRoot();
    const profile = path.join(root, "src-tauri", "target", "aarch64-apple-darwin", "release");
    const build = path.join(profile, "build");
    mkdirSync(build, { recursive: true });
    writeFileSync(path.join(build, "libonnxruntime.dylib"), "dylib");

    expect(stageOrtDlls({ triple: "aarch64-apple-darwin", rootDir: root })).toEqual([]);
    expect(existsSync(path.join(profile, "libonnxruntime.dylib"))).toBe(false);
  });

  it("fails loudly when the build directory the bundler needs is absent", () => {
    const root = tempRoot();

    expect(() => stageOrtDlls({ triple: WINDOWS_TRIPLE, rootDir: root })).toThrow(/is missing/);

    const errors: string[] = [];
    const status = run(
      () => {},
      (line) => errors.push(line),
      { triple: WINDOWS_TRIPLE, rootDir: root },
    );
    expect(status).toBe(1);
    expect(errors[0]).toMatch(/stage-ort-dlls error: .*is missing/);
  });

  it("fails loudly when the build directory holds no DLLs", () => {
    const root = tempRoot();
    mkdirSync(path.join(root, "src-tauri", "target", WINDOWS_TRIPLE, "release", "build"), {
      recursive: true,
    });

    expect(() => stageOrtDlls({ triple: WINDOWS_TRIPLE, rootDir: root })).toThrow(/holds no DLLs/);
  });
});
