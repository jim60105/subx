/**
 * Gate-arming assertions.
 *
 * Some `verification-gates` scenarios are about the gates themselves — the
 * coverage floors, and CI running every gate. Driving the real behaviour would
 * mean a second Vitest against an under-covered fixture and a second
 * `cargo llvm-cov` build, minutes of CI to test behaviour that belongs to
 * Vitest and cargo-llvm-cov and that both already test. So these assert the
 * mechanism is *armed* — the thresholds are declared, the CI file invokes every
 * gate and suppresses none of them — and rely on CI running the real gates on
 * every push to catch a gate that is armed but broken.
 *
 * This is deliberately the weakest link in the design; it is written down as
 * such in the change's design.md (D4).
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(__dirname, "..");

const VITE_CONFIG = fs.readFileSync(path.join(REPO, "vite.config.ts"), "utf8");
const CARGO_CONFIG = fs.readFileSync(
  path.join(REPO, "src-tauri", ".cargo", "config.toml"),
  "utf8",
);
const PACKAGE_JSON = JSON.parse(
  fs.readFileSync(path.join(REPO, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("the frontend coverage gate is armed", () => {
  // @covers verification-gates/enforced-minimum-test-coverage-in-both-languages#frontend-coverage-below-the-floor-fails-the-run
  // @covers verification-gates/enforced-minimum-test-coverage-in-both-languages#the-threshold-lives-in-the-repository
  it("declares every Vitest threshold at 85 or above", () => {
    const thresholds = /thresholds:\s*\{([^}]*)\}/.exec(VITE_CONFIG);
    expect(thresholds, "vite.config.ts must declare coverage.thresholds").not.toBeNull();

    const declared = [...thresholds![1].matchAll(/(statements|branches|functions|lines):\s*(\d+)/g)];
    const byMetric = Object.fromEntries(declared.map((m) => [m[1], Number(m[2])]));

    for (const metric of ["statements", "branches", "functions", "lines"]) {
      expect(byMetric[metric], `${metric} threshold`).toBeGreaterThanOrEqual(85);
    }
  });

  // @covers verification-gates/coverage-measurement-scope-is-declared-and-everything-else-is-counted#a-new-untested-module-lowers-coverage
  it("measures every first-party file, not only imported ones", () => {
    expect(VITE_CONFIG).toMatch(/all:\s*true/);
    expect(VITE_CONFIG).toMatch(/include:\s*\[[^\]]*src\/\*\*/);
  });

  // @covers verification-gates/coverage-measurement-scope-is-declared-and-everything-else-is-counted#exclusions-are-enumerated-never-implicit
  it("enumerates its exclusions individually, with no wildcard over measurable source", () => {
    const exclude = /exclude:\s*\[([\s\S]*?)\]/.exec(VITE_CONFIG);
    expect(exclude, "vite.config.ts must declare coverage.exclude").not.toBeNull();

    const entries = [...exclude![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(entries).toContain("src/main.tsx");
    expect(entries).toContain("src/navigation/screens.ts");
    // No entry silently swallows measurable production source.
    expect(entries).not.toContain("src/**");
    expect(entries).not.toContain("src/**/*.{ts,tsx}");
  });
});

describe("the backend coverage gate is armed", () => {
  // @covers verification-gates/enforced-minimum-test-coverage-in-both-languages#backend-coverage-below-the-floor-fails-the-run
  // @covers verification-gates/enforced-minimum-test-coverage-in-both-languages#the-threshold-lives-in-the-repository
  it("carries all three fail-under flags at 85 in the cov alias", () => {
    for (const flag of ["--fail-under-lines", "--fail-under-functions", "--fail-under-regions"]) {
      const value = new RegExp(`"${flag}",\\s*"(\\d+)"`).exec(CARGO_CONFIG);
      expect(value, `${flag} must be present`).not.toBeNull();
      expect(Number(value![1]), flag).toBeGreaterThanOrEqual(85);
    }
  });

  it("drops the unmeasurable entry points and the stdlib from the report", () => {
    expect(CARGO_CONFIG).toMatch(/--ignore-filename-regex/);
    expect(CARGO_CONFIG).toContain("main|lib");
    expect(CARGO_CONFIG).toContain("rustlib");
  });
});

describe("the local verify script is the primary defence, so it is armed too", () => {
  it("chains every gate and lets any one of them fail the whole run", () => {
    // With no pull-request flow this script — not CI — is what actually stops a
    // broken commit, so it must run every gate and short-circuit on the first
    // failure (`&&`), never swallow an exit code (`||`, `; true`).
    const verify = PACKAGE_JSON.scripts.verify;
    expect(verify, "package.json must define a verify script").toBeTruthy();

    expect(verify).toMatch(/tsc --noEmit/);
    expect(verify).toMatch(/test:coverage/);
    expect(verify).toMatch(/test:rust:coverage/);
    expect(verify).toMatch(/spec:trace/);
    expect(verify).toMatch(/bindings:check/);

    // Sub-scripts joined with `&&` (fail-fast), and no failure suppression.
    expect(verify).toMatch(/&&/);
    expect(verify).not.toMatch(/\|\|/);
    expect(verify).not.toMatch(/;\s*true/);
  });

  // @covers typed-ipc/generated-bindings-are-committed-and-protected-against-drift#stale-committed-bindings-fail-the-gate
  it("checks bindings drift by regenerating and diffing, with no suppression", () => {
    // The gate is only a gate if the diff's exit status is the script's: a
    // regeneration whose result nothing compares would pass silently.
    const check = PACKAGE_JSON.scripts["bindings:check"];
    expect(check, "package.json must define a bindings:check script").toBeTruthy();

    expect(check).toMatch(/bindings:generate/);
    expect(check).toMatch(/git diff --exit-code/);
    expect(check).toContain("src/types/bindings.ts");
    expect(check).not.toMatch(/\|\|/);
    // `git diff` says nothing about an untracked file, so without this the gate
    // would pass vacuously the moment the generated file left the index.
    expect(check).toMatch(/git ls-files --error-unmatch/);

    // And the regeneration it chains must actually run the export test.
    expect(PACKAGE_JSON.scripts["bindings:generate"]).toMatch(/export_bindings/);
  });

  it("runs the backend gate through the alias that carries the floor", () => {
    // `cargo cov` (not a bare `cargo test`) is what applies the --fail-under
    // flags; a `cd` into src-tauri is required for cargo to see the alias.
    expect(PACKAGE_JSON.scripts["test:rust:coverage"]).toMatch(/cargo cov/);
  });
});
