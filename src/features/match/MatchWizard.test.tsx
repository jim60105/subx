import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, setupI18n } from "../../test/renderWithI18n";
import type { MatchPlanDto, MatchProgress } from "../../types/ipc";
import { MatchWizard } from "./MatchWizard";

vi.mock("./matchWizardApi");
import * as api from "./matchWizardApi";

const PLAN: MatchPlanDto = {
  planId: "plan-1",
  relocationMode: "rename",
  videos: [
    {
      videoName: "show.mkv",
      matches: [
        { id: 0, subtitleName: "show.en.srt", targetPath: "/m/show.en.srt", confidence: 95, reasoning: ["language: en"] },
        { id: 1, subtitleName: "show.tc.srt", targetPath: "/m/show.tc.srt", confidence: 90, reasoning: [] },
      ],
    },
  ],
  unmatchedVideos: ["lonely.mkv"],
  unmatchedSubtitles: ["orphan.srt"],
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

function renderWizard(onOpenSettings: () => void = () => {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MatchWizard onOpenSettings={onOpenSettings} />
    </I18nextProvider>,
  );
}

/** Drives Step 1 up to an enabled Analyze button, then clicks it. */
async function reachAnalysis(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Browse files" }));
  const analyze = await screen.findByRole("button", { name: "Analyze" });
  await waitFor(() => expect(analyze).toBeEnabled());
  await user.click(analyze);
}

beforeEach(async () => {
  await setupI18n("en");
  vi.mocked(api.subscribeToDroppedPaths).mockResolvedValue(() => {});
  vi.mocked(api.pickFiles).mockResolvedValue(["/m/show.mkv"]);
  vi.mocked(api.pickFolder).mockResolvedValue(["/m"]);
  vi.mocked(api.scanSources).mockResolvedValue({ videoCount: 1, subtitleCount: 2 });
  vi.mocked(api.analyzeSources).mockResolvedValue(PLAN);
  vi.mocked(api.cancelAnalysis).mockResolvedValue(undefined);
  vi.mocked(api.executeSelected).mockResolvedValue({
    outcomes: [
      { subtitleName: "show.en.srt", targetPath: "/m/show.en.srt", applied: true, error: null },
    ],
    successCount: 1,
    failureCount: 0,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the match wizard", () => {
  // @covers match-workflow/multi-source-selection-with-scan-preview-and-relocation-mode#insufficient-sources-block-progress
  it("blocks progress until the sources hold both a video and a subtitle", async () => {
    const user = userEvent.setup();
    vi.mocked(api.scanSources).mockResolvedValue({ videoCount: 1, subtitleCount: 0 });
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Browse files" }));

    expect(
      await screen.findByText("Add at least one video and one subtitle to continue."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();
  });

  // @covers match-workflow/cancellable-ai-analysis-with-staged-progress#stages-are-reflected
  it("reflects each analysis stage as its message arrives", async () => {
    const user = userEvent.setup();
    const pending = deferred<MatchPlanDto>();
    let emit: ((progress: MatchProgress) => void) | undefined;
    vi.mocked(api.analyzeSources).mockImplementation((_paths, _mode, onProgress) => {
      emit = onProgress;
      return pending.promise;
    });
    renderWizard();
    await reachAnalysis(user);

    act(() => emit?.({ stage: "analyzing" }));
    const analyzing = screen.getByText("Matching with AI");
    expect(analyzing.closest("li")).toHaveAttribute("data-state", "active");

    act(() => pending.resolve(PLAN));
    // Landing on review confirms the resolved plan advanced the wizard.
    expect(await screen.findByText("Review the matches")).toBeInTheDocument();
  });

  it("returns to Step 1 when the user cancels the analysis", async () => {
    const user = userEvent.setup();
    vi.mocked(api.analyzeSources).mockReturnValue(deferred<MatchPlanDto>().promise);
    renderWizard();
    await reachAnalysis(user);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(api.cancelAnalysis).toHaveBeenCalledOnce();
    expect(await screen.findByText("Choose your sources")).toBeInTheDocument();
  });

  it("ignores an analysis result that resolves after the user cancelled", async () => {
    const user = userEvent.setup();
    const pending = deferred<MatchPlanDto>();
    vi.mocked(api.analyzeSources).mockReturnValue(pending.promise);
    renderWizard();
    await reachAnalysis(user);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Choose your sources")).toBeInTheDocument();

    // The original analysis resolves late; the cancelled generation drops it.
    act(() => pending.resolve(PLAN));
    await Promise.resolve();
    expect(screen.getByText("Choose your sources")).toBeInTheDocument();
    expect(screen.queryByText("Review the matches")).not.toBeInTheDocument();
  });

  it("links a missing-provider failure to the Settings screen", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    vi.mocked(api.analyzeSources).mockRejectedValue({
      code: "match.ai_not_configured",
      message: "no provider",
      hintCode: "match.ai_not_configured.hint",
    });
    renderWizard(onOpenSettings);
    await reachAnalysis(user);

    await user.click(await screen.findByRole("button", { name: "Open settings" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("groups multi-language matches and lists the unmatched files", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachAnalysis(user);

    expect(await screen.findByText("show.mkv")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include show.en.srt" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include show.tc.srt" })).toBeInTheDocument();
    // Set-difference unmatched sections, not AI rejections.
    expect(screen.getByText("lonely.mkv")).toBeInTheDocument();
    expect(screen.getByText("orphan.srt")).toBeInTheDocument();
  });

  it("executes only the operations left selected", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachAnalysis(user);

    // Deselect the second match, then continue and apply.
    await user.click(await screen.findByRole("checkbox", { name: "Include show.tc.srt" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Apply now" }));

    await waitFor(() => expect(api.executeSelected).toHaveBeenCalledWith("plan-1", [0]));
  });

  // @covers match-workflow/checkbox-selection-of-operations#empty-selection-blocks-execution
  it("disables continuing when every operation is deselected", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachAnalysis(user);

    await user.click(await screen.findByRole("checkbox", { name: "Include show.en.srt" }));
    await user.click(screen.getByRole("checkbox", { name: "Include show.tc.srt" }));

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("offers a restart when execution hits a stale plan", async () => {
    const user = userEvent.setup();
    vi.mocked(api.executeSelected).mockRejectedValue({
      code: "match.stale_plan",
      message: "replaced",
      hintCode: "match.stale_plan.hint",
    });
    renderWizard();
    await reachAnalysis(user);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Apply now" }));

    // The stale-plan error surfaces a restart that returns to Step 1.
    await user.click(await screen.findByRole("button", { name: "Finish" }));
    expect(await screen.findByText("Choose your sources")).toBeInTheDocument();
  });

  it("reports each item after a successful run", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachAnalysis(user);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Apply now" }));

    const results = await screen.findByText("Results");
    expect(results).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("feeds the chosen relocation mode into the analysis", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: "Browse files" }));
    await user.click(await screen.findByRole("radio", { name: /Copy to the video/ }));

    const analyze = await screen.findByRole("button", { name: "Analyze" });
    await waitFor(() => expect(analyze).toBeEnabled());
    await user.click(analyze);

    await waitFor(() =>
      expect(api.analyzeSources).toHaveBeenCalledWith(["/m/show.mkv"], "copy", expect.any(Function)),
    );
  });

  it("removes a source and re-gates progress", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: "Browse files" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Analyze" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Remove show.mkv" }));

    expect(screen.getByText("No sources added yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();
  });

  it("shows a failed item without aborting the report", async () => {
    const user = userEvent.setup();
    vi.mocked(api.executeSelected).mockResolvedValue({
      outcomes: [
        { subtitleName: "show.en.srt", targetPath: "/m/show.en.srt", applied: true, error: null },
        {
          subtitleName: "show.tc.srt",
          targetPath: "/m/show.tc.srt",
          applied: false,
          error: { code: "core.file_not_found", message: "gone", hintCode: null },
        },
      ],
      successCount: 1,
      failureCount: 1,
    });
    renderWizard();
    await reachAnalysis(user);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Apply now" }));

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("retries a transient analysis failure without a Settings link", async () => {
    const user = userEvent.setup();
    vi.mocked(api.analyzeSources).mockRejectedValueOnce({
      code: "match.ai_unavailable",
      message: "timeout",
      hintCode: "match.ai_unavailable.hint",
    });
    renderWizard();
    await reachAnalysis(user);

    expect(screen.queryByRole("button", { name: "Open settings" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Try again" }));

    // The retry uses the resolving default mock and reaches review.
    expect(await screen.findByText("Review the matches")).toBeInTheDocument();
    expect(api.analyzeSources).toHaveBeenCalledTimes(2);
  });

  it("steps back from execute to review", async () => {
    const user = userEvent.setup();
    renderWizard();
    await reachAnalysis(user);
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Apply the changes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Review the matches")).toBeInTheDocument();
  });
});
