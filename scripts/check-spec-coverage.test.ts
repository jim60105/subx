import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  collectScenarios,
  formatReport,
  loadConfig,
  parseSpec,
  run,
  scanAnnotations,
  scenarioId,
  slugify,
  validate,
} from "./check-spec-coverage.mjs";

const checkerPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "check-spec-coverage.mjs",
);

/** A fixture repository: `<root>/openspec/specs/...` plus `<root>/scripts/config.json`. */
let root: string;

function writeSpec(capability: string, body: string) {
  const dir = path.join(root, "openspec", "specs", capability);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "spec.md"), body);
}

function writeTest(relativePath: string, body: string) {
  const full = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

function writeConfig(overrides: Record<string, unknown> = {}) {
  const dir = path.join(root, "scripts");
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, "spec-coverage.config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      specDir: "openspec/specs",
      testRoots: ["src", "src-tauri/src", "src-tauri/tests"],
      testExtensions: [".ts", ".tsx", ".rs"],
      waivers: [],
      ...overrides,
    }),
  );
  return configPath;
}

/** Collect the stdout/stderr a `run(...)` call produced alongside its exit code. */
function runChecker(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(
    argv,
    (line: string) => out.push(line),
    (line: string) => err.push(line),
  );
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const SAMPLE_SPEC = `# demo Specification

## Requirements

### Requirement: Things work
#### Scenario: A thing works
- **WHEN** a thing happens
- **THEN** it works

#### Scenario: Another thing works
- **WHEN** another thing happens
- **THEN** it works too
`;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "spec-coverage-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("ID derivation", () => {
  it("collapses non-alphanumeric runs and trims the ends", () => {
    expect(slugify("Manual theme override is persisted")).toBe(
      "manual-theme-override-is-persisted",
    );
    expect(slugify("  First launch on a dark-mode system!  ")).toBe(
      "first-launch-on-a-dark-mode-system",
    );
    expect(slugify("CLI and GUI stay in sync")).toBe("cli-and-gui-stay-in-sync");
  });

  it("joins capability, requirement and scenario into a stable ID", () => {
    expect(scenarioId("theme-system", "Manual theme override is persisted", "Override survives restart")).toBe(
      "theme-system/manual-theme-override-is-persisted#override-survives-restart",
    );
  });

  it("attributes each scenario to the requirement heading above it", () => {
    const scenarios = parseSpec(SAMPLE_SPEC, "demo");
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].requirement).toBe("Things work");
    expect(scenarios[0].id).toBe("demo/things-work#a-thing-works");
    expect(scenarios[1].id).toBe("demo/things-work#another-thing-works");
  });

  it("rejects a scenario with no enclosing requirement", () => {
    expect(() => parseSpec("#### Scenario: Orphan\n", "demo")).toThrow(/no enclosing/);
  });
});

describe("collectScenarios", () => {
  it("takes the capability from the directory name and reads every spec", () => {
    writeSpec("demo", SAMPLE_SPEC);
    writeSpec("other", "### Requirement: Other\n#### Scenario: Other thing\n");
    const scenarios = collectScenarios(root, "openspec/specs");
    expect(scenarios.map((s) => s.id)).toEqual([
      "demo/things-work#a-thing-works",
      "demo/things-work#another-thing-works",
      "other/other#other-thing",
    ]);
  });

  it("fails on two headings that slugify alike rather than deduplicating them", () => {
    writeSpec(
      "demo",
      "### Requirement: Things work\n#### Scenario: A thing works\n#### Scenario: A thing works!\n",
    );
    expect(() => collectScenarios(root, "openspec/specs")).toThrow(
      /Duplicate scenario ID/,
    );
  });

  it("reports a missing spec directory rather than reporting zero scenarios", () => {
    expect(() => collectScenarios(root, "nope")).toThrow(/not found/);
  });
});

