import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkIconSource, run } from "./check-icon-source.mjs";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "check-icon-source-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function writeRecord(record: unknown): string {
  const recordPath = path.join(tmpDir, ".icon-source.json");
  fs.writeFileSync(recordPath, JSON.stringify(record));
  return recordPath;
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("check-icon-source", () => {
  it("passes when every recorded digest matches its source", () => {
    const masterContent = "<svg>master</svg>";
    const macosContent = "<svg>macos</svg>";
    writeSource("master.svg", masterContent);
    writeSource("macos.svg", macosContent);
    const recordPath = writeRecord({
      sources: {
        master: { path: "master.svg", sha256: sha256(masterContent) },
        macos: { path: "macos.svg", sha256: sha256(macosContent) },
      },
      outputs: {},
    });

    const result = checkIconSource({ recordPath, rootDir: tmpDir });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  // @covers app-icon/a-stale-icon-set-fails-verification#an-edited-source-without-regeneration-fails-the-gate
  it("fails and names the file when a source drifted from the recorded digest", () => {
    const masterContent = "<svg>master</svg>";
    const macosContent = "<svg>macos</svg>";
    writeSource("master.svg", masterContent);
    writeSource("macos.svg", macosContent);
    const recordPath = writeRecord({
      sources: {
        master: { path: "master.svg", sha256: sha256(masterContent) },
        macos: { path: "macos.svg", sha256: sha256("<svg>edited-after-generation</svg>") },
      },
      outputs: {},
    });

    const result = checkIconSource({ recordPath, rootDir: tmpDir });
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("macos.svg");

    const out: string[] = [];
    const err: string[] = [];
    const exitCode = run(
      (msg) => out.push(msg),
      (msg) => err.push(msg),
      { recordPath, rootDir: tmpDir },
    );
    expect(exitCode).toBe(1);
    expect(err.join("\n")).toContain("macos.svg");
  });

  it("fails and names the file when a recorded source no longer exists on disk", () => {
    writeSource("master.svg", "<svg>master</svg>");
    const recordPath = writeRecord({
      sources: {
        master: { path: "master.svg", sha256: sha256("<svg>master</svg>") },
        macos: { path: "macos.svg", sha256: sha256("<svg>macos</svg>") },
      },
      outputs: {},
    });

    const result = checkIconSource({ recordPath, rootDir: tmpDir });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("macos.svg");
  });

  it("fails and names the slot when a recorded output file is missing from the icons directory", () => {
    const masterContent = "<svg>master</svg>";
    const macosContent = "<svg>macos</svg>";
    writeSource("master.svg", masterContent);
    writeSource("macos.svg", macosContent);
    // "icon.png" is recorded as output but never written to tmpDir.
    const recordPath = writeRecord({
      sources: {
        master: { path: "master.svg", sha256: sha256(masterContent) },
        macos: { path: "macos.svg", sha256: sha256(macosContent) },
      },
      outputs: { "icon.png": "master" },
    });

    const result = checkIconSource({ recordPath, rootDir: tmpDir });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("icon.png");
  });

  it("fails when the record is missing an entry for a source", () => {
    writeSource("master.svg", "<svg>master</svg>");
    const recordPath = writeRecord({
      sources: {
        master: { path: "master.svg", sha256: sha256("<svg>master</svg>") },
      },
      outputs: {},
    });

    const result = checkIconSource({ recordPath, rootDir: tmpDir });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("macos");
  });

  it("fails and points at the fix when the generation record is missing entirely", () => {
    const recordPath = path.join(tmpDir, "does-not-exist.json");

    const result = checkIconSource({ recordPath, rootDir: tmpDir });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("icons:generate");
  });

  it("prints a success message and exits 0 on the CLI path", () => {
    const masterContent = "<svg>master</svg>";
    const macosContent = "<svg>macos</svg>";
    writeSource("master.svg", masterContent);
    writeSource("macos.svg", macosContent);
    const recordPath = writeRecord({
      sources: {
        master: { path: "master.svg", sha256: sha256(masterContent) },
        macos: { path: "macos.svg", sha256: sha256(macosContent) },
      },
      outputs: {},
    });

    const out: string[] = [];
    const exitCode = run(
      (msg) => out.push(msg),
      () => {},
      { recordPath, rootDir: tmpDir },
    );
    expect(exitCode).toBe(0);
    expect(out.join("\n")).toContain("in sync");
  });
});
