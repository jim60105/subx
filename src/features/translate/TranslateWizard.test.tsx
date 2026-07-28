import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, setupI18n } from "../../test/renderWithI18n";
import type {
  TranslatePlanDto,
  TranslateScanResult,
  TranslationReportDto,
} from "../../types/ipc";
import { TranslateWizard } from "./TranslateWizard";

vi.mock("./translateWizardApi");
vi.mock("../../platform/filePickers");
import * as pickers from "../../platform/filePickers";
import * as api from "./translateWizardApi";

const SCAN: TranslateScanResult = {
  files: [
    { name: "one.srt", cueCount: 2, unparsable: false },
    { name: "two.srt", cueCount: 3, unparsable: false },
    { name: "broken.srt", cueCount: 0, unparsable: true },
  ],
  defaultTargetLanguage: "zh-TW",
};

const PLAN: TranslatePlanDto = {
  planId: "translate-1",
  targetLanguage: "zh-TW",
  outputMode: "suffix",
  items: [
    {
      id: 0,
      inputName: "one.srt",
      inputPath: "/m/one.srt",
      outputPath: "/m/one.zh-TW.srt",
      cueCount: 2,
      outputExists: false,
      skipReason: null,
    },
    {
      id: 1,
      inputName: "two.srt",
      inputPath: "/m/two.srt",
      outputPath: "/m/two.zh-TW.srt",
      cueCount: 3,
      outputExists: true,
      skipReason: "translate.output_exists",
    },
    {
      id: 2,
      inputName: "broken.srt",
      inputPath: "/m/broken.srt",
      outputPath: "/m/broken.zh-TW.srt",
      cueCount: 0,
      outputExists: false,
      skipReason: "translate.unparsable",
    },
  ],
};

const OVERWRITTEN_PLAN: TranslatePlanDto = {
  ...PLAN,
  items: [PLAN.items[0], { ...PLAN.items[1], skipReason: null }, PLAN.items[2]],
};

