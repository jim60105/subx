/**
 * Type declarations for scripts/generate-icons.mjs.
 * Kept in sync by hand — update alongside any exported signature change.
 */

export const MASTER_SOURCE: string;
export const MACOS_SOURCE: string;
export const ICONS_DIR: string;
export const RECORD_FILENAME: string;

export function sha256File(filePath: string): string;

export function removeUnshippedPlatformOutput(iconsDir?: string): void;

export function assertMacosIcnsProduced(tempDir: string): string;

export function assertMasterOutputProduced(tempDir: string): void;

export function listOutputFiles(iconsDir: string): string[];

export interface GenerationRecordSource {
  path: string;
  sha256: string;
}

export interface GenerationRecord {
  sources: {
    master: GenerationRecordSource;
    macos: GenerationRecordSource;
  };
  outputs: Record<string, "master" | "macos">;
}

export function buildGenerationRecord(args: {
  masterPath: string;
  macosPath: string;
  outputFiles: string[];
}): GenerationRecord;

export function writeGenerationRecord(recordPath: string, record: GenerationRecord): void;

export function generateIcons(options?: {
  masterSource?: string;
  macosSource?: string;
  iconsDir?: string;
}): void;
