import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, setupI18n } from "../../test/renderWithI18n";
import type { SyncDetectionDto } from "../../types/ipc";
import { SyncWizard } from "./SyncWizard";

vi.mock("./syncWizardApi");
vi.mock("./previewApi");
vi.mock("../../platform/filePickers");
import * as pickers from "../../platform/filePickers";
import * as previewApi from "./previewApi";
import * as api from "./syncWizardApi";
import { resetPreviewQueueForTests } from "./usePreviewSession";
import { resetPendingCancelForTests } from "./useSyncWizard";

const MEDIA = "/m/episode.mkv";
const SUBTITLE = "/m/episode.srt";

const PREVIEW_SESSION = { sessionId: "s1", url: "http://127.0.0.1:9/s1" };
const PREVIEW_AUDIO = "http://127.0.0.1:9/s1/audio";
const PREVIEW_FAILURE = {
  code: "preview.audio_unsupported",
  message: "no audio stream",
  hintCode: null,
};

const DETECTION: SyncDetectionDto = {
  offsetMs: 1_500,
  confidence: 82,
  warnings: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderWizard() {
  return render(
    <I18nextProvider i18n={i18n}>
      <SyncWizard />
    </I18nextProvider>,
  );
}

/**
 * The shell's action bar. Queries about *where* a control lives are scoped to
 * it, so a control drifting back into the scrolling panel fails the test.
 */
function actionBar(): HTMLElement {
  const bar = document.querySelector(".wizard__actions");
  if (bar === null) throw new Error("the wizard rendered no action bar");
  return bar as HTMLElement;
}

/** Fills a slot through the native picker, which is mocked per click. */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  button: "Choose video" | "Choose subtitle",
  path: string,
) {
  vi.mocked(pickers.pickFile).mockResolvedValueOnce(path);
  await user.click(screen.getByRole("button", { name: button }));
  await screen.findByTitle(path);
}

/** Labels of the inline-end cluster in order; the last one is `next`. */
function endLabels(): string[] {
  const end = actionBar().querySelector(".wizard__actions-end");
  return [...(end?.querySelectorAll("button") ?? [])].map((b) => b.textContent ?? "");
}

/** The `next` control, which is always the primary button of the bar. */
function primary(): HTMLElement {
  const button = actionBar().querySelector(".wizard__button--primary");
  if (button === null) throw new Error("the action bar has no primary control");
  return button as HTMLElement;
}

/** Step 1 with the slots filled, landing on the detect step's ask state. */
async function reachDetect(user: ReturnType<typeof userEvent.setup>, withMedia = true) {
  if (withMedia) await choose(user, "Choose video", MEDIA);
  await choose(user, "Choose subtitle", SUBTITLE);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Detect the offset automatically?");
}

/** Steps 1 and 2 on the automatic path, landing on the offset step. */
async function reachOffset(user: ReturnType<typeof userEvent.setup>) {
  await reachDetect(user);
  await user.click(within(actionBar()).getByRole("button", { name: "Start detection" }));
  await screen.findByText("Adjust the offset");
}

/** The offset field on step 3. */
function offsetField(): HTMLElement {
  return screen.getByRole("spinbutton", { name: /Offset in milliseconds/ });
}

