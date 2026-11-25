import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PreviewCueDto, PreviewSessionDto } from "../../types/ipc";
import { MEDIA_ELEMENT_ERROR, resetPreviewQueueForTests, usePreviewSession } from "./usePreviewSession";

vi.mock("./previewApi");
import * as api from "./previewApi";

const MEDIA = "/m/episode.mkv";
const SUBTITLE = "/m/episode.srt";
const SESSION: PreviewSessionDto = { sessionId: "s1", url: "http://127.0.0.1:9/s1" };
const AUDIO_URL = "http://127.0.0.1:9/s1/audio";
const CUES: PreviewCueDto[] = [{ startMs: 0, endMs: 1_000, text: "hello" }];
const FAILURE = { code: "preview.audio_unsupported", message: "no audio", hintCode: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderSession(mediaPath: string | null = MEDIA, subtitlePath: string | null = SUBTITLE) {
  return renderHook(
    ({ media, subtitle }: { media: string | null; subtitle: string | null }) =>
      usePreviewSession(media, subtitle),
    { initialProps: { media: mediaPath, subtitle: subtitlePath } },
  );
}

/** Opens a session and waits until its video is shown. */
async function openedSession() {
  const hook = renderSession();
  await waitFor(() => expect(hook.result.current.media).toEqual({ status: "video", url: SESSION.url }));
  return hook;
}

beforeEach(() => {
  resetPreviewQueueForTests();
  vi.mocked(api.loadPreviewCues).mockResolvedValue(CUES);
  vi.mocked(api.openPreview).mockResolvedValue(SESSION);
  vi.mocked(api.closePreview).mockResolvedValue(undefined);
  vi.mocked(api.releasePreviewAudio).mockResolvedValue(undefined);
  vi.mocked(api.preparePreviewAudio).mockResolvedValue(AUDIO_URL);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePreviewSession media states", () => {
  // @covers sync-workflow/preview-media-states#no-media-shows-no-player
  it("opens nothing without media", async () => {
    const { result } = renderSession(null);

    expect(result.current.media).toEqual({ status: "none" });
    await act(async () => {});
    expect(api.openPreview).not.toHaveBeenCalled();
  });

  it("is opening until the session opens, then shows the video", async () => {
    const open = deferred<PreviewSessionDto>();
    vi.mocked(api.openPreview).mockReturnValue(open.promise);
    const { result } = renderSession();

    expect(result.current.media).toEqual({ status: "opening" });
    await waitFor(() => expect(api.openPreview).toHaveBeenCalledWith(MEDIA));
    await act(async () => open.resolve(SESSION));

    expect(result.current.media).toEqual({ status: "video", url: SESSION.url });
  });

  // @covers sync-workflow/preview-media-states#unavailable-preview-does-not-block
  it("is unavailable, without a way back, when opening fails", async () => {
    vi.mocked(api.openPreview).mockRejectedValue(FAILURE);
    const { result } = renderSession();

    await waitFor(() =>
      expect(result.current.media).toEqual({ status: "unavailable", error: FAILURE, canReturn: false }),
    );
  });

  // @covers sync-workflow/preview-media-states#media-failure-falls-back-to-audio
  it("prepares audio after a media failure and then plays it", async () => {
    const prepare = deferred<string>();
    vi.mocked(api.preparePreviewAudio).mockReturnValue(prepare.promise);
    const { result } = await openedSession();

    act(() => result.current.onMediaError());
    expect(result.current.media).toEqual({ status: "preparing", reason: "failed" });
    await waitFor(() => expect(api.preparePreviewAudio).toHaveBeenCalledWith("s1"));

    await act(async () => prepare.resolve(AUDIO_URL));
    expect(result.current.media).toEqual({ status: "audio", url: AUDIO_URL });
  });

  it("prepares audio when the user asks for it", async () => {
    const { result } = await openedSession();

    act(() => result.current.requestAudio());
    expect(result.current.media).toEqual({ status: "preparing", reason: "requested" });

    await waitFor(() => expect(result.current.media).toEqual({ status: "audio", url: AUDIO_URL }));
  });

  it("can return to a playable video after a requested preparation fails", async () => {
    vi.mocked(api.preparePreviewAudio).mockRejectedValue(FAILURE);
    const { result } = await openedSession();

    act(() => result.current.requestAudio());
    await waitFor(() =>
      expect(result.current.media).toEqual({ status: "unavailable", error: FAILURE, canReturn: true }),
    );

    act(() => result.current.returnToVideo());
    expect(result.current.media).toEqual({ status: "video", url: SESSION.url });
  });

  it("cannot return after a preparation that followed a media failure fails", async () => {
    vi.mocked(api.preparePreviewAudio).mockRejectedValue(FAILURE);
    const { result } = await openedSession();

    act(() => result.current.onMediaError());
    await waitFor(() =>
      expect(result.current.media).toEqual({ status: "unavailable", error: FAILURE, canReturn: false }),
    );

    act(() => result.current.returnToVideo());
    expect(result.current.media.status).toBe("unavailable");
  });

  // @covers sync-workflow/preview-media-states#failed-audio-playback-releases-the-audio
  it("releases the audio, keeping the session open, when the audio itself fails", async () => {
    const { result } = await openedSession();
    act(() => result.current.requestAudio());
    await waitFor(() => expect(result.current.media.status).toBe("audio"));

    act(() => result.current.onMediaError());

    expect(result.current.media).toEqual({
      status: "unavailable",
      error: MEDIA_ELEMENT_ERROR,
      canReturn: true,
    });
    expect(api.releasePreviewAudio).toHaveBeenCalledWith("s1");
    await act(async () => {});
    expect(api.closePreview).not.toHaveBeenCalled();
  });

  it("walks audio error, return, video error and a failed preparation to no way back", async () => {
    const { result } = await openedSession();
    act(() => result.current.requestAudio());
    await waitFor(() => expect(result.current.media.status).toBe("audio"));
    act(() => result.current.onMediaError());
    act(() => result.current.returnToVideo());
    expect(result.current.media).toEqual({ status: "video", url: SESSION.url });

    vi.mocked(api.preparePreviewAudio).mockRejectedValueOnce(FAILURE);
    act(() => result.current.onMediaError());
    expect(result.current.media).toEqual({ status: "preparing", reason: "failed" });

    await waitFor(() =>
      expect(result.current.media).toEqual({ status: "unavailable", error: FAILURE, canReturn: false }),
    );
  });

  it("prepares again only once the pending release has settled", async () => {
    const release = deferred<void>();
    vi.mocked(api.releasePreviewAudio).mockReturnValue(release.promise);
    const { result } = await openedSession();
    act(() => result.current.requestAudio());
    await waitFor(() => expect(result.current.media.status).toBe("audio"));
    act(() => result.current.onMediaError());
    act(() => result.current.returnToVideo());

    act(() => result.current.requestAudio());
    await act(async () => {});
    expect(api.preparePreviewAudio).toHaveBeenCalledTimes(1);

    await act(async () => release.resolve());
    await waitFor(() => expect(api.preparePreviewAudio).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.media).toEqual({ status: "audio", url: AUDIO_URL }));
  });

  it("ignores requests that do not apply to the current state", async () => {
    const opening = renderSession();
    act(() => {
      opening.result.current.onMediaError();
      opening.result.current.requestAudio();
      opening.result.current.returnToVideo();
    });
    expect(opening.result.current.media).toEqual({ status: "opening" });
    opening.unmount();

    const { result } = await openedSession();
    act(() => result.current.returnToVideo());
    expect(result.current.media).toEqual({ status: "video", url: SESSION.url });
    act(() => result.current.requestAudio());
    act(() => result.current.requestAudio());
    act(() => result.current.onMediaError());
    expect(result.current.media).toEqual({ status: "preparing", reason: "requested" });
    await waitFor(() => expect(result.current.media.status).toBe("audio"));
    expect(api.preparePreviewAudio).toHaveBeenCalledTimes(1);
  });
});

