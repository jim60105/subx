import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, setupI18n } from "../../test/renderWithI18n";
import type {
  TranslatePlanDto,
  TranslateProgress,
  TranslateScanResult,
  TranslationReportDto,
} from "../../types/ipc";
import { TranslateWizard } from "./TranslateWizard";
import { useTranslateWizard } from "./useTranslateWizard";

vi.mock("./translateWizardApi");
vi.mock("../../platform/filePickers");
import * as pickers from "../../platform/filePickers";
import * as api from "./translateWizardApi";

/** A directly added file plus a folder source holding a parsable and an unparsable file. */
const SCAN_SOURCES = ["/m/one.srt", "/m/extra/"];
const SCAN: TranslateScanResult = {
  files: [
    { name: "one.srt", source: "/m/one.srt", cueCount: 2, unparsable: false },
    { name: "two.srt", source: "/m/extra/", cueCount: 3, unparsable: false },
    { name: "broken.srt", source: "/m/extra/", cueCount: 0, unparsable: true },
  ],
  defaultTargetLanguage: "zh-TW",
};

/** What the backend would find for directly added subtitle files: each one itself, 2 cues. */
function scanFor(paths: string[]): TranslateScanResult {
  return {
    files: paths
      .filter((path) => /\.(srt|ass)$/.test(path))
      .map((path) => ({ name: path.slice(path.lastIndexOf("/") + 1), source: path, cueCount: 2, unparsable: false })),
    defaultTargetLanguage: "zh-TW",
  };
}

function scanItem(name: string, source: string, cueCount: number, unparsable = false) {
  return { name, source, cueCount, unparsable };
}

/** The ledger group whose header names `location`. */
function ledgerGroup(location: string): HTMLElement {
  return within(screen.getByRole("group", { name: "Selected sources" })).getByRole("group", { name: location });
}

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

/** The diff line kinds and texts of the plan row whose checkbox is named for `name`. */
function rowLines(name: string): Array<[string | null, string]> {
  const row = screen.getByRole("checkbox", { name: `Include ${name}` }).closest("li");
  if (row === null) throw new Error(`no plan row for ${name}`);
  return [...row.querySelectorAll(".diff-line")].map((line) => [
    line.getAttribute("data-kind"),
    line.querySelector(".diff-line__text")?.textContent ?? "",
  ]);
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
  vi.mocked(api.scanTranslateInputs).mockImplementation(async (paths) => scanFor(paths));
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
    vi.mocked(pickers.pickFiles).mockResolvedValue(SCAN_SOURCES);
    vi.mocked(api.scanTranslateInputs).mockResolvedValue(SCAN);
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Browse files" }));

    expect(await screen.findByText("3 files · 5 cues")).toBeInTheDocument();
    expect(within(ledgerGroup("/m/")).getByText("2 cues", { selector: ".translate-ledger__row *" })).toBeInTheDocument();
    expect(within(ledgerGroup("/m/extra/")).getByText("Unparsable")).toBeInTheDocument();
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

    expect(await screen.findByText("3 files · 5 cues")).toBeInTheDocument();
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

    // A runnable item shows its resolved output; an excluded one shows none.
    expect(await screen.findByText("/m/one.zh-TW.srt")).toBeInTheDocument();
    expect(screen.queryByText("/m/two.zh-TW.srt")).not.toBeInTheDocument();
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
      onProgress({
        stage: "translating",
        index: 1,
        total: 1,
        fileName: "one.srt",
        itemId: 0,
        processedCues: 0,
        totalCues: 2,
        batchSize: 40,
        batchTotal: 1,
        batchesDone: 0,
        batchInFlight: 1,
        resend: false,
        outcome: null,
      });
      return pending.promise;
    });
    renderWizard();
    await reachRun(user);

    await user.click(await within(actionBar()).findByRole("button", { name: "Translate now" }));

    expect(await screen.findByText("Translating 1 of 1 · one.srt · Batch 1 of 1")).toBeInTheDocument();

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
    await user.click(await within(actionBar()).findByRole("button", { name: "Translate now" }));

    await user.click(await within(actionBar()).findByRole("button", { name: "Cancel" }));
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

    await user.click(await within(actionBar()).findByRole("button", { name: "Translate now" }));

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

    await user.click(await within(actionBar()).findByRole("button", { name: "Translate now" }));

    const settingsButton = await within(actionBar()).findByRole("button", { name: "Open Settings" });
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

    await user.click(await within(actionBar()).findByRole("button", { name: "Translate now" }));

    expect(await screen.findByText("This translation plan is out of date.")).toBeInTheDocument();
    await user.click(within(actionBar()).getByRole("button", { name: "Start over" }));

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

