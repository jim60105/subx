import { commands } from "../../types/bindings";
import { Channel } from "../../types/channel";
import type {
  ConversionReportDto,
  ConvertOptionsDto,
  ConvertPlanDto,
  ConvertProgress,
  ConvertScanResult,
} from "../../types/ipc";

/**
 * The convert wizard's backend surface, one thin wrapper per command. Every
 * backend call goes through the generated `commands`; the native pickers live
 * in `platform/filePickers`.
 */

export function scanConvertInputs(paths: string[]): Promise<ConvertScanResult> {
  return commands.listConvertInputs(paths);
}

export function previewConversion(
  paths: string[],
  options: ConvertOptionsDto,
): Promise<ConvertPlanDto> {
  return commands.previewConversion(paths, options);
}

/**
 * Runs a plan's selected items, streaming per-file progress to `onProgress`.
 *
 * The generated command takes a `Channel<ConvertProgress>`; we own the channel
 * and forward each message. The promise resolves with the report or rejects
 * with an `ErrorDto` (commands reject rather than resolving a tagged result).
 */
export function executeConversion(
  planId: string,
  itemIds: number[],
  onProgress: (progress: ConvertProgress) => void,
): Promise<ConversionReportDto> {
  const channel = new Channel<ConvertProgress>();
  channel.onmessage = onProgress;
  return commands.executeConversion(planId, itemIds, channel);
}

export function cancelConversion(): Promise<void> {
  return commands.cancelConversion().then(() => undefined);
}
