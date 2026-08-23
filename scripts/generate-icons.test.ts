import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertMacosIcnsProduced,
  assertMasterOutputProduced,
  buildGenerationRecord,
  listOutputFiles,
  removeUnshippedPlatformOutput,
  sha256File,
  writeGenerationRecord,
} from "./generate-icons.mjs";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-icons-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("sha256File", () => {
  it("matches Node's own digest of the same bytes", () => {
    const filePath = path.join(tmpDir, "sample.txt");
    fs.writeFileSync(filePath, "hello icon");
    const expected = crypto.createHash("sha256").update("hello icon").digest("hex");
    expect(sha256File(filePath)).toBe(expected);
  });
});

describe("assertMacosIcnsProduced", () => {
  // @covers app-icon/the-macos-icon-follows-the-platform-s-icon-grid#a-failed-macos-pass-cannot-leave-a-full-bleed-icns-behind
  it("throws when the second pass produced no icon.icns, rather than letting the copy proceed", () => {
    expect(() => assertMacosIcnsProduced(tmpDir)).toThrow(/no icon\.icns/);
  });

  it("throws when the second pass produced an empty icon.icns", () => {
    fs.writeFileSync(path.join(tmpDir, "icon.icns"), Buffer.alloc(0));
    expect(() => assertMacosIcnsProduced(tmpDir)).toThrow(/empty icon\.icns/);
  });

  it("returns the icns path when the second pass produced a usable file", () => {
    const icnsPath = path.join(tmpDir, "icon.icns");
    fs.writeFileSync(icnsPath, Buffer.from([1, 2, 3]));
    expect(assertMacosIcnsProduced(tmpDir)).toBe(icnsPath);
  });
});

describe("assertMasterOutputProduced", () => {
  it("throws when the master pass produced no icon.png", () => {
    fs.writeFileSync(path.join(tmpDir, "icon.ico"), "x");
    expect(() => assertMasterOutputProduced(tmpDir)).toThrow(/icon\.png/);
  });

  it("throws when the master pass produced no icon.ico", () => {
    fs.writeFileSync(path.join(tmpDir, "icon.png"), "x");
    expect(() => assertMasterOutputProduced(tmpDir)).toThrow(/icon\.ico/);
  });

  it("throws when a required file is present but empty", () => {
    fs.writeFileSync(path.join(tmpDir, "icon.png"), "x");
    fs.writeFileSync(path.join(tmpDir, "icon.ico"), Buffer.alloc(0));
    expect(() => assertMasterOutputProduced(tmpDir)).toThrow(/icon\.ico/);
  });

  it("does not throw when both required files are present and non-empty", () => {
    fs.writeFileSync(path.join(tmpDir, "icon.png"), "x");
    fs.writeFileSync(path.join(tmpDir, "icon.ico"), "x");
    expect(() => assertMasterOutputProduced(tmpDir)).not.toThrow();
  });
});

describe("removeUnshippedPlatformOutput", () => {
  it("removes known android/ios subpaths and prunes the now-empty directory shells", () => {
    fs.mkdirSync(path.join(tmpDir, "android", "mipmap-hdpi"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "android", "mipmap-hdpi", "ic_launcher.png"), "x");
    fs.mkdirSync(path.join(tmpDir, "android", "values"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "android", "values", "ic_launcher_background.xml"), "x");
    fs.mkdirSync(path.join(tmpDir, "ios"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "ios", "AppIcon-20x20@1x.png"), "x");
    fs.writeFileSync(path.join(tmpDir, "icon.png"), "keep me");

    removeUnshippedPlatformOutput(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, "android"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "ios"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "icon.png"))).toBe(true);
  });

  it("does nothing when android/ and ios/ are already absent", () => {
    fs.writeFileSync(path.join(tmpDir, "icon.png"), "keep me");
    expect(() => removeUnshippedPlatformOutput(tmpDir)).not.toThrow();
    expect(fs.existsSync(path.join(tmpDir, "icon.png"))).toBe(true);
  });

  it("throws, naming the file, when an unrecognised file remains under android/", () => {
    fs.mkdirSync(path.join(tmpDir, "android"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "android", "unexpected-new-file.png"), "x");

    expect(() => removeUnshippedPlatformOutput(tmpDir)).toThrow(/unexpected-new-file\.png/);
  });
});

describe("listOutputFiles", () => {
  it("excludes the generation record left behind by a previous run", () => {
    fs.writeFileSync(path.join(tmpDir, "icon.png"), "x");
    fs.writeFileSync(path.join(tmpDir, "icon.ico"), "x");
    fs.writeFileSync(path.join(tmpDir, ".icon-source.json"), "{}");

    const files = listOutputFiles(tmpDir);

    expect(files.sort()).toEqual(["icon.ico", "icon.png"]);
  });

  it("ignores subdirectories", () => {
    fs.writeFileSync(path.join(tmpDir, "icon.png"), "x");
    fs.mkdirSync(path.join(tmpDir, "android"));

    expect(listOutputFiles(tmpDir)).toEqual(["icon.png"]);
  });
});

describe("buildGenerationRecord / writeGenerationRecord", () => {
  it("attributes icon.icns to the macOS source and every other slot to the master", () => {
    const masterPath = path.join(tmpDir, "master.svg");
    const macosPath = path.join(tmpDir, "macos.svg");
    fs.writeFileSync(masterPath, "<svg>master</svg>");
    fs.writeFileSync(macosPath, "<svg>macos</svg>");

    const record = buildGenerationRecord({
      masterPath,
      macosPath,
      outputFiles: ["icon.icns", "icon.ico", "32x32.png"],
    });

    expect(record.outputs["icon.icns"]).toBe("macos");
    expect(record.outputs["icon.ico"]).toBe("master");
    expect(record.outputs["32x32.png"]).toBe("master");
    expect(record.sources.master.sha256).toBe(sha256File(masterPath));
    expect(record.sources.macos.sha256).toBe(sha256File(macosPath));
  });

  it("writes a record a later run can read back unchanged", () => {
    const masterPath = path.join(tmpDir, "master.svg");
    const macosPath = path.join(tmpDir, "macos.svg");
    fs.writeFileSync(masterPath, "<svg>master</svg>");
    fs.writeFileSync(macosPath, "<svg>macos</svg>");

    const record = buildGenerationRecord({ masterPath, macosPath, outputFiles: ["icon.icns"] });
    const recordPath = path.join(tmpDir, ".icon-source.json");
    writeGenerationRecord(recordPath, record);

    expect(JSON.parse(fs.readFileSync(recordPath, "utf8"))).toEqual(record);
  });
});