describe("usePreviewSession lifetime", () => {
  // @covers sync-workflow/preview-session-follows-the-offset-step#leaving-closes-the-session
  it("closes the open session when unmounted", async () => {
    const { unmount } = await openedSession();

    unmount();

    await waitFor(() => expect(api.closePreview).toHaveBeenCalledWith("s1"));
    expect(api.releasePreviewAudio).not.toHaveBeenCalled();
  });

  // @covers sync-workflow/preview-session-follows-the-offset-step#late-open-is-closed
  it("closes a session whose open resolves after leaving, before opening a newer one", async () => {
    const first = deferred<PreviewSessionDto>();
    vi.mocked(api.openPreview)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ sessionId: "s2", url: "http://127.0.0.1:9/s2" });
    const { result, rerender } = renderSession();
    await waitFor(() => expect(api.openPreview).toHaveBeenCalledTimes(1));

    rerender({ media: "/m/other.mkv", subtitle: SUBTITLE });
    await act(async () => {});
    // The newer open waits for the first to settle.
    expect(api.openPreview).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve(SESSION));
    await waitFor(() => expect(api.openPreview).toHaveBeenCalledTimes(2));

    expect(api.closePreview).toHaveBeenCalledWith("s1");
    const closeFirst = vi.mocked(api.closePreview).mock.invocationCallOrder[0];
    const openSecond = vi.mocked(api.openPreview).mock.invocationCallOrder[1];
    expect(closeFirst).toBeLessThan(openSecond);
    await waitFor(() =>
      expect(result.current.media).toEqual({ status: "video", url: "http://127.0.0.1:9/s2" }),
    );
  });

  it("ends a StrictMode double mount with exactly one open session", async () => {
    const { result } = renderHook(() => usePreviewSession(MEDIA, SUBTITLE), { wrapper: StrictMode });

    await waitFor(() => expect(result.current.media).toEqual({ status: "video", url: SESSION.url }));
    const opened = vi.mocked(api.openPreview).mock.calls.length;
    const closed = vi.mocked(api.closePreview).mock.calls.length;
    expect(opened - closed).toBe(1);
  });

  it("drops a preparation that settles after leaving, closing the session once", async () => {
    const prepare = deferred<string>();
    vi.mocked(api.preparePreviewAudio).mockReturnValue(prepare.promise);
    const { result, unmount } = await openedSession();
    act(() => result.current.requestAudio());
    const last = result.current.media;

    unmount();
    await waitFor(() => expect(api.closePreview).toHaveBeenCalledTimes(1));
    await act(async () => prepare.resolve(AUDIO_URL));

    expect(result.current.media).toBe(last);
    expect(api.closePreview).toHaveBeenCalledTimes(1);
  });
});