beforeEach(async () => {
  await setupI18n("en");
  vi.mocked(pickers.subscribeToDroppedPaths).mockResolvedValue(() => {});
  vi.mocked(pickers.pickFile).mockResolvedValue(null);
  vi.mocked(api.getSyncDefaults).mockResolvedValue({
    defaultMethod: "auto",
    vadSensitivity: 40,
    maxOffsetMs: 60_000,
  });
  vi.mocked(api.detectSyncOffset).mockResolvedValue(DETECTION);
  vi.mocked(api.cancelSyncDetection).mockResolvedValue(undefined);
  vi.mocked(api.applySyncOffset).mockResolvedValue({
    outputPath: "/m/episode_synced.srt",
    overwritten: false,
  });
  resetPreviewQueueForTests();
  resetPendingCancelForTests();
  vi.mocked(previewApi.loadPreviewCues).mockResolvedValue([]);
  vi.mocked(previewApi.openPreview).mockResolvedValue(PREVIEW_SESSION);
  vi.mocked(previewApi.closePreview).mockResolvedValue(undefined);
  vi.mocked(previewApi.releasePreviewAudio).mockResolvedValue(undefined);
  vi.mocked(previewApi.preparePreviewAudio).mockResolvedValue(PREVIEW_AUDIO);
  // jsdom plays no media.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("the sync wizard", () => {
  // @covers sync-workflow/input-selection-for-a-single-video-subtitle-pair#pair-selection-enables-automatic-detection
  it("offers starting and skipping the detection once a video and a subtitle are chosen", async () => {
    const user = userEvent.setup();
    renderWizard();

    await reachDetect(user);

    expect(within(actionBar()).getByRole("button", { name: "Start detection" })).toBeEnabled();
    expect(within(actionBar()).getByRole("button", { name: "Skip" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: /Speech sensitivity/ })).toBeInTheDocument();
  });

  /// Both slots fill from one drop, routed by extension. Getting it wrong is
  /// recoverable — either slot can be re-picked — which is why the rule is a
  /// subtitle-extension list rather than an attempt to know every container.
  // @covers sync-workflow/input-selection-for-a-single-video-subtitle-pair#pair-selection-enables-automatic-detection
  it("routes dropped files into the slot their extension implies", async () => {
    const user = userEvent.setup();
    let drop!: (paths: string[]) => void;
    vi.mocked(pickers.subscribeToDroppedPaths).mockImplementation((onPaths) => {
      drop = onPaths;
      return Promise.resolve(() => {});
    });
    renderWizard();
    await waitFor(() => expect(drop).toBeDefined());

    await act(async () => drop([MEDIA, SUBTITLE]));

    expect(await screen.findByTitle(MEDIA)).toBeInTheDocument();
    expect(screen.getByTitle(SUBTITLE)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await within(actionBar()).findByRole("button", { name: "Start detection" }),
    ).toBeEnabled();
  });

  // @covers sync-workflow/input-selection-for-a-single-video-subtitle-pair#drops-outside-the-files-step-are-ignored
  it("ignores drops outside the files step", async () => {
    const user = userEvent.setup();
    // A real emitter: unsubscribing removes the listener, so a drop reaches
    // the wizard only while it is subscribed.
    let listener: ((paths: string[]) => void) | null = null;
    vi.mocked(pickers.subscribeToDroppedPaths).mockImplementation((onPaths) => {
      listener = onPaths;
      return Promise.resolve(() => {
        if (listener === onPaths) listener = null;
      });
    });
    renderWizard();
    await reachOffset(user);
    await user.clear(offsetField());
    await user.type(offsetField(), "1250");

    await act(async () => listener?.(["/m/other.mkv", "/m/other.srt"]));
    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));
    await act(async () => listener?.(["/m/other.mkv", "/m/other.srt"]));
    await user.click(within(actionBar()).getByRole("button", { name: /^Keep/ }));

    expect(offsetField()).toHaveValue(1250);
    expect(screen.getByText("1.500 seconds")).toBeInTheDocument();

    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));
    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));
    expect(screen.getByTitle(MEDIA)).toBeInTheDocument();
    expect(screen.getByTitle(SUBTITLE)).toBeInTheDocument();
    // Back on the files step, drops are accepted again.
    await waitFor(() => expect(listener).not.toBeNull());
  });

  // @covers sync-workflow/input-selection-for-a-single-video-subtitle-pair#subtitle-only-restricts-to-manual-offset
  it("restricts a subtitle-only run to skipping the detection, and says why", async () => {
    const user = userEvent.setup();
    renderWizard();

    await reachDetect(user, false);

    expect(endLabels()).toEqual(["Skip"]);
    expect(primary()).toHaveTextContent("Skip");
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Add a video or audio file in the first step to enable detection/),
    ).toBeInTheDocument();

    await user.click(primary());

    expect(await screen.findByText("Adjust the offset")).toBeInTheDocument();
    expect(offsetField()).toHaveValue(0);
  });

  // @covers sync-workflow/method-selection-seeded-from-shared-configuration#defaults-come-from-the-shared-configuration
  it("seeds the sensitivity from the configuration and leaves it there untouched", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachDetect(user);

    expect(await screen.findByRole("slider", { name: /Speech sensitivity/ })).toHaveValue("40");

    await user.click(within(actionBar()).getByRole("button", { name: "Start detection" }));

    // A null sensitivity means "whatever the configuration holds", the same way
    // a null output path means "the default name": an untouched control sends
    // no override at all rather than echoing the value back.
    expect(api.detectSyncOffset).toHaveBeenCalledWith(MEDIA, SUBTITLE, null);
  });

  it("sends a moved sensitivity as a per-run override", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachDetect(user);

    // A range input does not respond to keyboard or pointer input under jsdom,
    // so the value change is dispatched directly.
    const slider = await screen.findByRole("slider", { name: /Speech sensitivity/ });
    fireEvent.change(slider, { target: { value: "75" } });
    await user.click(within(actionBar()).getByRole("button", { name: "Start detection" }));

    expect(api.detectSyncOffset).toHaveBeenCalledWith(MEDIA, SUBTITLE, 75);
  });

  // @covers sync-workflow/method-selection-seeded-from-shared-configuration#configured-manual-method-makes-skipping-primary
  it.each([
    ["manual", ["Start detection", "Skip"]],
    ["auto", ["Skip", "Start detection"]],
  ] as const)(
    "with the configured method %s, orders the choices %j",
    async (defaultMethod, labels) => {
      const user = userEvent.setup();
      vi.mocked(api.getSyncDefaults).mockResolvedValue({
        defaultMethod,
        vadSensitivity: 40,
        maxOffsetMs: 60_000,
      });
      renderWizard();
      await reachDetect(user);

      await waitFor(() => expect(endLabels()).toEqual(labels));
      expect(primary()).toHaveTextContent(labels[1]);
    },
  );

  // @covers sync-workflow/method-selection-seeded-from-shared-configuration#manual-offset-beyond-the-configured-maximum-is-rejected
  it("blocks an offset beyond the configured maximum on the offset step", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachDetect(user);
    await user.click(within(actionBar()).getByRole("button", { name: "Skip" }));

    await user.clear(offsetField());
    await user.type(offsetField(), "90000");

    expect(
      await screen.findByText(
        "This is beyond the 60.0 second limit in your settings. Reduce it to continue.",
      ),
    ).toBeInTheDocument();
    expect(within(actionBar()).getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  // @covers sync-workflow/method-selection-seeded-from-shared-configuration#detected-offset-beyond-the-maximum-can-be-reduced
  it("enters the offset step with a detected offset beyond the maximum, which can be reduced", async () => {
    const user = userEvent.setup();
    vi.mocked(api.detectSyncOffset).mockResolvedValue({ ...DETECTION, offsetMs: 90_000 });
    renderWizard();
    await reachOffset(user);

    expect(offsetField()).toHaveValue(90000);
    expect(
      screen.getByText("This is beyond the 60.0 second limit in your settings. Reduce it to continue."),
    ).toBeInTheDocument();
    expect(within(actionBar()).getByRole("button", { name: "Continue" })).toBeDisabled();

    await user.clear(offsetField());
    await user.type(offsetField(), "1000");

    expect(within(actionBar()).getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  // @covers sync-workflow/cancellable-local-offset-detection-with-review-and-fine-tuning#detection-reports-offset-and-confidence
  it("reports the detected offset, its confidence and any warnings", async () => {
    const user = userEvent.setup();
    vi.mocked(api.detectSyncOffset).mockResolvedValue({
      ...DETECTION,
      warnings: [
        {
          code: "sync.detection_warning",
          message: "Detected offset 61.00s exceeds configured maximum value 60.00s",
          hintCode: null,
        },
      ],
    });
    renderWizard();

    await reachOffset(user);

    // Twice: the detection's own reading, and the editable field it seeds. They
    // agree until the value is edited, which the next test is about.
    expect(await screen.findAllByText("1.500 seconds")).toHaveLength(2);
    expect(offsetField()).toHaveValue(1500);
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("The analysis finished with a warning.")).toBeInTheDocument();
  });

  // @covers sync-workflow/cancellable-local-offset-detection-with-review-and-fine-tuning#the-reviewed-value-is-what-gets-applied
  it("applies the edited value rather than the detected one", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffset(user);

    await user.clear(offsetField());
    await user.type(offsetField(), "1250");

    // The detection's own reading stays as it was — what changed is the value
    // under review, which is the one that gets applied.
    expect(screen.getByText("1.500 seconds")).toBeInTheDocument();
    expect(screen.getByText("1.250 seconds")).toBeInTheDocument();

    await user.click(within(actionBar()).getByRole("button", { name: "Continue" }));
    await user.click(await within(actionBar()).findByRole("button", { name: "Save" }));

    // A null output path is what asks the backend for the default `_synced`
    // name; the field was left as proposed.
    expect(api.applySyncOffset).toHaveBeenCalledWith(SUBTITLE, 1_250, null, false);
    expect(await screen.findByText("/m/episode_synced.srt")).toBeInTheDocument();
  });

  // @covers sync-workflow/detect-step-states#detecting-shows-elapsed-time-and-cancel
  it("holds the primary slot, disabled, with cancel beside it while detecting", async () => {
    const user = userEvent.setup();
    const pending = deferred<SyncDetectionDto>();
    vi.mocked(api.detectSyncOffset).mockReturnValue(pending.promise);
    renderWizard();
    await reachDetect(user);

    await user.click(within(actionBar()).getByRole("button", { name: "Start detection" }));

    expect(endLabels()).toEqual(["Cancel", "Detecting…"]);
    expect(primary()).toBeDisabled();
    expect(within(actionBar()).getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(within(actionBar()).queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 s");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    await act(async () => pending.resolve(DETECTION));
  });

  // @covers sync-workflow/cancellable-local-offset-detection-with-review-and-fine-tuning#user-cancels-detection
  it("abandons a cancelled detection and ignores its late result", async () => {
    const user = userEvent.setup();
    const pending = deferred<SyncDetectionDto>();
    vi.mocked(api.detectSyncOffset).mockReturnValue(pending.promise);
    renderWizard();
    await reachDetect(user);
    await user.click(within(actionBar()).getByRole("button", { name: "Start detection" }));

    await user.click(await within(actionBar()).findByRole("button", { name: "Cancel" }));

    expect(api.cancelSyncDetection).toHaveBeenCalled();
    expect(await screen.findByText("Detect the offset automatically?")).toBeInTheDocument();
    expect(primary()).toHaveTextContent("Start detection");

    // The backend keeps running the invocation nobody awaits; a result that
    // lands afterwards must change nothing the user can see.
    await act(async () => pending.resolve(DETECTION));
    expect(screen.getByText("Detect the offset automatically?")).toBeInTheDocument();
    expect(screen.queryByText("1.500 seconds")).not.toBeInTheDocument();
  });

  // @covers sync-workflow/detect-step-states#failure-offers-retry-and-skip
  it("offers retry and skip when the detection fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.detectSyncOffset).mockRejectedValueOnce({
      code: "sync.vad_unavailable",
      message: "VAD detector is required but not available",
      hintCode: "sync.vad_unavailable.hint",
    });
    renderWizard();
    await reachDetect(user);
    await user.click(within(actionBar()).getByRole("button", { name: "Start detection" }));

    expect(
      await screen.findByText("Automatic detection is unavailable on this system."),
    ).toBeInTheDocument();
    expect(screen.getByText("Skip detection and set the offset yourself instead.")).toBeInTheDocument();
    expect(endLabels()).toEqual(["Skip", "Try again"]);

    // Retry uses the sensitivity as it is now, not as it was.
    fireEvent.change(screen.getByRole("slider", { name: /Speech sensitivity/ }), {
      target: { value: "75" },
    });
    vi.mocked(api.detectSyncOffset).mockRejectedValueOnce({
      code: "sync.vad_unavailable",
      message: "VAD detector is required but not available",
      hintCode: "sync.vad_unavailable.hint",
    });
    await user.click(primary());

    await waitFor(() => expect(api.detectSyncOffset).toHaveBeenCalledTimes(2));
    expect(api.detectSyncOffset).toHaveBeenLastCalledWith(MEDIA, SUBTITLE, 75);
    expect(await within(actionBar()).findByRole("button", { name: "Skip" })).toBeEnabled();

    await user.click(within(actionBar()).getByRole("button", { name: "Skip" }));

    expect(await screen.findByText("Adjust the offset")).toBeInTheDocument();
    expect(offsetField()).toHaveValue(0);
  });

  // @covers sync-workflow/keep-the-current-offset#keeping-returns-with-the-review-intact
  it("keeps the edited offset and the detection facts when keeping", async () => {
    const user = userEvent.setup();
    vi.mocked(api.detectSyncOffset).mockResolvedValue({
      ...DETECTION,
      warnings: [{ code: "sync.detection_warning", message: "close call", hintCode: null }],
    });
    renderWizard();
    await reachOffset(user);
    await user.clear(offsetField());
    await user.type(offsetField(), "1250");

    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));
    await user.click(
      within(actionBar()).getByRole("button", { name: "Keep +1.25 s (1.250 seconds)" }),
    );

    expect(offsetField()).toHaveValue(1250);
    expect(screen.getByText("1.500 seconds")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("The analysis finished with a warning.")).toBeInTheDocument();
  });

  // @covers sync-workflow/keep-the-current-offset#keep-is-primary-when-asked-again
  it("makes keeping primary when the detect step is shown again", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffset(user);

    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));

    expect(endLabels()).toEqual(["Skip", "Start detection", "Keep +1.50 s"]);
    expect(primary()).toHaveTextContent("Keep +1.50 s");
  });

  it("makes keeping primary beside skip for a subtitle-only run", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachDetect(user, false);
    await user.click(primary());
    await user.click(screen.getByRole("button", { name: /^\+50 ms/ }));

    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));

    expect(endLabels()).toEqual(["Skip", "Keep +0.05 s"]);
    expect(primary()).toHaveTextContent("Keep +0.05 s");
  });

  // @covers sync-workflow/keep-the-current-offset#keep-is-offered-after-a-failure
  it("offers keeping beside skip when a detection fails after a review", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffset(user);
    await user.clear(offsetField());
    await user.type(offsetField(), "1250");
    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));
    vi.mocked(api.detectSyncOffset).mockRejectedValueOnce({
      code: "sync.detection_failed",
      message: "no speech",
      hintCode: null,
    });

    await user.click(within(actionBar()).getByRole("button", { name: "Start detection" }));

    await within(actionBar()).findByRole("button", { name: "Try again" });
    expect(endLabels()).toEqual(["Skip", "Keep +1.25 s", "Try again"]);
    expect(primary()).toHaveTextContent("Try again");

    await user.click(within(actionBar()).getByRole("button", { name: /^Keep/ }));

    expect(offsetField()).toHaveValue(1250);
    expect(screen.getByText("1.500 seconds")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  // @covers sync-workflow/offset-reset-rules#skip-resets-the-offset
  it("resets the offset and the detection facts when skipping after a review", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffset(user);

    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));
    await user.click(within(actionBar()).getByRole("button", { name: "Skip" }));

    expect(offsetField()).toHaveValue(0);
    expect(screen.queryByText("Detected offset")).not.toBeInTheDocument();
    expect(screen.queryByText("82%")).not.toBeInTheDocument();
  });

  // @covers sync-workflow/offset-reset-rules#back-from-save-keeps-the-review
  it("keeps the review when returning from the save step", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffset(user);
    await user.clear(offsetField());
    await user.type(offsetField(), "1250");
    await user.click(within(actionBar()).getByRole("button", { name: "Continue" }));
    await screen.findByRole("textbox", { name: "Save to" });

    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));

    expect(offsetField()).toHaveValue(1250);
    expect(screen.getByText("1.500 seconds")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  // @covers sync-workflow/applying-the-offset-writes-a-new-output-with-overwrite-protection#default-output-path-is-proposed
  it("proposes a _synced sibling that the user can replace", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffset(user);
    await user.click(within(actionBar()).getByRole("button", { name: "Continue" }));

    const field = await screen.findByRole("textbox", { name: "Save to" });
    expect(field).toHaveValue("/m/episode_synced.srt");

    await user.clear(field);
    await user.type(field, "/m/elsewhere.srt");
    await user.click(within(actionBar()).getByRole("button", { name: "Save" }));

    expect(api.applySyncOffset).toHaveBeenCalledWith(SUBTITLE, 1_500, "/m/elsewhere.srt", false);
  });

  // @covers sync-workflow/applying-the-offset-writes-a-new-output-with-overwrite-protection#existing-output-requires-confirmation
  it("asks before replacing an existing output, then retries with the overwrite", async () => {
    const user = userEvent.setup();
    vi.mocked(api.applySyncOffset).mockRejectedValueOnce({
      code: "sync.output_exists",
      message: "the output file already exists",
      hintCode: "sync.output_exists.hint",
    });
    renderWizard();
    await reachOffset(user);
    await user.click(within(actionBar()).getByRole("button", { name: "Continue" }));
    await user.click(await within(actionBar()).findByRole("button", { name: "Save" }));

    expect(await screen.findByText("A file already exists at that path.")).toBeInTheDocument();

    await user.click(within(actionBar()).getByRole("button", { name: "Replace the existing file" }));

    expect(api.applySyncOffset).toHaveBeenLastCalledWith(SUBTITLE, 1_500, null, true);
    expect(await screen.findByText("/m/episode_synced.srt")).toBeInTheDocument();
  });

  /// Only `output_exists` earns a confirmation. Every other write failure keeps
  /// Save as its retry, because the output path is still editable and pointing
  /// somewhere else is the recovery — losing that button would strand the user.
  it("keeps Save as the retry when the write fails for any other reason", async () => {
    const user = userEvent.setup();
    vi.mocked(api.applySyncOffset).mockRejectedValueOnce({
      code: "sync.write_failed",
      message: "could not write the output file",
      hintCode: null,
    });
    renderWizard();
    await reachOffset(user);
    await user.click(within(actionBar()).getByRole("button", { name: "Continue" }));
    await user.click(await within(actionBar()).findByRole("button", { name: "Save" }));

    expect(
      within(actionBar()).queryByRole("button", { name: "Replace the existing file" }),
    ).not.toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "Save to" }));
    await user.type(screen.getByRole("textbox", { name: "Save to" }), "/m/writable.srt");
    await user.click(within(actionBar()).getByRole("button", { name: "Save" }));

    expect(api.applySyncOffset).toHaveBeenLastCalledWith(SUBTITLE, 1_500, "/m/writable.srt", false);
  });

  /// The confirmation is permission to replace *the file the user was warned
  /// about*, not permission to overwrite whatever the field says by the time
  /// they click. Editing the target has to retract it.
  it("retracts the overwrite confirmation when the target is edited", async () => {
    const user = userEvent.setup();
    vi.mocked(api.applySyncOffset).mockRejectedValueOnce({
      code: "sync.output_exists",
      message: "the output file already exists",
      hintCode: "sync.output_exists.hint",
    });
    renderWizard();
    await reachOffset(user);
    await user.click(within(actionBar()).getByRole("button", { name: "Continue" }));
    await user.click(await within(actionBar()).findByRole("button", { name: "Save" }));
    expect(
      await within(actionBar()).findByRole("button", { name: "Replace the existing file" }),
    ).toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "Save to" }));
    await user.type(screen.getByRole("textbox", { name: "Save to" }), "/m/other.srt");

    expect(
      within(actionBar()).queryByRole("button", { name: "Replace the existing file" }),
    ).not.toBeInTheDocument();

    // The new path earns its own existence check rather than inheriting the
    // old one's permission to overwrite.
    await user.click(within(actionBar()).getByRole("button", { name: "Save" }));
    expect(api.applySyncOffset).toHaveBeenLastCalledWith(SUBTITLE, 1_500, "/m/other.srt", false);
  });

  it("returns to the first step once the file has been written", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffset(user);
    await user.click(within(actionBar()).getByRole("button", { name: "Continue" }));
    await user.click(await within(actionBar()).findByRole("button", { name: "Save" }));

    await user.click(await within(actionBar()).findByRole("button", { name: "Finish" }));

    expect(screen.getByText("Choose the video and subtitle")).toBeInTheDocument();
    expect(screen.getByText("No subtitle chosen.")).toBeInTheDocument();
  });
});