describe("scanAnnotations", () => {
  // @covers verification-gates/every-specification-scenario-traces-to-a-verifying-test#both-languages-carry-annotations
  it("finds annotations in both languages and records where they are", () => {
    writeTest(
      "src/demo.test.ts",
      ['// @covers demo/things-work#a-thing-works', 'it("works", () => {});', ""].join("\n"),
    );
    writeTest(
      "src-tauri/src/demo.rs",
      [
        "// @covers demo/things-work#another-thing-works",
        "#[test]",
        "fn another_thing_works() {}",
        "",
      ].join("\n"),
    );

    const annotations = scanAnnotations(root, ["src", "src-tauri/src"], [".ts", ".rs"]);
    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toMatchObject({
      id: "demo/things-work#a-thing-works",
      file: path.join("src", "demo.test.ts"),
      line: 1,
    });
    // The declaration is captured for the report, skipping Rust attributes.
    expect(annotations[1].declaration).toBe("fn another_thing_works() {}");
  });

  it("skips a configured test root that does not exist yet", () => {
    expect(() => scanAnnotations(root, ["src-tauri/tests"], [".rs"])).not.toThrow();
    expect(scanAnnotations(root, ["src-tauri/tests"], [".rs"])).toEqual([]);
  });

  it("ignores an annotation that does not sit above an active test", () => {
    // The scan reaches production source too; a stray or copy-pasted `@covers`
    // above a component or a plain function must not count as verification.
    writeTest(
      "src/component.tsx",
      [
        "// @covers demo/things-work#a-thing-works",
        "export function Widget() { return null; }",
      ].join("\n"),
    );
    writeTest(
      "src-tauri/src/handler.rs",
      ["// @covers demo/things-work#a-thing-works", "pub fn handler() {}"].join("\n"),
    );

    expect(scanAnnotations(root, ["src", "src-tauri/src"], [".tsx", ".rs"])).toEqual([]);
  });

  it("flags an annotation above a skipped or ignored test as skipped", () => {
    writeTest(
      "src/a.test.ts",
      ["// @covers demo/things-work#a-thing-works", 'it.skip("later", () => {});'].join("\n"),
    );
    writeTest(
      "src-tauri/src/b.rs",
      [
        "// @covers demo/things-work#another-thing-works",
        "#[test]",
        "#[ignore]",
        "fn later() {}",
      ].join("\n"),
    );

    const annotations = scanAnnotations(root, ["src", "src-tauri/src"], [".ts", ".rs"]);
    expect(annotations).toHaveLength(2);
    expect(annotations.every((a) => a.skipped)).toBe(true);
  });

  it("counts an annotation above an it.each or describe.each block", () => {
    writeTest(
      "src/each.test.ts",
      ["// @covers demo/things-work#a-thing-works", "it.each([1, 2])('case %i', () => {});"].join("\n"),
    );
    const annotations = scanAnnotations(root, ["src"], [".ts"]);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].skipped).toBe(false);
  });
});