describe("the translate sources step", () => {
  // @covers translate-workflow/translate-sources-step-demonstrates-accepted-inputs#drop-zone-shows-the-kinds-translate-accepts
  it("shows the kinds it accepts as glyphs and keeps the sentence for assistive technology", () => {
    renderWizard();

    const kinds = [...document.querySelectorAll(".drop-zone [data-kind]")].map((item) =>
      item.getAttribute("data-kind"),
    );
    expect(kinds).toEqual(["folder", "subtitle", "archive"]);
    expect(document.querySelector('.drop-zone [data-kind="video"]')).toBeNull();
    const sentence = screen.getByText(
      "Add the subtitles you want translated. Folders, individual files, and archives all work.",
    );
    expect(sentence.closest(".visually-hidden")).not.toBeNull();
  });

  // @covers translate-workflow/translate-sources-step-demonstrates-accepted-inputs#removing-a-folder-group-rescans-without-it
  it("removes a whole folder group and rescans with what is left", async () => {
    const user = userEvent.setup();
    vi.mocked(pickers.pickFiles).mockResolvedValue(["/a/1.srt", "/a/2.srt", "/b/3.srt"]);
    renderWizard();
    await user.click(screen.getByRole("button", { name: "Browse files" }));
    await waitFor(() => expect(api.scanTranslateInputs).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Remove all 2 items in /a/" }));

    const list = screen.getByRole("group", { name: "Selected sources" });
    expect(within(list).queryByText("1.srt")).not.toBeInTheDocument();
    expect(within(list).queryByText("2.srt")).not.toBeInTheDocument();
    expect(within(list).getByText("3.srt")).toBeInTheDocument();
    await waitFor(() => expect(api.scanTranslateInputs).toHaveBeenCalledTimes(2));
    expect(api.scanTranslateInputs).toHaveBeenLastCalledWith(["/b/3.srt"]);
  });
});

describe("the translate sources ledger", () => {
  async function addSources(paths: string[], scan?: TranslateScanResult) {
    const user = userEvent.setup();
    vi.mocked(pickers.pickFiles).mockResolvedValue(paths);
    if (scan !== undefined) vi.mocked(api.scanTranslateInputs).mockResolvedValue(scan);
    renderWizard();
    await user.click(screen.getByRole("button", { name: "Browse files" }));
    await waitFor(() => expect(api.scanTranslateInputs).toHaveBeenCalled());
    return user;
  }

  it("lists each found subtitle exactly once, in one list", async () => {
    await addSources(["/m/a.srt", "/m/b.srt"]);

    await screen.findByText("2 files · 4 cues");
    expect(document.querySelectorAll(".translate-ledger")).toHaveLength(1);
    expect(screen.queryByRole("list", { name: "Subtitle files found" })).not.toBeInTheDocument();
    expect(screen.getAllByText("a.srt")).toHaveLength(1);
    expect(screen.getAllByText("b.srt")).toHaveLength(1);
  });

  it("lists a file added directly and through its folder once, attributed to the direct file", async () => {
    await addSources(["/m/a.srt", "/m/"], {
      files: [scanItem("a.srt", "/m/a.srt", 5), scanItem("b.srt", "/m/", 6)],
      defaultTargetLanguage: null,
    });

    expect(await screen.findByText("2 files · 11 cues")).toBeInTheDocument();
    expect(screen.getAllByText("a.srt")).toHaveLength(1);
    // Attributed to the direct file: it sits in the parent-folder group and
    // can be removed on its own.
    const direct = screen.getByRole("button", { name: "Remove a.srt" }).closest(".translate-ledger__group");
    expect(direct).toHaveAttribute("aria-label", "/m/");
    expect(screen.queryByRole("button", { name: "Remove b.srt" })).not.toBeInTheDocument();
  });

  it("removes a directly added file on its own and rescans exactly the other", async () => {
    const user = await addSources(["/m/a.srt", "/m/b.srt"]);
    await screen.findByText("2 files · 4 cues");

    await user.click(screen.getByRole("button", { name: "Remove a.srt" }));

    expect(screen.queryByText("a.srt")).not.toBeInTheDocument();
    expect(screen.getByText("b.srt")).toBeInTheDocument();
    await waitFor(() => expect(api.scanTranslateInputs).toHaveBeenCalledTimes(2));
    expect(api.scanTranslateInputs).toHaveBeenLastCalledWith(["/m/b.srt"]);
  });

  it("offers a group remove action but no row remove action for folder and archive sources", async () => {
    await addSources(["/show/", "/dl/subs.zip"], {
      files: [scanItem("e1.srt", "/show/", 10), scanItem("x.ass", "/dl/subs.zip", 20)],
      defaultTargetLanguage: null,
    });
    await screen.findByText("2 files · 30 cues");

    expect(within(ledgerGroup("/show/")).getByRole("button", { name: "Remove all 1 items in /show/" })).toBeInTheDocument();
    expect(within(ledgerGroup("/dl/subs.zip")).getByRole("button", { name: "Remove all 1 items in /dl/subs.zip" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove e1.srt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove x.ass" })).not.toBeInTheDocument();
  });

  it("shows a folder of directly added files as one group with its count and subtotal", async () => {
    await addSources(["/m/a.srt", "/m/b.srt"], {
      files: [scanItem("a.srt", "/m/a.srt", 378), scanItem("b.srt", "/m/b.srt", 372)],
      defaultTargetLanguage: null,
    });
    await screen.findByText("2 files · 750 cues");

    const group = ledgerGroup("/m/");
    const header = group.querySelector("header") as HTMLElement;
    expect(within(header).getByText("2 files")).toBeInTheDocument();
    expect(within(header).getByText("750 cues")).toBeInTheDocument();
    expect(document.querySelectorAll(".translate-ledger__group")).toHaveLength(1);
  });

  it("shows an archive source as its own group with the archive glyph", async () => {
    await addSources(["/m/a.srt", "/dl/subs.zip"], {
      files: [
        scanItem("a.srt", "/m/a.srt", 1),
        scanItem("x.ass", "/dl/subs.zip", 2),
        scanItem("y.ass", "/dl/subs.zip", 3),
        scanItem("z.ass", "/dl/subs.zip", 4),
      ],
      defaultTargetLanguage: null,
    });
    await screen.findByText("4 files · 10 cues");

    const archive = ledgerGroup("/dl/subs.zip");
    expect(archive).toHaveAttribute("data-kind", "archive");
    expect(within(archive).getAllByRole("listitem")).toHaveLength(3);
    expect(within(archive.querySelector("header") as HTMLElement).getByText("3 files")).toBeInTheDocument();
    expect(ledgerGroup("/m/")).toHaveAttribute("data-kind", "folder");
  });

  it("totals the files and excludes an unparsable file's cues, flagging it in text", async () => {
    await addSources(["/m/"], {
      files: [
        scanItem("a.srt", "/m/", 400),
        scanItem("b.srt", "/m/", 401),
        scanItem("c.srt", "/m/", 375),
        scanItem("d.srt", "/m/", 375),
        scanItem("bad.srt", "/m/", 0, true),
      ],
      defaultTargetLanguage: null,
    });

    expect(await screen.findByText("5 files · 1,551 cues")).toBeInTheDocument();
    const row = screen.getByText("bad.srt").closest("li") as HTMLElement;
    expect(row).toHaveTextContent("Unparsable");
  });

  it("lists a directly added file with a placeholder count while the scan runs", async () => {
    vi.mocked(api.scanTranslateInputs).mockReturnValue(new Promise(() => {}));
    await addSources(["/m/a.srt"]);

    const row = screen.getByText("a.srt").closest("li") as HTMLElement;
    expect(row.querySelector(".translate-ledger__placeholder")).not.toBeNull();
    expect(within(row).getByText("Counting cues")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Scanning…");
    expect(screen.queryByText(/^[\d,]+ (files · [\d,]+ )?cues$/)).not.toBeInTheDocument();
  });

  it("shows only a scanning header for a folder source while the scan runs", async () => {
    vi.mocked(api.scanTranslateInputs).mockReturnValue(new Promise(() => {}));
    await addSources(["/show/"]);

    const group = ledgerGroup("/show/");
    expect(within(group).getByText("Scanning…")).toBeInTheDocument();
    expect(within(group).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("renders no remove action for a group that would remove nothing", async () => {
    await addSources(["/m/"], {
      files: [scanItem("a.srt", "/m/", 1), scanItem("stray.srt", "/elsewhere", 2)],
      defaultTargetLanguage: null,
    });
    await screen.findByText("2 files · 3 cues");

    expect(within(ledgerGroup("/elsewhere")).queryByRole("button")).not.toBeInTheDocument();
    expect(within(ledgerGroup("/m/")).getByRole("button", { name: "Remove all 1 items in /m/" })).toBeInTheDocument();
  });

  it("keeps the sources listed when the scan fails", async () => {
    vi.mocked(api.scanTranslateInputs).mockRejectedValue({
      code: "core.io",
      message: "boom",
      hintCode: null,
    });
    await addSources(["/m/a.srt", "/show/"]);

    await waitFor(() => expect(document.querySelector(".error-notice")).not.toBeNull());
    expect(screen.getByText("a.srt")).toBeInTheDocument();
    expect(within(ledgerGroup("/show/")).getByRole("button", { name: "Remove all 1 items in /show/" })).toBeInTheDocument();
  });
});

describe("the translate run step", () => {
  /** Runnable items only, so every one is selected. */
  function runPlan(cues: number[]): TranslatePlanDto {
    return {
      ...PLAN,
      items: cues.map((cueCount, id) => ({
        id,
        inputName: `f${id + 1}.srt`,
        inputPath: `/m/f${id + 1}.srt`,
        outputPath: `/m/f${id + 1}.zh-TW.srt`,
        cueCount,
        outputExists: false,
        skipReason: null,
      })),
    };
  }

  /** Reaches Step 3 with `cues.length` files, starts the run, and returns a way to push snapshots. */
  async function startRun(cues: number[]) {
    const user = userEvent.setup();
    vi.mocked(api.previewTranslation).mockResolvedValue(runPlan(cues));
    let emit: ((progress: TranslateProgress) => void) | undefined;
    vi.mocked(api.executeTranslation).mockImplementation((_planId, _ids, onProgress) => {
      emit = onProgress;
      return new Promise(() => {});
    });
    renderWizard();
    await reachRun(user);
    await user.click(await within(actionBar()).findByRole("button", { name: "Translate now" }));
    await screen.findByRole("list", { name: "Files in this run" });

    const send = (file: number, extra: Partial<TranslateProgress>) =>
      act(() => {
        emit?.({
          stage: "translating",
          index: file + 1,
          total: cues.length,
          fileName: `f${file + 1}.srt`,
          itemId: file,
          processedCues: 0,
          totalCues: cues[file],
          batchSize: 40,
          batchTotal: Math.ceil(cues[file] / 40),
          batchesDone: 0,
          batchInFlight: 0,
          resend: false,
          outcome: null,
          ...extra,
        });
      });
    return { send };
  }

  function rowOf(position: number): HTMLElement {
    return within(screen.getByRole("list", { name: "Files in this run" })).getAllByRole("listitem")[position];
  }

  function segmentStates(row: HTMLElement): Array<string | undefined> {
    return [...row.querySelectorAll<HTMLElement>(".batch-bar__segment")].map((segment) => segment.dataset.state);
  }

  it("shows a finished, an active and a waiting row", async () => {
    const { send } = await startRun([80, 120, 90]);

    await send(0, { stage: "terminology" });
    await send(0, { batchInFlight: 1 });
    await send(0, { batchesDone: 1, processedCues: 40 });
    await send(0, { batchInFlight: 2, batchesDone: 1, processedCues: 40 });
    await send(0, { batchesDone: 2, processedCues: 80 });
    await send(0, { stage: "fileDone", batchesDone: 2, processedCues: 80, outcome: "translated" });
    await send(1, { stage: "terminology" });
    await send(1, { batchInFlight: 1 });

    expect(rowOf(0)).toHaveTextContent(/✓ Done · 80 cues · \d+:\d\d/);
    expect(rowOf(0).querySelector(".batch-bar")).toBeNull();
    expect(within(rowOf(1)).getByText("Batch 1 of 3")).toBeInTheDocument();
    expect(within(rowOf(1)).getByText("0 / 120 cues")).toBeInTheDocument();
    expect(rowOf(1).querySelector(".batch-bar")).not.toBeNull();
    expect(rowOf(2)).toHaveTextContent("Waiting · 90 cues");
  });

  it("marks a failed file in text and moves on to the next", async () => {
    const { send } = await startRun([80, 120]);

    await send(0, { stage: "terminology" });
    await send(0, { stage: "fileDone", outcome: "failed" });
    await send(1, { stage: "terminology" });

    expect(rowOf(0)).toHaveTextContent(/✕ Failed · 80 cues/);
    expect(screen.getByRole("status")).toHaveTextContent("Translating 2 of 2 · f2.srt · Extracting terminology");
    expect(rowOf(1)).toHaveAttribute("data-status", "active");
    expect(within(rowOf(1)).getByText("Extracting terminology")).toBeInTheDocument();
  });

  it("marks a cancelled file in text", async () => {
    const { send } = await startRun([80, 120]);

    await send(0, { stage: "terminology" });
    await send(0, { stage: "fileDone", outcome: "cancelled" });
    await send(1, { stage: "fileDone", outcome: "cancelled" });
    expect(screen.getByRole("status")).toHaveTextContent("Translating 2 of 2 · f2.srt · Cancelled");
    await send(1, { stage: "finished", itemId: 0, fileName: "" });

    expect(rowOf(0)).toHaveTextContent("Cancelled · 80 cues");
    expect(rowOf(1)).toHaveTextContent("Cancelled · 120 cues");
    expect(screen.getByRole("status")).toHaveTextContent("Every file has been handled.");
    expect(screen.queryByText(/remaining|Estimating/)).not.toBeInTheDocument();
  });

  it("fills returned batches and marks the one in flight", async () => {
    const { send } = await startRun([378]);

    await send(0, { stage: "terminology" });
    await send(0, { batchInFlight: 6, batchesDone: 5, processedCues: 200 });

    expect(segmentStates(rowOf(0))).toEqual([
      "done", "done", "done", "done", "done", "inflight", "empty", "empty", "empty", "empty",
    ]);
  });

  it("marks a resend and announces it", async () => {
    const { send } = await startRun([378]);

    await send(0, { stage: "terminology" });
    await send(0, { batchInFlight: 6, batchesDone: 5, processedCues: 200 });
    await send(0, { batchInFlight: 6, batchesDone: 5, processedCues: 200, resend: true });

    expect(segmentStates(rowOf(0))[5]).toBe("resend");
    expect(screen.getByText("Batch 6 came back with an unknown cue, so it is being sent again.")).toBeInTheDocument();
    expect(within(rowOf(0)).getByText("Resending batch 6 of 10")).toBeInTheDocument();
  });

  it("works out the estimate only once two batches have returned", async () => {
    const now = vi.spyOn(Date, "now");
    try {
      now.mockReturnValue(0);
      const { send } = await startRun([160]);
      await send(0, { stage: "terminology" });
      await send(0, { batchInFlight: 1 });
      now.mockReturnValue(4000);
      await send(0, { batchesDone: 1, processedCues: 40 });
      await send(0, { batchInFlight: 2, batchesDone: 1, processedCues: 40 });

      expect(screen.getByText("Estimating time remaining…")).toBeInTheDocument();

      now.mockReturnValue(8000);
      await send(0, { batchesDone: 2, processedCues: 80 });

      // Two 4 s batches, two left.
      expect(screen.getByText("About 0:08 remaining")).toBeInTheDocument();
    } finally {
      now.mockRestore();
    }
  });

  it("exposes one status line naming the file and batch position, and hides every bar", async () => {
    const { send } = await startRun([400, 120]);

    await send(0, { stage: "terminology" });
    await send(0, { batchInFlight: 6, batchesDone: 5, processedCues: 200 });

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent("Translating 1 of 2 · f1.srt · Batch 6 of 10");
    const bars = document.querySelectorAll(".batch-bar");
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => expect(bar).toHaveAttribute("aria-hidden", "true"));
  });

  it("still fills the returned segment and updates the counter under reduced motion", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const { send } = await startRun([80]);
      await send(0, { stage: "terminology" });
      await send(0, { batchInFlight: 1 });
      await send(0, { batchesDone: 1, processedCues: 40 });

      expect(segmentStates(rowOf(0))).toEqual(["done", "empty"]);
      expect(within(rowOf(0)).getByText("40 / 80 cues")).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("useTranslateWizard source removal", () => {
  it("does not rescan when none of the given sources is listed", async () => {
    const { result } = renderHook(() => useTranslateWizard());
    await act(async () => result.current.addSources(["/a/1.srt"]));

    await act(async () => result.current.removeSources(["/elsewhere.srt"]));

    expect(result.current.sources).toEqual(["/a/1.srt"]);
    expect(api.scanTranslateInputs).toHaveBeenCalledTimes(1);
  });
});

describe("planned translations as file consequences", () => {
  // @covers translate-workflow/planned-translations-render-as-file-consequences#suffix-mode-keeps-the-input-and-creates-the-output
  it("keeps the input and creates the suffixed output in suffix mode", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);
    await screen.findByRole("list", { name: "Planned translations" });

    expect(rowLines("one.srt")).toEqual([
      ["kept", "one.srt"],
      ["created", "/m/one.zh-TW.srt"],
    ]);
  });

  // @covers translate-workflow/planned-translations-render-as-file-consequences#replace-mode-removes-and-re-creates-the-file
  it("removes the input and creates the same path again in replace mode", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);
    await screen.findByRole("list", { name: "Planned translations" });
    vi.mocked(api.previewTranslation).mockResolvedValue({
      ...PLAN,
      outputMode: "replace",
      items: PLAN.items.map((item) => ({ ...item, outputPath: item.inputPath })),
    });

    await user.click(screen.getByRole("radio", { name: "Replace the original file" }));

    await waitFor(() =>
      expect(rowLines("one.srt")).toEqual([
        ["removed", "one.srt"],
        ["created", "/m/one.srt"],
      ]),
    );
  });

  // @covers translate-workflow/planned-translations-render-as-file-consequences#excluded-item-shows-no-created-line
  it("shows an excluded item as its kept input and its reason, with nothing created", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachOptions(user);
    await screen.findByRole("list", { name: "Planned translations" });

    expect(rowLines("broken.srt")).toEqual([["kept", "broken.srt"]]);
    const row = screen.getByRole("checkbox", { name: "Include broken.srt" }).closest("li");
    expect(row).toHaveTextContent("The subtitle file could not be parsed.");
    expect(row?.querySelector('[data-kind="created"]')).toBeNull();
  });
});