describe("the offset step preview", () => {
  /** Skips detection on a subtitle-only run, landing on the offset step. */
  async function reachOffsetWithoutMedia(user: ReturnType<typeof userEvent.setup>) {
    await reachDetect(user, false);
    await user.click(within(actionBar()).getByRole("button", { name: "Skip" }));
    await screen.findByText("Adjust the offset");
  }

  function mediaElement(): HTMLVideoElement {
    const element = document.querySelector("video");
    if (element === null) throw new Error("the step rendered no media element");
    return element;
  }

  /** Edits the offset and continues to the save step, proving neither is blocked. */
  async function editAndContinue(user: ReturnType<typeof userEvent.setup>) {
    await user.clear(offsetField());
    await user.type(offsetField(), "900");
    expect(screen.getByText("0.900 seconds")).toBeInTheDocument();
    await user.click(within(actionBar()).getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Save the synced subtitle")).toBeInTheDocument();
  }

  // @covers sync-workflow/preview-media-states#no-media-shows-no-player
  it("opens no session without media, says so, and still edits and continues", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffsetWithoutMedia(user);

    expect(screen.getByText("No media to preview")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
    expect(previewApi.openPreview).not.toHaveBeenCalled();
    await editAndContinue(user);
  });

  // @covers sync-workflow/preview-media-states#media-failure-falls-back-to-audio
  it("falls back to audio when the media element fails, through the same controls", async () => {
    const user = userEvent.setup();
    const prepare = deferred<string>();
    vi.mocked(previewApi.preparePreviewAudio).mockReturnValue(prepare.promise);
    renderWizard();
    await reachOffset(user);
    await waitFor(() => expect(mediaElement()).toHaveAttribute("src", PREVIEW_SESSION.url));
    expect(previewApi.openPreview).toHaveBeenCalledWith(MEDIA);

    fireEvent.error(mediaElement());

    expect(await screen.findByText(/cannot be played here/)).toBeInTheDocument();
    expect(previewApi.preparePreviewAudio).toHaveBeenCalledWith("s1");
    await act(async () => prepare.resolve(PREVIEW_AUDIO));
    expect(mediaElement()).toHaveAttribute("src", PREVIEW_AUDIO);
    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "Position" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No sound?" })).toBeNull();
  });

  // @covers sync-workflow/preview-media-states#unavailable-preview-does-not-block
  it("shows a failed open and still edits and continues", async () => {
    const user = userEvent.setup();
    vi.mocked(previewApi.openPreview).mockRejectedValue({
      code: "preview.media_unreadable",
      message: "cannot read",
      hintCode: null,
    });
    renderWizard();
    await reachOffset(user);

    expect(await screen.findByText("The selected media file cannot be read.")).toBeInTheDocument();
    await editAndContinue(user);
  });

  // @covers sync-workflow/preview-media-states#unavailable-preview-does-not-block
  it("shows a failed preparation after a media failure and still edits and continues", async () => {
    const user = userEvent.setup();
    vi.mocked(previewApi.preparePreviewAudio).mockRejectedValue(PREVIEW_FAILURE);
    renderWizard();
    await reachOffset(user);
    await waitFor(() => expect(mediaElement()).toHaveAttribute("src", PREVIEW_SESSION.url));

    fireEvent.error(mediaElement());

    expect(
      await screen.findByText("The selected media has no audio the preview can play."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to video" })).toBeNull();
    await editAndContinue(user);
  });

  // @covers sync-workflow/preview-session-follows-the-offset-step#leaving-closes-the-session
  it("closes the session when going back", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffset(user);
    await waitFor(() => expect(mediaElement()).toHaveAttribute("src", PREVIEW_SESSION.url));

    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));

    await waitFor(() => expect(previewApi.closePreview).toHaveBeenCalledWith("s1"));
  });

  // @covers sync-workflow/preview-session-follows-the-offset-step#leaving-closes-the-session
  it("closes the session when continuing", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffset(user);
    await waitFor(() => expect(mediaElement()).toHaveAttribute("src", PREVIEW_SESSION.url));

    await user.click(within(actionBar()).getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(previewApi.closePreview).toHaveBeenCalledWith("s1"));
  });

  // @covers sync-workflow/preview-session-follows-the-offset-step#leaving-closes-the-session
  it("closes the session when the wizard is unmounted", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWizard();
    await reachOffset(user);
    await waitFor(() => expect(mediaElement()).toHaveAttribute("src", PREVIEW_SESSION.url));

    unmount();

    await waitFor(() => expect(previewApi.closePreview).toHaveBeenCalledWith("s1"));
  });

  // @covers sync-workflow/preview-session-follows-the-offset-step#subtitle-failure-keeps-playback
  it("shows a subtitle that cannot be read while playback and Continue stay available", async () => {
    const user = userEvent.setup();
    vi.mocked(previewApi.loadPreviewCues).mockRejectedValue({
      code: "core.subtitle_format",
      message: "bad subtitle",
      hintCode: null,
    });
    renderWizard();
    await reachOffset(user);

    await waitFor(() => expect(previewApi.loadPreviewCues).toHaveBeenCalledWith(SUBTITLE));
    expect(await screen.findByText("The subtitle file could not be parsed.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Play" })).toBeEnabled();
    expect(within(actionBar()).getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});