const REPORT: TranslationReportDto = {
  outcomes: [
    {
      inputName: "one.srt",
      outputPath: "/m/one.zh-TW.srt",
      status: "translated",
      backupPath: null,
      error: null,
      warning: null,
    },
    {
      inputName: "two.srt",
      outputPath: "/m/two.zh-TW.srt",
      status: "failed",
      backupPath: null,
      error: { code: "core.ai_service", message: "unreachable", hintCode: "core.ai_service.hint" },
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
  const onOpenSettings = vi.fn();
  const view = render(
    <I18nextProvider i18n={i18n}>
      <TranslateWizard onOpenSettings={onOpenSettings} />
    </I18nextProvider>,
  );
  return { ...view, onOpenSettings };
}

/** Drives Step 1 up to an enabled Continue button, then clicks it. */
async function reachOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Browse files" }));
  const next = await screen.findByRole("button", { name: "Continue" });
  await waitFor(() => expect(next).toBeEnabled());
  await user.click(next);
}

/** Steps 1 and 2, landing on the translate step with the runnable items selected. */
async function reachRun(user: ReturnType<typeof userEvent.setup>) {
  await reachOptions(user);
  await screen.findByRole("list", { name: "Planned translations" });
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

beforeEach(async () => {
  await setupI18n("en");
  vi.mocked(pickers.subscribeToDroppedPaths).mockResolvedValue(() => {});
  vi.mocked(pickers.pickFiles).mockResolvedValue(["/m/one.srt"]);
  vi.mocked(pickers.pickFolder).mockResolvedValue(["/m"]);
  vi.mocked(api.scanTranslateInputs).mockResolvedValue(SCAN);
  vi.mocked(api.previewTranslation).mockResolvedValue(PLAN);
  vi.mocked(api.executeTranslation).mockResolvedValue(REPORT);
  vi.mocked(api.cancelTranslation).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the translate wizard", () => {
  // @covers translate-workflow/multi-source-selection-with-cue-count-preview#no-subtitles-block-progress
  it("blocks progress when the sources hold no subtitles", async () => {
    const user = userEvent.setup();
    vi.mocked(api.scanTranslateInputs).mockRejectedValue({
      code: "translate.no_subtitles",
      message: "the sources hold no translatable subtitles",
      hintCode: "translate.no_subtitles.hint",
    });
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Browse files" }));

    expect(
      await screen.findByText("No translatable subtitle files were found."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("lists every subtitle with its cue count in Step 1", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Browse files" }));

    expect(await screen.findByText("2 cues")).toBeInTheDocument();
    expect(screen.getByText("The subtitle file could not be parsed.")).toBeInTheDocument();
    expect(screen.getByText("5 cues total")).toBeInTheDocument();
  });

  /// The bug this split exists to prevent: Step 1 used to build the plan, and
  /// a plan needs a target language, so on any install without
  /// `translation.default_target_language` the very first scan failed with
  /// `translate.no_target_language` — an error the user could not act on,
  /// because the only field that supplies one is on Step 2 and Continue was
  /// disabled. Scanning must not ask the backend for a plan.
  // @covers translate-workflow/multi-source-selection-with-cue-count-preview#scanning-does-not-require-a-target-language
  it("scans and offers Continue even when no target language is configured", async () => {
    const user = userEvent.setup();
    vi.mocked(api.scanTranslateInputs).mockResolvedValue({
      ...SCAN,
      defaultTargetLanguage: null,
    });
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Browse files" }));

    expect(await screen.findByText("5 cues total")).toBeInTheDocument();
    expect(api.previewTranslation).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled(),
    );
  });

  /// ...and once on Step 2, the missing language is reported beside the field
  /// that fixes it, with the next action held until one is entered.
  // @covers translate-workflow/translation-options-seeded-from-shared-configuration#missing-target-language-blocks-progress
  it("asks for the target language on Step 2 when neither the form nor the config has one", async () => {
    const user = userEvent.setup();
    vi.mocked(api.scanTranslateInputs).mockResolvedValue({
      ...SCAN,
      defaultTargetLanguage: null,
    });
    vi.mocked(api.previewTranslation).mockRejectedValue({
      code: "translate.no_target_language",
      message: "no target language was provided and none is configured",
      hintCode: "translate.no_target_language.hint",
    });
    renderWizard();
    await reachOptions(user);

    expect(await screen.findByText("No target language was provided.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    // The field is right there, and typing into it re-previews.
    vi.mocked(api.previewTranslation).mockResolvedValue(PLAN);
    await user.type(screen.getByRole("textbox", { name: "Translate to" }), "English");

    await waitFor(() =>
      expect(api.previewTranslation).toHaveBeenLastCalledWith(
        ["/m/one.srt"],
        expect.objectContaining({ targetLanguage: "English" }),
      ),
    );
    expect(await screen.findByRole("list", { name: "Planned translations" })).toBeInTheDocument();
  });

  // @covers translate-workflow/translation-options-seeded-from-shared-configuration#target-language-prefilled-from-configuration
  it("prefills the target language from the configured default the scan reported", async () => {
    const user = userEvent.setup();
    renderWizard();

    await reachOptions(user);

    const field = await screen.findByRole("textbox", { name: "Translate to" });
    expect(field).toHaveValue("zh-TW");
    expect(api.previewTranslation).toHaveBeenCalledWith(
      ["/m/one.srt"],
      expect.objectContaining({ targetLanguage: "zh-TW", outputMode: "suffix", overwrite: false }),
    );
  });

  it("shows the resolved output and excludes an existing output until overwrite is enabled", async () => {
    const user = userEvent.setup();
    renderWizard();

    await reachOptions(user);

    expect(await screen.findByText("/m/two.zh-TW.srt")).toBeInTheDocument();
    const excluded = screen.getByRole("checkbox", { name: "Include two.srt" });
    expect(excluded).toBeDisabled();
    expect(excluded).not.toBeChecked();
    expect(screen.getByText("A file already exists at that path.")).toBeInTheDocument();
  });

  // @covers translate-workflow/output-resolution-with-conflict-handling#existing-output-is-excluded-unless-overwrite-is-enabled
  it("re-includes the existing-output item once overwrite is turned on", async () => {
    const user = userEvent.setup();
    vi.mocked(api.previewTranslation).mockResolvedValueOnce(PLAN);
    renderWizard();
    await reachOptions(user);

    vi.mocked(api.previewTranslation).mockResolvedValueOnce(OVERWRITTEN_PLAN);
    await user.click(await screen.findByRole("checkbox", { name: /Overwrite existing files/ }));

    await waitFor(() =>
      expect(api.previewTranslation).toHaveBeenLastCalledWith(
        ["/m/one.srt"],
        expect.objectContaining({ overwrite: true }),
      ),
    );
    const included = await screen.findByRole("checkbox", { name: "Include two.srt" });
    expect(included).toBeEnabled();
    expect(included).toBeChecked();
  });

  it("re-previews when the glossary text changes", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);

    await user.type(
      await screen.findByPlaceholderText("Alice = 愛麗絲"),
      "A",
    );

    await waitFor(() =>
      expect(api.previewTranslation).toHaveBeenLastCalledWith(
        ["/m/one.srt"],
        expect.objectContaining({ glossaryText: "A" }),
      ),
    );
  });

  /// Rubber-duck review finding: with no debounce on every option field, two
  /// `preview_translation` calls in flight at once could resolve out of
  /// order, and the backend's single-plan slot has no concept of "this
  /// commit is older than one already applied" — so a request that started
  /// first but finishes last would silently become the backend's active
  /// plan while the UI moved on. The fix queues an option change that arrives
  /// while a preview is still running instead of firing it concurrently.
  it("never sends a second preview while one is in flight, and still applies the latest options", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);
    vi.mocked(api.previewTranslation).mockClear();

    const first = deferred<TranslatePlanDto>();
    const second = deferred<TranslatePlanDto>();
    let calls = 0;
    vi.mocked(api.previewTranslation).mockImplementation(() => {
      calls += 1;
      return calls === 1 ? first.promise : second.promise;
    });

    await user.click(screen.getByRole("radio", { name: "Replace the original file" }));
    await user.click(screen.getByRole("radio", { name: "New file with a language suffix" }));

    // The second change arrived while the first request was still running, so
    // it must be queued rather than sent concurrently.
    expect(calls).toBe(1);

    first.resolve({ ...PLAN, outputMode: "replace" });
    await waitFor(() => expect(calls).toBe(2));

    second.resolve(PLAN);
    await waitFor(() =>
      expect(api.previewTranslation).toHaveBeenLastCalledWith(
        ["/m/one.srt"],
        expect.objectContaining({ outputMode: "suffix" }),
      ),
    );
    // Exactly two requests total: the stale first response never triggered a
    // third, superseding call of its own.
    expect(api.previewTranslation).toHaveBeenCalledTimes(2);
  });

  it("disables the continue action once every runnable item is deselected", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);

    await user.click(await screen.findByRole("checkbox", { name: "Include one.srt" }));

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#per-file-progress-is-reported
  it("reports which file is being translated", async () => {
    const user = userEvent.setup();
    const pending = deferred<TranslationReportDto>();
    vi.mocked(api.executeTranslation).mockImplementation((_planId, _ids, onProgress) => {
      onProgress({ stage: "translating", index: 2, total: 3, fileName: "two.srt" });
      return pending.promise;
    });
    renderWizard();
    await reachRun(user);

    await user.click(await screen.findByRole("button", { name: "Translate now" }));

    expect(await screen.findByText("Translating 2 of 3 · two.srt")).toBeInTheDocument();

    pending.resolve(REPORT);
    await screen.findByText("Results");
  });

  // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#cancellation-abandons-only-unfinished-work
  it("asks the backend to cancel and still advances to the report it returns", async () => {
    const user = userEvent.setup();
    const pending = deferred<TranslationReportDto>();
    vi.mocked(api.executeTranslation).mockReturnValue(pending.promise);
    renderWizard();
    await reachRun(user);
    await user.click(await screen.findByRole("button", { name: "Translate now" }));

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(api.cancelTranslation).toHaveBeenCalled();

    pending.resolve({
      ...REPORT,
      cancelled: true,
      outcomes: [REPORT.outcomes[0], { ...REPORT.outcomes[1], status: "cancelled", error: null }],
      failureCount: 0,
    });

    expect(
      await screen.findByText("You stopped the batch, so the remaining files were not started."),
    ).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#per-file-failure-does-not-abort
  it("reports each item's outcome, failures included, on the dedicated report step", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachRun(user);

    await user.click(await screen.findByRole("button", { name: "Translate now" }));

    expect(await screen.findByText("1 translated · 1 failed")).toBeInTheDocument();
    expect(screen.getByText("Translated")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("The AI service could not be reached.")).toBeInTheDocument();
  });

  // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#ai-provider-not-configured
  it("offers a Settings link when the AI provider is not configured", async () => {
    const user = userEvent.setup();
    vi.mocked(api.executeTranslation).mockRejectedValue({
      code: "translate.ai_not_configured",
      message: "no AI provider configured",
      hintCode: "translate.ai_not_configured.hint",
    });
    const { onOpenSettings } = renderWizard();
    await reachRun(user);

    await user.click(await screen.findByRole("button", { name: "Translate now" }));

    const settingsButton = await screen.findByRole("button", { name: "Open Settings" });
    await user.click(settingsButton);

    expect(onOpenSettings).toHaveBeenCalled();
    // A run-level failure never produces a report, so Step 4 must not show.
    expect(screen.queryByText("Results")).not.toBeInTheDocument();
  });

  // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#stale-plan-is-rejected
  it("offers a way back to the sources when the plan is stale", async () => {
    const user = userEvent.setup();
    vi.mocked(api.executeTranslation).mockRejectedValue({
      code: "translate.stale_plan",
      message: "the plan was replaced by a newer preview",
      hintCode: "translate.stale_plan.hint",
    });
    renderWizard();
    await reachRun(user);

    await user.click(await screen.findByRole("button", { name: "Translate now" }));

    expect(await screen.findByText("This translation plan is out of date.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start over" }));

    expect(screen.getByText("Choose what to translate")).toBeInTheDocument();
  });

  it("discards the plan when the user steps back from the preview", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);
    await screen.findByRole("list", { name: "Planned translations" });

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText("Choose what to translate")).toBeInTheDocument();
    // Backing out must invalidate the backend's plan too, not just forget its
    // id here — otherwise a slow in-flight preview could commit after a newer
    // one and bounce execution with a spurious stale-plan error.
    expect(api.cancelTranslation).toHaveBeenCalled();
  });
});
