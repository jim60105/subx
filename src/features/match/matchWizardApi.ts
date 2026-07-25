import { commands } from "../../types/bindings";
import { Channel } from "../../types/channel";
import type {
  ExecutionReportDto,
  MatchPlanDto,
  MatchProgress,
  RelocationModeDto,
  SourceScanResult,
} from "../../types/ipc";

/**
 * The match wizard's backend surface, one thin wrapper per command. Every
 * backend call goes through the generated `commands`; the native pickers and
 * the drag-drop subscription live in `platform/filePickers`, shared with the
 * other wizards.
 */

export function scanSources(paths: string[]): Promise<SourceScanResult> {
  return commands.listSourceFiles(paths);
}

/**
 * Starts an analysis, streaming stage updates to `onProgress`.
 *
 * The generated command takes a `Channel<MatchProgress>`; we own the channel and
 * forward each message. The promise resolves with the plan or rejects with an
 * `ErrorDto` (commands reject rather than resolving a tagged result).
 */
export function analyzeSources(
  paths: string[],
  mode: RelocationModeDto,
  onProgress: (progress: MatchProgress) => void,
): Promise<MatchPlanDto> {
  const channel = new Channel<MatchProgress>();
  channel.onmessage = onProgress;
  return commands.analyzeSources(paths, mode, channel);
}

export function cancelAnalysis(): Promise<void> {
  return commands.cancelAnalysis().then(() => undefined);
}

export function executeSelected(
  planId: string,
  operationIds: number[],
): Promise<ExecutionReportDto> {
  return commands.executeSelected(planId, operationIds);
}
