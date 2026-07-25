/**
 * Native file selection, shared by every wizard that takes sources.
 *
 * These are not IPC commands — they are Tauri plugin and webview calls — so
 * they sit outside the per-feature `*Api.ts` modules that wrap `commands`.
 * Extracted here when the convert wizard needed the same three affordances the
 * match wizard already had; a second copy would have been the moment they
 * started to drift.
 */

import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

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