describe("validate", () => {
  const scenarios = [
    { capability: "demo", requirement: "Things work", scenario: "A thing works", id: "demo/things-work#a-thing-works" },
  ];

  it("passes when every scenario is annotated", () => {
    const outcome = validate(
      scenarios,
      [{ id: "demo/things-work#a-thing-works", file: "src/demo.test.ts", line: 1, declaration: "" }],
      [],
    );
    expect(outcome.errors).toEqual([]);
    expect(outcome.counts).toMatchObject({ verified: 1, waived: 0, unverified: 0 });
  });

  // @covers verification-gates/every-specification-scenario-traces-to-a-verifying-test#an-unverified-scenario-fails-the-check
  it("fails and names an unverified scenario", () => {
    const outcome = validate(scenarios, [], []);
    expect(outcome.counts.unverified).toBe(1);
    expect(outcome.errors.join("\n")).toMatch(/Unverified scenario "demo\/things-work#a-thing-works"/);
  });

  it("fails on an annotation that matches no scenario", () => {
    const outcome = validate(
      scenarios,
      [
        { id: "demo/things-work#a-thing-works", file: "src/a.test.ts", line: 1, declaration: "" },
        { id: "demo/things-work#renamed-away", file: "src/b.test.ts", line: 9, declaration: "" },
      ],
      [],
    );
    expect(outcome.errors.join("\n")).toMatch(/Dangling annotation at src\/b.test.ts:9/);
  });

  // @covers verification-gates/a-scenario-that-cannot-be-automated-requires-a-recorded-waiver#a-justified-waiver-satisfies-the-check
  it("accepts a waiver that states its reason and manual procedure", () => {
    const outcome = validate(scenarios, [], [
      {
        id: "demo/things-work#a-thing-works",
        reason: "Needs hardware CI does not have.",
        manualVerification: "docs/verification.md#manual",
      },
    ]);
    expect(outcome.errors).toEqual([]);
    expect(outcome.counts).toMatchObject({ verified: 0, waived: 1, unverified: 0 });
  });

  // @covers verification-gates/a-scenario-that-cannot-be-automated-requires-a-recorded-waiver#an-unjustified-waiver-is-rejected
  it("rejects a waiver missing its justification", () => {
    const outcome = validate(scenarios, [], [
      { id: "demo/things-work#a-thing-works", reason: "Because." },
    ]);
    expect(outcome.errors.join("\n")).toMatch(/must state both a "reason" and a "manualVerification"/);
  });

  it("rejects a waiver for a scenario that no longer exists", () => {
    const outcome = validate(
      scenarios,
      [{ id: "demo/things-work#a-thing-works", file: "src/a.test.ts", line: 1, declaration: "" }],
      [{ id: "demo/things-work#gone", reason: "r", manualVerification: "m" }],
    );
    expect(outcome.errors.join("\n")).toMatch(/names a scenario that does not exist/);
  });

  // @covers verification-gates/a-scenario-that-cannot-be-automated-requires-a-recorded-waiver#a-stale-waiver-is-rejected
  it("rejects a stale waiver whose scenario is in fact annotated", () => {
    const outcome = validate(
      scenarios,
      [{ id: "demo/things-work#a-thing-works", file: "src/a.test.ts", line: 1, declaration: "" }],
      [{ id: "demo/things-work#a-thing-works", reason: "r", manualVerification: "m" }],
    );
    expect(outcome.errors.join("\n")).toMatch(/is stale/);
  });

  it("rejects a skipped-test annotation instead of counting it", () => {
    const outcome = validate(
      scenarios,
      [{ id: "demo/things-work#a-thing-works", file: "src/a.test.ts", line: 1, declaration: "", skipped: true }],
      [],
    );
    // The scenario is not verified, and the skip is called out explicitly.
    expect(outcome.counts.verified).toBe(0);
    expect(outcome.counts.unverified).toBe(1);
    expect(outcome.errors.join("\n")).toMatch(/sits above a skipped or ignored test/);
  });

  // @covers verification-gates/every-specification-scenario-traces-to-a-verifying-test#a-renamed-scenario-invalidates-its-stale-annotations
  it("reports both halves of a heading rename in one run", () => {
    const outcome = validate(
      scenarios,
      [{ id: "demo/things-work#old-name", file: "src/a.test.ts", line: 3, declaration: "" }],
      [],
    );
    const joined = outcome.errors.join("\n");
    expect(joined).toMatch(/Dangling annotation/);
    expect(joined).toMatch(/Unverified scenario/);
  });
});

describe("formatReport", () => {
  // @covers verification-gates/the-traceability-matrix-is-reportable#reviewer-reads-the-matrix
  it("prints every scenario with its verifying tests or waiver, plus a summary", () => {
    const outcome = validate(
      [
        { capability: "demo", requirement: "R", scenario: "Verified", id: "demo/r#verified" },
        { capability: "demo", requirement: "R", scenario: "Waived", id: "demo/r#waived" },
      ],
      [{ id: "demo/r#verified", file: "src/a.test.ts", line: 4, declaration: 'it("does")' }],
      [{ id: "demo/r#waived", reason: "Needs a GPU.", manualVerification: "docs/verification.md" }],
    );
    const report = formatReport(outcome);
    expect(report).toContain("## demo");
    expect(report).toContain("Requirement: R");
    expect(report).toContain("[x] Verified");
    expect(report).toContain('src/a.test.ts:4 it("does")');
    expect(report).toContain("[~] Waived");
    expect(report).toContain("waived: Needs a GPU.");
    expect(report).toContain("1 verified, 1 waived, 0 unverified (2 scenarios)");
  });
});

