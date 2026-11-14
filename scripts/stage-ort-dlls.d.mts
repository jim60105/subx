/**
 * Type declarations for scripts/stage-ort-dlls.mjs.
 * Kept in sync by hand — update alongside any exported signature change.
 */

export interface StageOrtDllsOptions {
  triple?: string;
  rootDir?: string;
}

export function stageOrtDlls(options?: StageOrtDllsOptions): string[];

export function run(
  stdout?: (output: string) => void,
  stderr?: (output: string) => void,
  options?: StageOrtDllsOptions,
): number;
