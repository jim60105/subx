import { commands } from "../../types/bindings";
import type { PreviewCueDto, PreviewSessionDto } from "../../types/ipc";

/**
 * The offset step's preview surface, one thin wrapper per command.
 *
 * Kept apart from `syncWizardApi.ts` so the wizard tests' automocks of that
 * module keep working unchanged; tests mock this one with resolved defaults.
 */

/** The subtitle's cues in file order, read by the same loader apply uses. */
export function loadPreviewCues(subtitlePath: string): Promise<PreviewCueDto[]> {
  return commands.loadPreviewCues(subtitlePath);
}

/** Publishes the media over loopback and returns the one open session. */
export function openPreview(mediaPath: string): Promise<PreviewSessionDto> {
  return commands.openPreview(mediaPath);
}

/** Decodes the session's audio and resolves to the WAV's loopback URL. */
export function preparePreviewAudio(sessionId: string): Promise<string> {
  return commands.preparePreviewAudio(sessionId).then((audio) => audio.url);
}

/** Gives the session's audio up without closing the session. */
export function releasePreviewAudio(sessionId: string): Promise<void> {
  return commands.releasePreviewAudio(sessionId).then(() => undefined);
}

/** Revokes the session's URL; a stale or repeated id is ignored by the backend. */
export function closePreview(sessionId: string): Promise<void> {
  return commands.closePreview(sessionId).then(() => undefined);
}
