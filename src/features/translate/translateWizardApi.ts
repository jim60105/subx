import { commands } from "../../types/bindings";
import { Channel } from "../../types/channel";
import type {
  TranslateOptionsDto,
  TranslatePlanDto,
  TranslateProgress,
  TranslateScanResult,
  TranslationReportDto,
} from "../../types/ipc";

/**
 * The translate wizard's backend surface, one thin wrapper per command. Every
 * backend call goes through the generated `commands`; the native pickers live
 * in `platform/filePickers`.
 */

/**
 * Step 1's scan. Takes paths only: the target language a plan needs is not
 * asked for until Step 2, so scanning must not depend on it.
 */
export function scanTranslateInputs(paths: string[]): Promise<TranslateScanResult> {
  return commands.listTranslateInputs(paths);
}

export function previewTranslation(
  paths: string[],
  options: TranslateOptionsDto,
): Promise<TranslatePlanDto> {
  return commands.previewTranslation(paths, options);
}

/**
 * Runs a plan's selected items, streaming per-file progress to `onProgress`.
 *
 * The generated command takes a `Channel<TranslateProgress>`; we own the
 * channel and forward each message. The promise resolves with the report or
 * rejects with an `ErrorDto` (commands reject rather than resolving a tagged
 * result).
 */
export function executeTranslation(
  planId: string,
  itemIds: number[],
  onProgress: (progress: TranslateProgress) => void,
): Promise<TranslationReportDto> {
  const channel = new Channel<TranslateProgress>();
  channel.onmessage = onProgress;
  return commands.executeTranslation(planId, itemIds, channel);
}

export function cancelTranslation(): Promise<void> {
  return commands.cancelTranslation().then(() => undefined);
}
