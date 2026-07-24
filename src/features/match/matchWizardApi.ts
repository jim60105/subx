import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

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
 * The match wizard's backend surface, one thin wrapper per command plus the two
 * platform pickers. Every backend call goes through the generated `commands`.
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

/** Opens the native picker for one or more files. Empty when cancelled. */
export async function pickFiles(): Promise<string[]> {
  const selection = await open({ multiple: true, directory: false });
  if (selection === null) return [];
  return Array.isArray(selection) ? selection : [selection];
}

/** Opens the native picker for a single folder. Empty when cancelled. */
export async function pickFolder(): Promise<string[]> {
  const selection = await open({ directory: true, multiple: false });
  return selection === null ? [] : [selection as string];
}

/**
 * Subscribes to OS file drops on the window, delivering the dropped paths.
 * Resolves to an unlisten function.
 */
export function subscribeToDroppedPaths(
  onPaths: (paths: string[]) => void,
): Promise<() => void> {
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop") onPaths(event.payload.paths);
  });
}
