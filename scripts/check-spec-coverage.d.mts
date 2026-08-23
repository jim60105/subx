/**
 * Types for the traceability checker. The checker itself is plain ESM so the CI
 * job can run it with no install step; this file is what lets its Vitest suite
 * be type-checked alongside the rest of the project.
 */

export interface Scenario {
  capability: string;
  requirement: string;
  scenario: string;
  id: string;
  line?: number;
  file?: string;
}

export interface Annotation {
  id: string;
  file: string;
  line: number;
  declaration: string;
  /** True when the annotation sits above a skipped or ignored test. */
  skipped?: boolean;
}

export interface Waiver {
  id: string;
  reason?: string;
  manualVerification?: string;
}

export type ScenarioStatus = "verified" | "waived" | "unverified";

export interface ScenarioResult extends Scenario {
  status: ScenarioStatus;
  annotations: Annotation[];
  waiver?: Waiver;
}

export interface Outcome {
  results: ScenarioResult[];
  errors: string[];
  counts: { verified: number; waived: number; unverified: number; total: number };
}

export interface Config {
  root: string;
  specDir: string;
  testRoots: string[];
  testExtensions: string[];
  waivers: Waiver[];
}

export function slugify(text: string): string;
export function scenarioId(capability: string, requirement: string, scenario: string): string;
export function parseSpec(content: string, capability: string): Scenario[];
export function collectScenarios(root: string, specDir: string): Scenario[];
export function scanAnnotations(
  root: string,
  testRoots: string[],
  testExtensions: string[],
): Annotation[];
export function validate(
  scenarios: Scenario[],
  annotations: Annotation[],
  waivers: Waiver[],
): Outcome;
export function formatReport(outcome: Pick<Outcome, "results" | "counts">): string;
export function loadConfig(configPath: string): Config;
export function run(
  argv: string[],
  stdout?: (line: string) => void,
  stderr?: (line: string) => void,
): number;
