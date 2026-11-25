import { useCallback, useEffect, useRef, useState } from "react";

import type { ErrorDto, PreviewCueDto, PreviewSessionDto } from "../../types/ipc";
import {
  closePreview,
  loadPreviewCues,
  openPreview,
  preparePreviewAudio,
  releasePreviewAudio,
} from "./previewApi";

export type PreviewMedia =
  | { status: "none" }
  | { status: "opening" }
  | { status: "video"; url: string }
  | { status: "preparing"; reason: "failed" | "requested" }
  | { status: "audio"; url: string }
  | { status: "unavailable"; error: unknown; canReturn: boolean };

export interface PreviewSession {
  media: PreviewMedia;
  cues: readonly PreviewCueDto[];
  /** Why the cues could not be loaded, or `undefined`. */
  cueError: unknown;
  onMediaError: () => void;
  requestAudio: () => void;
  returnToVideo: () => void;
}

/** What the media element's own failure is reported as while audio plays. */
export const MEDIA_ELEMENT_ERROR: ErrorDto = {
  code: "preview.media_unreadable",
  message: "the media element failed",
  hintCode: null,
};

const noop = () => {};

/**
 * Every open and close, from any mount, runs after the previous one settled.
 *
 * The backend keeps one session and an open replaces the previous one, so a
 * close that overtook a newer open would revoke the wrong URL. Module-level so
 * a remount (StrictMode's included) shares the order with the mount it follows.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue(task: () => Promise<unknown>): void {
  const run = queue.then(task);
  // A rejection is the caller's to handle; it must not stall the chain.
  queue = run.catch(noop);
}

/** Drops any pending chain so one test's unsettled open cannot hold the next. */
export function resetPreviewQueueForTests(): void {
  queue = Promise.resolve();
}

/**
 * The offset step's preview session and its media state machine.
 *
 * Picture first; decoded audio when the element fails or the user asks for it;
 * otherwise unavailable, with the reason. Nothing here gates editing or
 * Continue: every state, `opening` that never settles included, leaves both
 * available.
 */
export function usePreviewSession(mediaPath: string | null, subtitlePath: string | null): PreviewSession {
  const [media, setMedia] = useState<PreviewMedia>(() =>
    mediaPath === null ? { status: "none" } : { status: "opening" },
  );
  // Handlers read the state synchronously and start side effects from it,
  // which an updater function must not do.
  const mediaRef = useRef(media);
  const update = useCallback((next: PreviewMedia) => {
    mediaRef.current = next;
    setMedia(next);
  }, []);

  const sessionRef = useRef<PreviewSessionDto | null>(null);
  // Whether the session's video played before the user switched to audio,
  // i.e. whether returning to it makes sense.
  const videoPlayable = useRef(false);
  // The session whose audio is being prepared, so a stale preparation of an
  // earlier session never blocks the current one.
  const preparingFor = useRef<string | null>(null);
  const pendingRelease = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (mediaPath === null) {
      update({ status: "none" });
      return;
    }
    let cancelled = false;
    let opened: PreviewSessionDto | null = null;
    update({ status: "opening" });

    enqueue(async () => {
      // Left before our turn came, e.g. StrictMode's first mount: never open.
      if (cancelled) return;
      try {
        const session = await openPreview(mediaPath);
        if (cancelled) {
          // Closed inside the same queued task, so it lands before any newer open.
          await closePreview(session.sessionId).catch(noop);
          return;
        }
        opened = session;
        sessionRef.current = session;
        videoPlayable.current = false;
        update({ status: "video", url: session.url });
      } catch (error) {
        if (!cancelled) update({ status: "unavailable", error, canReturn: false });
      }
    });

    return () => {
      cancelled = true;
      if (opened === null) return;
      const { sessionId } = opened;
      if (sessionRef.current?.sessionId === sessionId) sessionRef.current = null;
      enqueue(() => closePreview(sessionId).catch(noop));
    };
  }, [mediaPath, update]);

  const startPreparing = useCallback(() => {
    const session = sessionRef.current;
    if (session === null || preparingFor.current === session.sessionId) return;
    const { sessionId } = session;
    preparingFor.current = sessionId;
    // Not queued: a close must be able to cancel a slow preparation.
    const stillWanted = () =>
      sessionRef.current?.sessionId === sessionId && mediaRef.current.status === "preparing";
    void (pendingRelease.current ?? Promise.resolve())
      .then(() => preparePreviewAudio(sessionId))
      .then(
        (url) => {
          if (stillWanted()) update({ status: "audio", url });
        },
        (error: unknown) => {
          if (stillWanted()) update({ status: "unavailable", error, canReturn: videoPlayable.current });
        },
      )
      .finally(() => {
        if (preparingFor.current === sessionId) preparingFor.current = null;
      });
  }, [update]);

  const onMediaError = useCallback(() => {
    const current = mediaRef.current;
    if (current.status === "video") {
      videoPlayable.current = false;
      update({ status: "preparing", reason: "failed" });
      startPreparing();
    } else if (current.status === "audio") {
      update({ status: "unavailable", error: MEDIA_ELEMENT_ERROR, canReturn: videoPlayable.current });
      const session = sessionRef.current;
      if (session === null) return;
      // Released at once: returning to the video no longer needs the WAV.
      const release = releasePreviewAudio(session.sessionId).catch(noop);
      pendingRelease.current = release;
      void release.then(() => {
        if (pendingRelease.current === release) pendingRelease.current = null;
      });
    }
  }, [startPreparing, update]);

  const requestAudio = useCallback(() => {
    if (mediaRef.current.status !== "video") return;
    videoPlayable.current = true;
    update({ status: "preparing", reason: "requested" });
    startPreparing();
  }, [startPreparing, update]);

  const returnToVideo = useCallback(() => {
    const current = mediaRef.current;
    const session = sessionRef.current;
    if (current.status !== "unavailable" || !current.canReturn || session === null) return;
    update({ status: "video", url: session.url });
  }, [update]);

  const [cues, setCues] = useState<readonly PreviewCueDto[]>([]);
  const [cueError, setCueError] = useState<unknown>(undefined);
  useEffect(() => {
    setCues([]);
    setCueError(undefined);
    if (subtitlePath === null) return;
    let cancelled = false;
    loadPreviewCues(subtitlePath).then(
      (loaded) => {
        if (!cancelled) setCues(loaded);
      },
      (error: unknown) => {
        if (!cancelled) setCueError(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [subtitlePath]);

  return { media, cues, cueError, onMediaError, requestAudio, returnToVideo };
}
