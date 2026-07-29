/**
 * Type declarations for scripts/check-release-tag.mjs.
 */

export interface CheckReleaseTagOptions {
  packageJsonPath?: string;
}

export interface CheckReleaseTagResult {
  valid: boolean;
  tag: string;
  expectedTag: string;
  version: string;
}

export function checkReleaseTag(
  tag: string,
  options?: CheckReleaseTagOptions,
): CheckReleaseTagResult;

export function run(
  argv?: string[],
  stdout?: (output: string) => void,
  stderr?: (output: string) => void,
): number;