describe("run", () => {
  it("exits zero and summarises when everything is covered", () => {
    writeSpec("demo", SAMPLE_SPEC);
    writeTest(
      "src/demo.test.ts",
      [
        "// @covers demo/things-work#a-thing-works",
        "// @covers demo/things-work#another-thing-works",
        'it("works", () => {});',
      ].join("\n"),
    );
    const configPath = writeConfig();
    const { code, out } = runChecker(["--config", configPath]);
    expect(code).toBe(0);
    expect(out).toContain("2 verified, 0 waived, 0 unverified");
  });

  it("exits non-zero and lists the problems when something is uncovered", () => {
    writeSpec("demo", SAMPLE_SPEC);
    const configPath = writeConfig();
    const { code, err } = runChecker(["--config", configPath]);
    expect(code).toBe(1);
    expect(err).toContain("2 problem(s) found");
  });

  it("reports a spec-parsing failure instead of throwing", () => {
    const configPath = writeConfig({ specDir: "does-not-exist" });
    const { code, err } = runChecker(["--config", configPath]);
    expect(code).toBe(1);
    expect(err).toContain("spec-coverage:");
  });

  it("prints the matrix in report mode", () => {
    writeSpec("demo", SAMPLE_SPEC);
    writeTest(
      "src/demo.test.ts",
      ["// @covers demo/things-work#a-thing-works", 'it("one", () => {});'].join("\n"),
    );
    const configPath = writeConfig();
    const { code, out } = runChecker(["--config", configPath, "--report"]);
    expect(code).toBe(1);
    expect(out).toContain("Spec-to-test traceability matrix");
    expect(out).toContain("[x] A thing works");
    expect(out).toContain("[ ] Another thing works");
  });

  it("exercises the CLI entry point and its real exit code as a child process", () => {
    writeSpec("demo", SAMPLE_SPEC);
    const configPath = writeConfig();

    // Uncovered: the CLI must exit 1.
    expect(() =>
      execFileSync("node", [checkerPath, "--config", configPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrow();

    writeTest(
      "src/demo.test.ts",
      [
        "// @covers demo/things-work#a-thing-works",
        "// @covers demo/things-work#another-thing-works",
        'it("covers both", () => {});',
      ].join("\n"),
    );
    const stdout = execFileSync("node", [checkerPath, "--config", configPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(stdout).toContain("2 verified");
  });
});

describe("loadConfig", () => {
  it("resolves the repository root as the config file's parent directory", () => {
    const configPath = writeConfig();
    const config = loadConfig(configPath);
    expect(config.root).toBe(root);
    expect(config.specDir).toBe("openspec/specs");
  });

  it("falls back to defaults for omitted keys", () => {
    const dir = path.join(root, "scripts");
    fs.mkdirSync(dir, { recursive: true });
    const configPath = path.join(dir, "minimal.json");
    fs.writeFileSync(configPath, "{}");
    const config = loadConfig(configPath);
    expect(config.specDir).toBe("openspec/specs");
    expect(config.testRoots).toEqual([]);
    expect(config.waivers).toEqual([]);
  });
});

describe("path input validation", () => {
  it("rejects a --config argument that has no value", () => {
    const { code, err } = runChecker(["--config"]);
    expect(code).toBe(1);
    expect(err).toContain("missing value for --config");
  });

  // @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-non-file-or-missing-config-path-is-rejected
  it("rejects a config path that is a directory or does not exist, without reading it", () => {
    const scriptsDir = path.join(root, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    const { code, err } = runChecker(["--config", scriptsDir]);
    expect(code).toBe(1);
    expect(err).toContain("does not exist or is not a regular file");

    const { code: code2, err: err2 } = runChecker(["--config", path.join(root, "missing.json")]);
    expect(code2).toBe(1);
    expect(err2).toContain("does not exist or is not a regular file");
  });

  // @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-valid-config-path-is-accepted
  it("accepts a config path that is an existing regular file and continues", () => {
    writeSpec("demo", "### Requirement: Things work\n#### Scenario: A thing works\n- **WHEN** a thing happens\n- **THEN** it works\n");
    writeTest(
      "src/demo.test.ts",
      ["// @covers demo/things-work#a-thing-works", 'it("works", () => {});'].join("\n"),
    );
    const configPath = writeConfig({ testRoots: ["src"] });
    const { code, out } = runChecker(["--config", configPath]);
    expect(code).toBe(0);
    expect(out).toContain("1 verified, 0 waived, 0 unverified");
  });

  // @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-test-root-that-escapes-the-repository-root-is-rejected
  it("rejects a test root that escapes the repository root", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-coverage-outside-"));
    writeSpec("demo", SAMPLE_SPEC);
    const relRoot = path.relative(root, outsideDir);
    const configPath = writeConfig({ testRoots: [relRoot] });
    const { code, err } = runChecker(["--config", configPath]);
    expect(code).toBe(1);
    expect(err).toContain("resolves outside the repository root");
    fs.rmSync(outsideDir, { recursive: true, force: true });

    // A non-existent escaping root is rejected lexically, not skipped.
    const configPath2 = writeConfig({ testRoots: ["../missing-root"] });
    const { code: code2, err: err2 } = runChecker(["--config", configPath2]);
    expect(code2).toBe(1);
    expect(err2).toContain("resolves outside the repository root");
  });

  // @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-test-root-inside-the-repository-root-is-accepted
  it("walks a test root that stays inside the repository root", () => {
    writeSpec("demo", "### Requirement: Things work\n#### Scenario: A thing works\n- **WHEN** a thing happens\n- **THEN** it works\n");
    writeTest(
      "src/demo.test.ts",
      ["// @covers demo/things-work#a-thing-works", 'it("works", () => {});'].join("\n"),
    );
    const configPath = writeConfig({ testRoots: ["src"] });
    const { code, out } = runChecker(["--config", configPath]);
    expect(code).toBe(0);
    expect(out).toContain("1 verified, 0 waived, 0 unverified");
  });

  // @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-symlinked-test-root-pointing-outside-the-repository-root-is-rejected
  it("rejects a symlinked test root that points outside the repository root", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-coverage-outside-"));
    fs.symlinkSync(outsideDir, path.join(root, "linked-outside"));
    writeSpec("demo", SAMPLE_SPEC);
    const configPath = writeConfig({ testRoots: ["linked-outside"] });
    const { code, err } = runChecker(["--config", configPath]);
    expect(code).toBe(1);
    expect(err).toContain("resolves outside the repository root");
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  // @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-spec-directory-that-escapes-the-repository-root-is-rejected
  it("rejects a spec directory that escapes the repository root", () => {
    const outsideSpecDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-coverage-escapes-"));
    writeSpec("demo", SAMPLE_SPEC);
    const relSpecDir = path.relative(root, outsideSpecDir);
    const configPath = writeConfig({ specDir: relSpecDir });
    const { code, err } = runChecker(["--config", configPath]);
    expect(code).toBe(1);
    expect(err).toContain("resolves outside the repository root");
    fs.rmSync(outsideSpecDir, { recursive: true, force: true });

    // A non-existent escaping spec directory is rejected lexically.
    const configPath2 = writeConfig({ specDir: "../missing-specs" });
    const { code: code2, err: err2 } = runChecker(["--config", configPath2]);
    expect(code2).toBe(1);
    expect(err2).toContain("resolves outside the repository root");
  });

  // @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-symlinked-test-file-inside-a-test-root-that-points-outside-the-repository-root-is-rejected
  it("rejects a symlinked test file inside a test root that points outside the repository root", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-coverage-outside-"));
    fs.writeFileSync(
      path.join(outsideDir, "leak.ts"),
      ["// @covers demo/things-work#a-thing-works", 'it("leak", () => {});'].join("\n"),
    );
    writeSpec("demo", SAMPLE_SPEC);
    writeTest("src/real.ts", 'it("real", () => {});\n');
    fs.symlinkSync(path.join(outsideDir, "leak.ts"), path.join(root, "src", "leak.ts"));
    const configPath = writeConfig({ testRoots: ["src"] });
    const { code, err } = runChecker(["--config", configPath]);
    expect(code).toBe(1);
    expect(err).toContain("resolves outside the repository root");
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  // @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-symlinked-spec-file-that-points-outside-the-repository-root-is-rejected
  it("rejects a symlinked spec.md that points outside the repository root", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-coverage-outside-"));
    fs.writeFileSync(path.join(outsideDir, "spec.md"), "### Requirement: Other\n#### Scenario: Other thing\n");
    const specDir = path.join(root, "openspec", "specs", "other");
    fs.mkdirSync(specDir, { recursive: true });
    fs.symlinkSync(path.join(outsideDir, "spec.md"), path.join(specDir, "spec.md"));
    writeSpec("demo", SAMPLE_SPEC);
    const configPath = writeConfig();
    const { code, err } = runChecker(["--config", configPath]);
    expect(code).toBe(1);
    expect(err).toContain("resolves outside the repository root");
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  // @covers verification-gates/path-inputs-to-the-checker-are-resolved-and-validated#a-symlinked-config-file-derives-the-repository-root-from-the-link-s-location
  it("derives the repository root from a symlinked config file's location", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-coverage-config-"));
    const outsideConfig = path.join(outsideDir, "spec-coverage.config.json");
    fs.writeFileSync(outsideConfig, JSON.stringify({ specDir: "openspec/specs", testRoots: ["src"], waivers: [] }));
    const scriptsDir = path.join(root, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    const linkPath = path.join(scriptsDir, "spec-coverage.config.json");
    fs.symlinkSync(outsideConfig, linkPath);
    const config = loadConfig(linkPath);
    expect(config.root).toBe(root);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});
