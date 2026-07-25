import { commands } from "../../types/bindings";
import type { SyncApplyResultDto, SyncDefaultsDto, SyncDetectionDto } from "../../types/ipc";

/**
 * The sync wizard's backend surface, one thin wrapper per command. Every
 * backend call goes through the generated `commands`; the native pickers live
 * in `platform/filePickers`.
 */

export function getSyncDefaults(): Promise<SyncDefaultsDto> {
  return commands.getSyncDefaults();
}

/**
 * Runs one local VAD detection over the pair.
 *
 * `sensitivity` is a per-run override — passing `null` uses whatever the shared
 * configuration holds, and neither form writes the configuration file.
 */
export function detectSyncOffset(
  mediaPath: string,
  subtitlePath: string,
  sensitivity: number | null,
): Promise<SyncDetectionDto> {
  return commands.detectSyncOffset(mediaPath, subtitlePath, sensitivity);
}

export function cancelSyncDetection(): Promise<void> {
  return commands.cancelSyncDetection().then(() => undefined);
}

/**
 * Shifts the subtitle by `offsetMs` into `outputPath`.
 *
 * `outputPath` may be `null`, which asks the backend for the default `_synced`
 * name. `overwrite` is only ever `true` on the retry that follows a
 * `sync.output_exists` rejection the user confirmed.
 */
export function applySyncOffset(
  subtitlePath: string,
  offsetMs: number,
  outputPath: string | null,
  overwrite: boolean,
): Promise<SyncApplyResultDto> {
  return commands.applySyncOffset(subtitlePath, offsetMs, outputPath, overwrite);
}
