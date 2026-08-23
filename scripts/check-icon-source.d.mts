/**
 * Type declarations for scripts/check-icon-source.mjs.
 * Kept in sync by hand — update alongside any exported signature change.
 */

export interface CheckIconSourceOptions {
  recordPath?: string;
  rootDir?: string;
}

export interface CheckIconSourceResult {
  ok: boolean;
  problems: string[];
}

export function checkIconSource(options?: CheckIconSourceOptions): CheckIconSourceResult;

export function run(
  stdout?: (output: string) => void,
  stderr?: (output: string) => void,
  options?: CheckIconSourceOptions,
): number;