describe("keyboard focus when detection starts", () => {
  // @covers sync-workflow/starting-detection-keeps-keyboard-focus#start-from-the-primary-position
  it("moves focus to Cancel when detection starts from the primary position", async () => {
    const run = deferred<SyncDetectionDto>();
    vi.mocked(api.detectSyncOffset).mockReturnValue(run.promise);
    const user = userEvent.setup();
    renderWizard();
    await reachDetect(user);

    act(() => primary().focus());
    await user.keyboard("{Enter}");

    expect(document.activeElement).toBe(within(actionBar()).getByRole("button", { name: "Cancel" }));
    await act(async () => run.resolve(DETECTION));
  });

  // @covers sync-workflow/starting-detection-keeps-keyboard-focus#start-from-a-secondary-position
  it("moves focus to Cancel when detection starts from a secondary position", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOffset(user);
    await user.click(within(actionBar()).getByRole("button", { name: "Back" }));
    const run = deferred<SyncDetectionDto>();
    vi.mocked(api.detectSyncOffset).mockReturnValue(run.promise);

    act(() => within(actionBar()).getByRole("button", { name: "Start detection" }).focus());
    await user.keyboard("{Enter}");

    expect(document.activeElement).toBe(within(actionBar()).getByRole("button", { name: "Cancel" }));
    await act(async () => run.resolve(DETECTION));
  });
});
