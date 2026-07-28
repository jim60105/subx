import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, setupI18n } from "../../test/renderWithI18n";
import type { ConversionReportDto, ConvertPlanDto } from "../../types/ipc";
import { ConvertWizard } from "./ConvertWizard";

vi.mock("./convertWizardApi");
vi.mock("../../platform/filePickers");
import * as pickers from "../../platform/filePickers";
import * as api from "./convertWizardApi";

const PLAN: ConvertPlanDto = {
  planId: "convert-1",
  targetFormat: "vtt",
  keepOriginal: true,
  items: [
    {
      id: 0,
      inputName: "one.srt",
      inputPath: "/m/one.srt",
      outputPath: "/m/one.vtt",
      outputExists: false,
      skipReason: null,
    },
    {
      id: 1,
      inputName: "two.srt",
      inputPath: "/m/two.srt",
      outputPath: "/m/two.vtt",
      outputExists: true,
      skipReason: null,
    },
    {
      id: 2,
      inputName: "already.vtt",
      inputPath: "/m/already.vtt",
      outputPath: "/m/already.vtt",
      outputExists: false,
      skipReason: "convert.already_target_format",
    },
  ],
};

const REPORT: ConversionReportDto = {
  outcomes: [
    {
      inputName: "one.srt",
      outputPath: "/m/one.vtt",
      status: "converted",
      overwritten: false,
      originalRemoved: false,
      error: null,
      warning: null,
    },
    {
      inputName: "two.srt",
      outputPath: "/m/two.vtt",
      status: "failed",
      overwritten: false,
      originalRemoved: false,
      error: { code: "core.subtitle_format", message: "unparsable", hintCode: null },
      warning: null,
    },
  ],
  successCount: 1,
  failureCount: 1,
  cancelled: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderWizard() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ConvertWizard />
    </I18nextProvider>,
  );
}

/**
 * The shell's action bar. Controls that moved out of the panel are queried
 * through it, so one drifting back inside fails the test rather than passing
 * unnoticed.
 */
function actionBar(): HTMLElement {
  const element = document.querySelector(".wizard__actions");
  if (element === null) throw new Error("the wizard rendered no action bar");
  return element as HTMLElement;
}

/** Drives Step 1 up to an enabled Continue button, then clicks it. */
async function reachOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Browse files" }));
  const next = await screen.findByRole("button", { name: "Continue" });
  await waitFor(() => expect(next).toBeEnabled());
  await user.click(next);
}