describe("usePreviewSession cues", () => {
  it("is empty while loading, then holds the cues", async () => {
    const load = deferred<PreviewCueDto[]>();
    vi.mocked(api.loadPreviewCues).mockReturnValue(load.promise);
    const { result } = renderSession();

    expect(result.current.cues).toEqual([]);
    expect(result.current.cueError).toBeUndefined();
    await act(async () => load.resolve(CUES));
    expect(result.current.cues).toEqual(CUES);
  });

  // @covers sync-workflow/preview-session-follows-the-offset-step#subtitle-failure-keeps-playback
  it("reports a failure without touching the media", async () => {
    vi.mocked(api.loadPreviewCues).mockRejectedValue(FAILURE);
    const { result } = renderSession();

    await waitFor(() => expect(result.current.cueError).toEqual(FAILURE));
    expect(result.current.cues).toEqual([]);
    await waitFor(() => expect(result.current.media.status).toBe("video"));
  });

  it("drops cues that arrive for a subtitle no longer shown", async () => {
    const late = deferred<PreviewCueDto[]>();
    vi.mocked(api.loadPreviewCues)
      .mockReturnValueOnce(late.promise)
      .mockResolvedValueOnce([{ startMs: 5, endMs: 6, text: "current" }]);
    const { result, rerender } = renderSession();

    rerender({ media: MEDIA, subtitle: "/m/other.srt" });
    await waitFor(() => expect(result.current.cues).toEqual([{ startMs: 5, endMs: 6, text: "current" }]));
    await act(async () => late.resolve(CUES));

    expect(result.current.cues).toEqual([{ startMs: 5, endMs: 6, text: "current" }]);
  });

  it("loads nothing without a subtitle", async () => {
    const { result } = renderSession(MEDIA, null);

    await act(async () => {});
    expect(api.loadPreviewCues).not.toHaveBeenCalled();
    expect(result.current.cues).toEqual([]);
  });
});
