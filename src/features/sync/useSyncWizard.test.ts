import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncDetectionDto } from "../../types/ipc";
import { defaultOutputPath, resetPendingCancelForTests, useSyncWizard } from "./useSyncWizard";

vi.mock("./syncWizardApi");
import * as api from "./syncWizardApi";

const MEDIA = "/m/episode.mkv";
const SUBTITLE = "/m/episode.srt";
const DETECTION: SyncDetectionDto = { offsetMs: 1_500, confidence: 82, warnings: [] };
const FAILURE = { code: "sync.detection_failed", message: "no speech", hintCode: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A wizard with both files chosen, sitting on the detect step. */
async function onDetectStep() {
  const hook = renderHook(() => useSyncWizard());
  await waitFor(() => expect(hook.result.current.defaults).not.toBeNull());
  act(() => {
    hook.result.current.setMediaPath(MEDIA);
    hook.result.current.setSubtitlePath(SUBTITLE);
  });
  act(() => hook.result.current.toDetect());
  return hook;
}

/** The same wizard after a successful detection, on the offset step. */
async function withDetection() {
  const hook = await onDetectStep();
  act(() => hook.result.current.startDetection());
  await waitFor(() => expect(hook.result.current.step).toBe("offset"));
  return hook;
}

beforeEach(() => {
  resetPendingCancelForTests();
  vi.mocked(api.getSyncDefaults).mockResolvedValue({
    defaultMethod: "auto",
    vadSensitivity: 40,
    maxOffsetMs: 60_000,
  });
  vi.mocked(api.detectSyncOffset).mockResolvedValue(DETECTION);
  vi.mocked(api.cancelSyncDetection).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("keeping the current offset", () => {
  // @covers sync-workflow/keep-the-current-offset#keep-is-hidden-without-a-review
  it("is not offered on the first visit, after a file change, or after a restart", async () => {
    const { result } = await onDetectStep();
    expect(result.current.hasReview).toBe(false);

    act(() => result.current.skipDetection());
    expect(result.current.hasReview).toBe(true);

    act(() => result.current.backToInputs());
    act(() => result.current.setSubtitlePath("/m/other.srt"));
    expect(result.current.hasReview).toBe(false);

    act(() => result.current.toDetect());
    act(() => result.current.skipDetection());
    expect(result.current.hasReview).toBe(true);

    act(() => result.current.restart());
    expect(result.current.hasReview).toBe(false);
  });

  it("returns to the offset step with the offset and detection intact", async () => {
    const { result } = await withDetection();
    act(() => result.current.setOffsetMs(1_250));
    act(() => result.current.backToDetect());

    expect(result.current.detectPhase).toBe("ask");
    act(() => result.current.keepOffset());

    expect(result.current.step).toBe("offset");
    expect(result.current.offsetMs).toBe(1_250);
    expect(result.current.detection).toEqual(DETECTION);
  });
});

describe("a detection that does not finish", () => {
  // @covers sync-workflow/offset-reset-rules#failed-or-cancelled-detection-keeps-the-offset
  it("keeps the offset when it fails", async () => {
    const { result } = await withDetection();
    act(() => result.current.setOffsetMs(1_250));
    act(() => result.current.backToDetect());
    vi.mocked(api.detectSyncOffset).mockRejectedValueOnce(FAILURE);

    act(() => result.current.startDetection());

    await waitFor(() => expect(result.current.detectPhase).toBe("failed"));
    expect(result.current.offsetMs).toBe(1_250);
    expect(result.current.step).toBe("detect");
  });

  // @covers sync-workflow/offset-reset-rules#failed-or-cancelled-detection-keeps-the-offset
  it("keeps the offset when it is cancelled, and ignores its late result", async () => {
    const { result } = await withDetection();
    act(() => result.current.setOffsetMs(1_250));
    act(() => result.current.backToDetect());
    const pending = deferred<SyncDetectionDto>();
    vi.mocked(api.detectSyncOffset).mockReturnValueOnce(pending.promise);

    act(() => result.current.startDetection());
    await waitFor(() => expect(api.detectSyncOffset).toHaveBeenCalledTimes(2));
    expect(result.current.detectPhase).toBe("detecting");

    act(() => result.current.cancelDetection());

    expect(api.cancelSyncDetection).toHaveBeenCalled();
    expect(result.current.detectPhase).toBe("ask");
    expect(result.current.offsetMs).toBe(1_250);

    await act(async () => pending.resolve({ ...DETECTION, offsetMs: 9_000 }));

    expect(result.current.offsetMs).toBe(1_250);
    expect(result.current.step).toBe("detect");
  });

  /// The backend's abort is asynchronous. A start that does not wait for it
  /// would have its own run aborted by the cancel that came before it.
  it("starts the next run only after the pending cancel has settled", async () => {
    const { result } = await onDetectStep();
    const pending = deferred<SyncDetectionDto>();
    vi.mocked(api.detectSyncOffset).mockReturnValueOnce(pending.promise);
    act(() => result.current.startDetection());
    await waitFor(() => expect(api.detectSyncOffset).toHaveBeenCalledTimes(1));

    const cancel = deferred<void>();
    vi.mocked(api.cancelSyncDetection).mockReturnValueOnce(cancel.promise);
    act(() => result.current.cancelDetection());
    act(() => result.current.startDetection());

    await act(async () => {});
    expect(api.detectSyncOffset).toHaveBeenCalledTimes(1);
    expect(result.current.detectPhase).toBe("detecting");

    await act(async () => cancel.resolve());

    await waitFor(() => expect(api.detectSyncOffset).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.step).toBe("offset"));
  });

  it("drops a run cancelled while it waits for the previous cancel", async () => {
    const { result } = await onDetectStep();
    const cancel = deferred<void>();
    vi.mocked(api.cancelSyncDetection).mockReturnValueOnce(cancel.promise);
    act(() => result.current.cancelDetection());

    act(() => result.current.startDetection());
    act(() => result.current.cancelDetection());
    await act(async () => cancel.resolve());

    expect(api.detectSyncOffset).not.toHaveBeenCalled();
    expect(result.current.detectPhase).toBe("ask");
  });

  it("sends one request when Start is pressed twice", async () => {
    const { result } = await onDetectStep();
    const pending = deferred<SyncDetectionDto>();
    vi.mocked(api.detectSyncOffset).mockReturnValueOnce(pending.promise);

    act(() => {
      result.current.startDetection();
      result.current.startDetection();
    });
    await waitFor(() => expect(api.detectSyncOffset).toHaveBeenCalledTimes(1));
    act(() => result.current.startDetection());
    await act(async () => {});

    expect(api.detectSyncOffset).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(DETECTION));
    expect(result.current.step).toBe("offset");
  });
});

describe("changing a file", () => {
  // @covers sync-workflow/offset-reset-rules#changing-a-file-resets-the-review
  it.each([
    ["a different media file", (w: ReturnType<typeof useSyncWizard>) => w.setMediaPath("/m/other.mkv")],
    ["a different subtitle", (w: ReturnType<typeof useSyncWizard>) => w.setSubtitlePath("/m/other.srt")],
    ["removing the media file", (w: ReturnType<typeof useSyncWizard>) => w.setMediaPath(null)],
    ["removing the subtitle", (w: ReturnType<typeof useSyncWizard>) => w.setSubtitlePath(null)],
  ])("resets the review after %s", async (_name, change) => {
    const { result } = await withDetection();
    act(() => result.current.backToDetect());
    act(() => result.current.backToInputs());

    act(() => change(result.current));

    expect(result.current.offsetMs).toBe(0);
    expect(result.current.detection).toBeNull();
    expect(result.current.hasReview).toBe(false);
  });

  it("resets nothing when the same path is selected again", async () => {
    const { result } = await withDetection();
    act(() => result.current.backToDetect());
    act(() => result.current.backToInputs());

    act(() => {
      result.current.setMediaPath(MEDIA);
      result.current.setSubtitlePath(SUBTITLE);
    });

    expect(result.current.offsetMs).toBe(1_500);
    expect(result.current.detection).toEqual(DETECTION);
    expect(result.current.hasReview).toBe(true);
  });

  /// The setters compare against the selection; a restart that left the old
  /// paths behind would make re-choosing the same file a silent no-op.
  it("accepts the same path again after a restart", async () => {
    const { result } = await withDetection();
    act(() => result.current.restart());

    act(() => result.current.setSubtitlePath(SUBTITLE));

    expect(result.current.subtitlePath).toBe(SUBTITLE);
  });
});

/**
 * The frontend's copy of the crate's `create_default_output_path`.
 *
 * It is display-only — the backend recomputes the path with the crate's own
 * function when none is sent — but a drift still shows the user a path their
 * file will not be written to, so the rules are pinned here rather than left to
 * the wizard tests, which only ever exercise one shape.
 */
describe("the proposed output path", () => {
  it("inserts _synced before the extension", () => {
    expect(defaultOutputPath("/media/movie.srt")).toBe("/media/movie_synced.srt");
  });

  it("keeps the extension it found, whatever it is", () => {
    expect(defaultOutputPath("/media/movie.vtt")).toBe("/media/movie_synced.vtt");
    expect(defaultOutputPath("/media/movie.ASS")).toBe("/media/movie_synced.ASS");
  });

  it("splits on the last dot, so a dotted stem survives", () => {
    expect(defaultOutputPath("/media/show.s01e01.srt")).toBe("/media/show.s01e01_synced.srt");
  });

  it("handles Windows separators", () => {
    expect(defaultOutputPath("C:\\media\\movie.srt")).toBe("C:\\media\\movie_synced.srt");
  });

  it("handles a bare file name with no directory", () => {
    expect(defaultOutputPath("movie.srt")).toBe("movie_synced.srt");
  });

  /// Both of these match the crate: with no extension there is no `_synced`
  /// name to build, so the input comes back unchanged — and the backend refuses
  /// that rather than writing over the subtitle being synced.
  it("returns an extensionless path unchanged", () => {
    expect(defaultOutputPath("/media/movie")).toBe("/media/movie");
  });

  it("treats a leading dot as a hidden name, not an extension", () => {
    expect(defaultOutputPath("/media/.srt")).toBe("/media/.srt");
  });
});

describe("leaving the wizard", () => {
  // @covers sync-workflow/leaving-the-wizard-cancels-a-running-detection#navigating-away-mid-detection-cancels-the-run
  it("cancels a running detection when the wizard is unmounted", async () => {
    const run = deferred<SyncDetectionDto>();
    vi.mocked(api.detectSyncOffset).mockReturnValue(run.promise);
    const errors = vi.spyOn(console, "error");
    try {
      const { result, unmount } = await onDetectStep();
      act(() => result.current.startDetection());
      await waitFor(() => expect(api.detectSyncOffset).toHaveBeenCalledTimes(1));

      vi.mocked(api.cancelSyncDetection).mockClear();
      unmount();

      expect(api.cancelSyncDetection).toHaveBeenCalledTimes(1);
      await act(async () => run.resolve(DETECTION));
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  // @covers sync-workflow/leaving-the-wizard-cancels-a-running-detection#a-new-wizard-waits-for-the-previous-cancel
  it("makes a newly mounted wizard wait for the previous wizard's cancel", async () => {
    vi.mocked(api.detectSyncOffset).mockReturnValueOnce(new Promise(() => {}));
    const first = await onDetectStep();
    act(() => first.result.current.startDetection());
    await waitFor(() => expect(api.detectSyncOffset).toHaveBeenCalledTimes(1));

    const cancel = deferred<void>();
    vi.mocked(api.cancelSyncDetection).mockReturnValueOnce(cancel.promise);
    vi.mocked(api.cancelSyncDetection).mockClear();
    first.unmount();
    expect(api.cancelSyncDetection).toHaveBeenCalledTimes(1);

    const second = await onDetectStep();
    act(() => second.result.current.startDetection());
    await act(async () => {});
    expect(api.detectSyncOffset).toHaveBeenCalledTimes(1);

    await act(async () => cancel.resolve());
    await waitFor(() => expect(api.detectSyncOffset).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.step).toBe("offset"));
  });

  // @covers sync-workflow/leaving-the-wizard-cancels-a-running-detection#unmounting-while-idle-sends-nothing
  it("sends no cancel when the wizard is unmounted with no detection running", async () => {
    const { unmount } = await onDetectStep();

    vi.mocked(api.cancelSyncDetection).mockClear();
    unmount();

    expect(api.cancelSyncDetection).not.toHaveBeenCalled();
  });
});