/** Steps 1 and 2, landing on the run step with everything runnable selected. */
async function reachRun(user: ReturnType<typeof userEvent.setup>) {
  await reachOptions(user);
  await screen.findByRole("list", { name: "Planned conversions" });
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

beforeEach(async () => {
  await setupI18n("en");
  vi.mocked(pickers.subscribeToDroppedPaths).mockResolvedValue(() => {});
  vi.mocked(pickers.pickFiles).mockResolvedValue(["/m/one.srt"]);
  vi.mocked(pickers.pickFolder).mockResolvedValue(["/m"]);
  vi.mocked(api.scanConvertInputs).mockResolvedValue({ subtitleCount: 3 });
  vi.mocked(api.previewConversion).mockResolvedValue(PLAN);
  vi.mocked(api.executeConversion).mockResolvedValue(REPORT);
  vi.mocked(api.cancelConversion).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the convert wizard", () => {
  // @covers convert-workflow/multi-source-selection-with-scan-preview#no-convertible-subtitles-block-progress
  it("blocks progress when the sources hold no subtitles", async () => {
    const user = userEvent.setup();
    vi.mocked(api.scanConvertInputs).mockResolvedValue({ subtitleCount: 0 });
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Browse files" }));

    expect(
      await screen.findByText("No subtitle files were found in these sources."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(api.previewConversion).not.toHaveBeenCalled();
  });

  /// The first preview asks for no particular format; what comes back is what
  /// the shared configuration chose, and that is what the control shows.
  // @covers convert-workflow/conversion-options-with-exact-output-path-preview#target-format-defaults-from-configuration
  it("preselects the format the backend resolved from the configuration", async () => {
    const user = userEvent.setup();
    renderWizard();

    await reachOptions(user);

    expect(api.previewConversion).toHaveBeenCalledWith(["/m/one.srt"], {
      targetFormat: null,
      keepOriginal: true,
    });
    const select = await screen.findByRole("combobox", { name: "Convert to" });
    expect(select).toHaveValue("vtt");
  });

  // @covers convert-workflow/conversion-options-with-exact-output-path-preview#existing-output-is-flagged
  it("shows the resolved output path and flags an overwrite", async () => {
    const user = userEvent.setup();
    renderWizard();

    await reachOptions(user);

    expect(await screen.findByText("/m/two.vtt")).toBeInTheDocument();
    expect(screen.getByText("Replaces an existing file")).toBeInTheDocument();
    // The overwrite is a warning, not a block: it stays selected.
    expect(screen.getByRole("checkbox", { name: "Include two.srt" })).toBeChecked();
  });

  // @covers convert-workflow/conversion-options-with-exact-output-path-preview#input-already-in-the-target-format-is-auto-excluded
  it("leaves an already-converted file unselectable", async () => {
    const user = userEvent.setup();
    renderWizard();

    await reachOptions(user);

    const excluded = await screen.findByRole("checkbox", { name: "Include already.vtt" });
    expect(excluded).toBeDisabled();
    expect(excluded).not.toBeChecked();
    expect(screen.getByText("Already in the target format.")).toBeInTheDocument();
  });

  it("previews again when the target format changes", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Convert to" }),
      "ass",
    );

    await waitFor(() =>
      expect(api.previewConversion).toHaveBeenLastCalledWith(["/m/one.srt"], {
        targetFormat: "ass",
        keepOriginal: true,
      }),
    );
  });

  it("previews again when keep-original is turned off", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);

    await user.click(await screen.findByRole("checkbox", { name: /Keep the original files/ }));

    await waitFor(() =>
      expect(api.previewConversion).toHaveBeenLastCalledWith(["/m/one.srt"], {
        targetFormat: "vtt",
        keepOriginal: false,
      }),
    );
  });

  // @covers convert-workflow/per-item-selection#empty-selection-blocks-execution
  it("disables the execute action once everything is deselected", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);

    await user.click(await screen.findByRole("checkbox", { name: "Include one.srt" }));
    await user.click(screen.getByRole("checkbox", { name: "Include two.srt" }));

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  // @covers convert-workflow/per-item-selection#excluding-an-item
  it("converts only the items left selected", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);
    await user.click(await screen.findByRole("checkbox", { name: "Include two.srt" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(await within(actionBar()).findByRole("button", { name: "Convert now" }));

    expect(api.executeConversion).toHaveBeenCalledWith(
      "convert-1",
      [0],
      expect.any(Function),
    );
  });

  // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#per-file-progress-is-reported
  it("reports which file is being converted", async () => {
    const user = userEvent.setup();
    const pending = deferred<ConversionReportDto>();
    vi.mocked(api.executeConversion).mockImplementation((_planId, _ids, onProgress) => {
      onProgress({ stage: "converting", index: 2, total: 3, fileName: "two.srt" });
      return pending.promise;
    });
    renderWizard();
    await reachRun(user);

    await user.click(await within(actionBar()).findByRole("button", { name: "Convert now" }));

    expect(await screen.findByText("Converting 2 of 3 · two.srt")).toBeInTheDocument();

    pending.resolve(REPORT);
    await screen.findByText("1 converted · 1 failed");
  });

  // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#cancellation-stops-between-files
  it("asks the backend to stop and still shows the report it returns", async () => {
    const user = userEvent.setup();
    const pending = deferred<ConversionReportDto>();
    vi.mocked(api.executeConversion).mockReturnValue(pending.promise);
    renderWizard();
    await reachRun(user);
    await user.click(await within(actionBar()).findByRole("button", { name: "Convert now" }));

    await user.click(await within(actionBar()).findByRole("button", { name: "Cancel" }));
    expect(api.cancelConversion).toHaveBeenCalled();

    pending.resolve({
      ...REPORT,
      cancelled: true,
      outcomes: [
        REPORT.outcomes[0],
        { ...REPORT.outcomes[1], status: "cancelled", error: null },
      ],
      failureCount: 0,
    });

    expect(
      await screen.findByText("You stopped the batch, so the remaining files were not started."),
    ).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#per-item-failure-does-not-abort
  it("reports each item's outcome, failures included", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachRun(user);

    await user.click(await within(actionBar()).findByRole("button", { name: "Convert now" }));

    expect(await screen.findByText("1 converted · 1 failed")).toBeInTheDocument();
    expect(screen.getByText("Converted")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("The subtitle file could not be parsed.")).toBeInTheDocument();
  });

  // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#stale-plan-is-rejected
  it("offers a way back to the sources when the plan is stale", async () => {
    const user = userEvent.setup();
    vi.mocked(api.executeConversion).mockRejectedValue({
      code: "convert.stale_plan",
      message: "the plan was replaced by a newer preview",
      hintCode: "convert.stale_plan.hint",
    });
    renderWizard();
    await reachRun(user);

    await user.click(await within(actionBar()).findByRole("button", { name: "Convert now" }));

    expect(await screen.findByText("This conversion plan is out of date.")).toBeInTheDocument();
    await user.click(within(actionBar()).getByRole("button", { name: "Finish" }));

    expect(screen.getByText("Choose what to convert")).toBeInTheDocument();
  });

  /// Only a stale plan has a distinct recovery. Any other convert failure has
  /// none, and the bar must not invent one.
  it("offers no forward action when the batch fails for any other reason", async () => {
    const user = userEvent.setup();
    vi.mocked(api.executeConversion).mockRejectedValue({
      code: "convert.conversion_failed",
      message: "the batch could not start",
      hintCode: null,
    });
    renderWizard();
    await reachRun(user);

    await user.click(await within(actionBar()).findByRole("button", { name: "Convert now" }));

    await waitFor(() =>
      expect(
        within(actionBar()).queryByRole("button", { name: "Convert now" }),
      ).not.toBeInTheDocument(),
    );
    expect(within(actionBar()).queryByRole("button", { name: "Finish" })).not.toBeInTheDocument();
    expect(document.querySelectorAll(".wizard__actions-end button")).toHaveLength(0);
  });

  it("discards the plan when the user steps back from the preview", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);
    await screen.findByRole("list", { name: "Planned conversions" });

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Choose what to convert")).toBeInTheDocument();
    // Backing out must invalidate the backend's plan too, not just forget its
    // id here — otherwise a slow in-flight preview could commit after a newer
    // one and bounce execution with a spurious stale-plan error.
    expect(api.cancelConversion).toHaveBeenCalled();
    // Returning previews again rather than reusing the plan the backend may
    // already have replaced.
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(api.previewConversion).toHaveBeenCalledTimes(2));
  });
});
