#!/usr/bin/env node
/**
 * Spec-to-test traceability checker.
 *
 * Derives a stable ID for every `#### Scenario:` in `openspec/specs/<capability>/spec.md`,
 * scans the configured test roots for `// @covers <id>` annotations, and fails
 * when a scenario is neither annotated nor waived, when an annotation or waiver
 * points at a scenario that does not exist, or when a waiver is unjustified or
 * stale.
 *
 * Dependency-free: `node:fs` / `node:path` / `node:url` only, so the CI job that
 * runs it needs no install step.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Scenario ID separator between the requirement slug and the scenario slug. */
const SCENARIO_SEPARATOR = "#";

/**
 * Lowercase, collapse every run of non-alphanumeric characters to a single
 * dash, and trim dashes from both ends.
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Build the canonical scenario ID from its three parts. */
export function scenarioId(capability, requirement, scenario) {
  return `${capability}/${slugify(requirement)}${SCENARIO_SEPARATOR}${slugify(scenario)}`;
}

/**
 * Parse one spec file into its scenarios.
 *
 * A scenario inherits the most recent `### Requirement:` heading. A scenario
 * that appears before any requirement heading is a malformed spec and throws.
 */
export function parseSpec(content, capability) {
  const scenarios = [];
  let requirement = null;

  content.split(/\r?\n/).forEach((line, index) => {
    if (/^###\s+Requirement:/.test(line)) {
      const requirementMatch = /^###\s+Requirement:\s*(.+?)\s*$/.exec(line);
      // A heading with an empty title must not silently keep the previous
      // requirement in scope — that would mis-attribute the scenarios below it.
      if (!requirementMatch) {
        throw new Error(`${capability}: empty "### Requirement:" heading on line ${index + 1}`);
      }
      requirement = requirementMatch[1];
      return;
    }
    if (!/^####\s+Scenario:/.test(line)) return;

    const scenarioMatch = /^####\s+Scenario:\s*(.+?)\s*$/.exec(line);
    if (!scenarioMatch) {
      throw new Error(`${capability}: empty "#### Scenario:" heading on line ${index + 1}`);
    }
    if (requirement === null) {
      throw new Error(
        `${capability}: scenario "${scenarioMatch[1]}" on line ${index + 1} has no enclosing "### Requirement:" heading`,
      );
    }
    scenarios.push({
      capability,
      requirement,
      scenario: scenarioMatch[1],
      id: scenarioId(capability, requirement, scenarioMatch[1]),
      line: index + 1,
    });
  });

  return scenarios;
}

/** Canonicalize an existing path, or fall back to lexical resolution. */
function canonicalOrResolve(p) {
  return fs.existsSync(p) ? fs.realpathSync(p) : path.resolve(p);
}

/** Throw when `candidate` escapes `canonicalRoot`, using a separator-safe relative check. */
function rejectIfEscapes(canonicalRoot, candidate, label) {
  const rel = path.relative(canonicalRoot, candidate);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Path "${label}" resolves outside the repository root "${canonicalRoot}"`);
  }
}

/**
 * Resolve `sub` against `root`. Lexical containment is enforced for every
 * resolved path (existing or not), and existing paths get a second,
 * symlink-safe check after `fs.realpathSync` canonicalization.
 */
function resolveWithin(root, sub) {
  const lexicalRoot = path.resolve(root);
  const resolved = path.resolve(root, sub);
  rejectIfEscapes(lexicalRoot, resolved, sub);
  if (!fs.existsSync(resolved)) return resolved;
  const canonicalRoot = canonicalOrResolve(root);
  const canonical = fs.realpathSync(resolved);
  rejectIfEscapes(canonicalRoot, canonical, sub);
  return canonical;
}

/**
 * Collect every scenario under `specDir`, taking the capability from each
 * immediate subdirectory's name.
 *
 * Two headings that slugify to the same ID are fatal rather than deduplicated:
 * a single annotation would otherwise silently satisfy both, which destroys the
 * one-scenario-one-link guarantee the whole checker exists to provide.
 */
export function collectScenarios(root, specDir) {
  const specPath = resolveWithin(root, specDir);
  if (!fs.existsSync(specPath)) {
    throw new Error(`Spec directory not found: ${specDir}`);
  }

  const scenarios = [];
  const seen = new Map();
  const canonicalRoot = canonicalOrResolve(root);

  for (const entry of fs.readdirSync(specPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const specFileRaw = path.join(specPath, entry.name, "spec.md");
    if (!fs.existsSync(specFileRaw)) continue;
    const specFile = fs.realpathSync(specFileRaw);
    rejectIfEscapes(canonicalRoot, specFile, `${entry.name}/spec.md`);

    for (const scenario of parseSpec(fs.readFileSync(specFile, "utf8"), entry.name)) {
      const previous = seen.get(scenario.id);
      if (previous) {
        throw new Error(
          `Duplicate scenario ID "${scenario.id}": "${previous.requirement}" / "${previous.scenario}" and ` +
            `"${scenario.requirement}" / "${scenario.scenario}" slugify alike. Reword one of the headings.`,
        );
      }
      seen.set(scenario.id, scenario);
      scenarios.push({ ...scenario, file: specFile });
    }
  }

  return scenarios;
}

/**
 * Recursively list files under `dir` whose extension is in `extensions`.
 *
 * The input path is canonicalized and containment-checked against `root` before
 * any filesystem access, so an unsanitized path cannot list files outside the
 * repository root.
 */
function walk(dir, extensions, out = [], root = null) {
  let canonicalDir = dir;
  let canonicalRoot = null;
  if (fs.existsSync(dir)) {
    canonicalDir = fs.realpathSync(dir);
  }
  if (root) {
    canonicalRoot = canonicalOrResolve(root);
    rejectIfEscapes(canonicalRoot, canonicalDir, dir);
  }
  for (const entry of fs.readdirSync(canonicalDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(canonicalDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "target" || entry.name === ".git") continue;
      walk(full, extensions, out, root);
    } else if (extensions.includes(path.extname(entry.name))) {
      let file = full;
      if (canonicalRoot && fs.existsSync(full)) {
        file = fs.realpathSync(full);
        rejectIfEscapes(canonicalRoot, file, entry.name);
      }
      out.push(file);
    }
  }
  return out;
}

const RUST_TEST_ATTR = /#\[\s*(?:tokio::)?test\b/;
const RUST_IGNORE = /#\[\s*ignore\b/;
// `it(`, `test(`, `describe(`, and their `.each` / `.concurrent` forms.
const TS_ACTIVE_TEST = /(^|[^.\w])(it|test|describe|bench)(\.(?:each|concurrent|sequential|only|failing))?\s*\(/;
// Anything that registers no executable assertion: `.skip`, `.todo`, `xit`, `xdescribe`.
const TS_SKIPPED_TEST = /(^|[^.\w])(?:(it|test|describe)\.(?:skip|todo)|x(?:it|describe))\s*\(/;

/**
 * Classify what an annotation sits above.
 *
 * Only an annotation directly above an **active test** counts as verification.
 * This is what stops a stray or copy-pasted `// @covers` in production source
 * (the scan reaches `src/` and `src-tauri/src/`, not only test files) from
 * marking a scenario verified when no test runs it, and what rejects an
 * annotation left above a skipped or `#[ignore]`d test.
 *
 * Returns the classification and the declaration text (for the report).
 */
function classifyAnnotation(lines, annotationIndex, ext) {
  const isRust = ext === ".rs";
  const collected = [];
  let declaration = "";

  for (let i = annotationIndex + 1; i < Math.min(lines.length, annotationIndex + 8); i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "") continue;
    collected.push(trimmed);

    if (isRust) {
      // Rust attributes precede the `fn`; keep collecting until the signature.
      if (/^(pub\s+)?(async\s+)?fn\s/.test(trimmed)) {
        declaration = trimmed;
        break;
      }
      if (!trimmed.startsWith("#[") && !trimmed.startsWith("//")) {
        // A non-attribute, non-fn line: not a test declaration.
        declaration = trimmed;
        break;
      }
    } else if (!trimmed.startsWith("//")) {
      // The first non-comment line is the declaration (stacked annotations skip).
      declaration = trimmed;
      break;
    }
    if (collected.length >= 6) break;
  }

  const block = collected.join("\n");
  let kind;
  if (isRust) {
    kind = RUST_IGNORE.test(block) ? "skipped" : RUST_TEST_ATTR.test(block) ? "test" : "non-test";
  } else {
    kind = TS_SKIPPED_TEST.test(block) ? "skipped" : TS_ACTIVE_TEST.test(block) ? "test" : "non-test";
  }
  return { kind, declaration: declaration.replace(/\s*\{\s*$/, "").slice(0, 120) };
}

/**
 * Scan the test roots for `// @covers <id>` annotations that sit above an
 * active test.
 *
 * Annotations above non-test code are dropped (a scenario relying on one stays
 * unverified, which fails the gate loudly rather than passing falsely).
 * Annotations above a skipped/ignored test are returned with `skipped: true` so
 * the caller can reject them explicitly.
 *
 * A configured root that does not exist is skipped rather than fatal:
 * `src-tauri/tests/` is a directory this project may or may not have yet.
 */
export function scanAnnotations(root, testRoots, testExtensions) {
  const annotations = [];

  for (const testRoot of testRoots) {
    const absoluteRoot = resolveWithin(root, testRoot);
    if (!fs.existsSync(absoluteRoot)) continue;

    for (const file of walk(absoluteRoot, testExtensions, undefined, root)) {
      const ext = path.extname(file);
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const match = /^\s*\/\/\s*@covers\s+(\S+)\s*$/.exec(line);
        if (!match) return;
        const { kind, declaration } = classifyAnnotation(lines, index, ext);
        if (kind === "non-test") return; // stray annotation: ignore, don't let it verify anything
        annotations.push({
          id: match[1],
          file: path.relative(root, file),
          line: index + 1,
          declaration,
          skipped: kind === "skipped",
        });
      });
    }
  }

  return annotations;
}

/**
 * Cross-check scenarios, annotations and waivers.
 *
 * Returns the full picture rather than a boolean so `--report` and the failure
 * output are built from one traversal.
 */
export function validate(scenarios, annotations, waivers) {
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  // Only annotations above an active test are covering; a skipped one is
  // tracked separately so it becomes an explicit error rather than silently
  // leaving its scenario "unverified".
  const covering = annotations.filter((annotation) => !annotation.skipped);
  const skipped = annotations.filter((annotation) => annotation.skipped);
  const annotationsById = new Map();
  for (const annotation of covering) {
    if (!annotationsById.has(annotation.id)) annotationsById.set(annotation.id, []);
    annotationsById.get(annotation.id).push(annotation);
  }
  const waiversById = new Map(waivers.map((waiver) => [waiver.id, waiver]));

  const errors = [];

  for (const annotation of skipped) {
    errors.push(
      `Annotation at ${annotation.file}:${annotation.line} for "${annotation.id}" sits above a ` +
        `skipped or ignored test, so the scenario is not actually verified. Re-enable the test or waive it.`,
    );
  }

  for (const waiver of waivers) {
    if (!waiver.id) {
      errors.push(`Waiver entry has no "id".`);
      continue;
    }
    if (!waiver.reason || !waiver.manualVerification) {
      errors.push(
        `Waiver "${waiver.id}" must state both a "reason" and a "manualVerification" procedure.`,
      );
    }
    if (!byId.has(waiver.id)) {
      errors.push(`Waiver "${waiver.id}" names a scenario that does not exist.`);
    }
    if (annotationsById.has(waiver.id)) {
      const where = annotationsById.get(waiver.id).map((a) => `${a.file}:${a.line}`).join(", ");
      errors.push(
        `Waiver "${waiver.id}" is stale: the scenario is verified by ${where}. Remove the waiver.`,
      );
    }
  }

  for (const annotation of covering) {
    if (!byId.has(annotation.id)) {
      errors.push(
        `Dangling annotation at ${annotation.file}:${annotation.line}: "${annotation.id}" matches no scenario.`,
      );
    }
  }

  const results = scenarios.map((scenario) => {
    const covering = annotationsById.get(scenario.id) ?? [];
    const waiver = waiversById.get(scenario.id);
    const status = covering.length > 0 ? "verified" : waiver ? "waived" : "unverified";
    return { ...scenario, status, annotations: covering, waiver };
  });

  for (const result of results) {
    if (result.status === "unverified") {
      errors.push(
        `Unverified scenario "${result.id}" (${result.capability}: ${result.scenario}) — ` +
          `add a "// @covers ${result.id}" annotation to the test that verifies it, or waive it.`,
      );
    }
  }

  return {
    results,
    errors,
    counts: {
      verified: results.filter((r) => r.status === "verified").length,
      waived: results.filter((r) => r.status === "waived").length,
      unverified: results.filter((r) => r.status === "unverified").length,
      total: results.length,
    },
  };
}

/** Render the traceability matrix a reviewer can audit without reading this file. */
export function formatReport({ results, counts }) {
  const lines = ["Spec-to-test traceability matrix", ""];
  let capability = null;
  let requirement = null;

  for (const result of results) {
    if (result.capability !== capability) {
      capability = result.capability;
      requirement = null;
      lines.push(`## ${capability}`);
    }
    if (result.requirement !== requirement) {
      requirement = result.requirement;
      lines.push(`  Requirement: ${requirement}`);
    }
    const marker = { verified: "[x]", waived: "[~]", unverified: "[ ]" }[result.status];
    lines.push(`    ${marker} ${result.scenario}`);
    lines.push(`        id: ${result.id}`);
    if (result.status === "verified") {
      for (const annotation of result.annotations) {
        lines.push(`        ${annotation.file}:${annotation.line} ${annotation.declaration}`);
      }
    } else if (result.status === "waived") {
      lines.push(`        waived: ${result.waiver.reason}`);
      lines.push(`        manual: ${result.waiver.manualVerification}`);
    }
  }

  lines.push("");
  lines.push(
    `${counts.verified} verified, ${counts.waived} waived, ${counts.unverified} unverified ` +
      `(${counts.total} scenarios)`,
  );
  return lines.join("\n");
}

/**
 * Read the checker's configuration; the repository root is the config's parent
 * directory. The path is validated and canonicalized before the read, so an
 * unsanitized path cannot be used as a filesystem path.
 *
 * A config file that is a symlink is accepted (statSync follows links); the
 * repository root is derived from the symlink's location, not its target, so a
 * linked config still anchors the check to the repository where it was invoked.
 */
export function loadConfig(configPath) {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Config path "${configPath}" does not exist or is not a regular file`);
  }
  const raw = JSON.parse(fs.readFileSync(fs.realpathSync(resolved), "utf8"));
  return {
    root: path.resolve(path.dirname(configPath), ".."),
    specDir: raw.specDir ?? "openspec/specs",
    testRoots: raw.testRoots ?? [],
    testExtensions: raw.testExtensions ?? [".ts", ".tsx", ".rs", ".mjs"],
    waivers: raw.waivers ?? [],
  };
}

/** Run the whole check. Returns the process exit code. */
export function run(argv, stdout = console.log, stderr = console.error) {
  const report = argv.includes("--report");
  const configIndex = argv.indexOf("--config");
  const defaultConfig = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "spec-coverage.config.json",
  );
  let configPath;
  if (configIndex === -1) {
    configPath = defaultConfig;
  } else if (configIndex + 1 >= argv.length) {
    stderr("spec-coverage: missing value for --config");
    return 1;
  } else {
    configPath = path.resolve(argv[configIndex + 1]);
  }

  let config;
  let outcome;
  try {
    config = loadConfig(configPath);
    const scenarios = collectScenarios(config.root, config.specDir);
    const annotations = scanAnnotations(config.root, config.testRoots, config.testExtensions);
    outcome = validate(scenarios, annotations, config.waivers);
  } catch (error) {
    stderr(`spec-coverage: ${error.message}`);
    return 1;
  }

  if (report) stdout(formatReport(outcome));

  if (outcome.errors.length > 0) {
    stderr("");
    stderr(`spec-coverage: ${outcome.errors.length} problem(s) found`);
    for (const error of outcome.errors) stderr(`  - ${error}`);
    return 1;
  }

  if (!report) {
    stdout(
      `spec-coverage: ${outcome.counts.verified} verified, ${outcome.counts.waived} waived, ` +
        `0 unverified (${outcome.counts.total} scenarios)`,
    );
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)));
}
