/**
 * Type declarations for scripts/release-notes.mjs.
 */

export interface RenderReleaseNotesOptions {
  changelogPath?: string;
  footerPath?: string;
}

export function extractChangelogSection(
  changelogContent: string,
  rawVersion: string,
): string | null;

export function renderReleaseNotes(
  rawVersion: string,
  options?: RenderReleaseNotesOptions,
): string;

export function run(
  argv?: string[],
  stdout?: (output: string) => void,
  stderr?: (output: string) => void,
): number;
