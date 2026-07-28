import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, setupI18n } from "../../test/renderWithI18n";
import type { SyncDetectionDto } from "../../types/ipc";
import { SyncWizard } from "./SyncWizard";

vi.mock("./syncWizardApi");
vi.mock("../../platform/filePickers");
import * as pickers from "../../platform/filePickers";
import * as api from "./syncWizardApi";

const MEDIA = "/m/episode.mkv";
const SUBTITLE = "/m/episode.srt";

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

/** Step 1 with both slots filled, landing on the method step. */
async function reachMethod(user: ReturnType<typeof userEvent.setup>, withMedia = true) {
  if (withMedia) await choose(user, "Choose video", MEDIA);
  await choose(user, "Choose subtitle", SUBTITLE);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("group", { name: "Offset method" });
}

/** Steps 1 and 2 on the automatic path, landing on the review step. */
async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await reachMethod(user);
  await user.click(screen.getByRole("button", { name: "Continue" }));
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
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the sync wizard", () => {
  // @covers sync-workflow/input-selection-for-a-single-video-subtitle-pair#pair-selection-enables-automatic-detection
  it("offers both methods once a video and a subtitle are chosen", async () => {
    const user = userEvent.setup();
    renderWizard();

    await reachMethod(user);

    expect(screen.getByRole("radio", { name: /Detect it automatically/ })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Enter it myself/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
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
      await screen.findByRole("radio", { name: /Detect it automatically/ }),
    ).toBeEnabled();
  });

  // @covers sync-workflow/input-selection-for-a-single-video-subtitle-pair#subtitle-only-restricts-to-manual-offset
  it("restricts a subtitle-only run to a manual offset, and says why", async () => {
    const user = userEvent.setup();
    renderWizard();

    await reachMethod(user, false);

    expect(screen.getByRole("radio", { name: /Detect it automatically/ })).toBeDisabled();
    expect(
      screen.getByText("Add a video or audio file to enable detection."),
    ).toBeInTheDocument();
    // Automatic is unreachable, so nothing may proceed until manual is chosen.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Enter it myself/ }));

    expect(screen.getByRole("spinbutton", { name: /Offset in milliseconds/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  // @covers sync-workflow/method-selection-seeded-from-shared-configuration#defaults-come-from-the-shared-configuration
  it("seeds the sensitivity from the configuration and leaves it there untouched", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachMethod(user);

    expect(await screen.findByRole("slider", { name: /Speech sensitivity/ })).toHaveValue("40");

    await user.click(screen.getByRole("button", { name: "Continue" }));

    // A null sensitivity means "whatever the configuration holds", the same way
    // a null output path means "the default name": an untouched control sends
    // no override at all rather than echoing the value back.
    expect(api.detectSyncOffset).toHaveBeenCalledWith(MEDIA, SUBTITLE, null);
  });

  it("sends a moved sensitivity as a per-run override", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachMethod(user);

    // A range input does not respond to keyboard or pointer input under jsdom,
    // so the value change is dispatched directly.
    const slider = await screen.findByRole("slider", { name: /Speech sensitivity/ });
    fireEvent.change(slider, { target: { value: "75" } });
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(api.detectSyncOffset).toHaveBeenCalledWith(MEDIA, SUBTITLE, 75);
  });

  // @covers sync-workflow/method-selection-seeded-from-shared-configuration#manual-offset-beyond-the-configured-maximum-is-rejected
  it("blocks a manual offset beyond the configured maximum", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachMethod(user);
    await user.click(screen.getByRole("radio", { name: /Enter it myself/ }));

    const field = screen.getByRole("spinbutton", { name: /Offset in milliseconds/ });
    await user.clear(field);
    await user.type(field, "90000");

    expect(
      await screen.findByText(
        "This is beyond the 60.0 second limit in your settings. Reduce it to continue.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
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

    await reachReview(user);

    // Twice: the detection's own reading, and the editable field it seeds. They
    // agree until the value is edited, which the next test is about.
    expect(await screen.findAllByText("1.500 seconds")).toHaveLength(2);
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("The analysis finished with a warning.")).toBeInTheDocument();
  });

  // @covers sync-workflow/cancellable-local-offset-detection-with-review-and-fine-tuning#the-reviewed-value-is-what-gets-applied
  it("applies the edited value rather than the detected one", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachReview(user);

    const field = await screen.findByRole("spinbutton", { name: /Offset in milliseconds/ });
    await user.clear(field);
    await user.type(field, "1250");

    // The detection's own reading stays as it was — what changed is the value
    // under review, which is the one that gets applied.
    expect(screen.getByText("1.500 seconds")).toBeInTheDocument();
    expect(screen.getByText("1.250 seconds")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await within(actionBar()).findByRole("button", { name: "Save" }));

    // A null output path is what asks the backend for the default `_synced`
    // name; the field was left as proposed.
    expect(api.applySyncOffset).toHaveBeenCalledWith(SUBTITLE, 1_250, null, false);
    expect(await screen.findByText("/m/episode_synced.srt")).toBeInTheDocument();
  });

  // @covers sync-workflow/cancellable-local-offset-detection-with-review-and-fine-tuning#user-cancels-detection
  it("abandons a cancelled detection and ignores its late result", async () => {
    const user = userEvent.setup();
    const pending = deferred<SyncDetectionDto>();
    vi.mocked(api.detectSyncOffset).mockReturnValue(pending.promise);
    renderWizard();
    await reachReview(user);

    // Back is this step's cancel; it was never anything else, and a second
    // button with the same destination was only ever noise.
    await user.click(await within(actionBar()).findByRole("button", { name: "Back" }));

    expect(api.cancelSyncDetection).toHaveBeenCalled();
    expect(await screen.findByRole("group", { name: "Offset method" })).toBeInTheDocument();

    // The backend keeps running the invocation nobody awaits; a result that
    // lands afterwards must change nothing the user can see.
    pending.resolve(DETECTION);
    await waitFor(() => expect(screen.queryByText("1.500 seconds")).not.toBeInTheDocument());
  });

  // @covers sync-workflow/applying-the-offset-writes-a-new-output-with-overwrite-protection#default-output-path-is-proposed
  it("proposes a _synced sibling that the user can replace", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachReview(user);
    await user.click(await screen.findByRole("button", { name: "Continue" }));

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
    await reachReview(user);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
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
    await reachReview(user);
    await user.click(await within(actionBar()).findByRole("button", { name: "Continue" }));
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
    await reachReview(user);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
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

  it("offers a retry when the detection fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.detectSyncOffset).mockRejectedValueOnce({
      code: "sync.vad_unavailable",
      message: "VAD detector is required but not available",
      hintCode: "sync.vad_unavailable.hint",
    });
    renderWizard();

    await reachReview(user);

    expect(
      await screen.findByText("Automatic detection is unavailable on this system."),
    ).toBeInTheDocument();
    expect(screen.getByText("Go back and enter the offset yourself instead.")).toBeInTheDocument();

    await user.click(within(actionBar()).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(api.detectSyncOffset).toHaveBeenCalledTimes(2));
  });

  it("returns to the first step once the file has been written", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachReview(user);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await within(actionBar()).findByRole("button", { name: "Save" }));

    await user.click(await within(actionBar()).findByRole("button", { name: "Finish" }));

    expect(screen.getByText("Choose the video and subtitle")).toBeInTheDocument();
    expect(screen.getByText("No subtitle chosen.")).toBeInTheDocument();
  });
});
