import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, setupI18n } from "../../test/renderWithI18n";
import type { MatchPlanDto } from "../../types/ipc";
import { ReviewStep } from "./ReviewStep";

const PLAN: MatchPlanDto = {
  planId: "plan-1",
  relocationMode: "rename",
  videos: [
    {
      videoName: "show.mkv",
      matches: [
        { id: 0, subtitleName: "show.tc.srt", targetPath: "/m/show.tc.srt", confidence: 90, language: "tc", reasoning: [] },
        { id: 1, subtitleName: "show.tc-alt.srt", targetPath: "/m/show.tc-alt.srt", confidence: 90, language: "tc", reasoning: [] },
      ],
    },
  ],
  unmatchedVideos: [],
  unmatchedSubtitles: [],
};

function renderReview(plan: MatchPlanDto, selectedIds: Set<number>) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ReviewStep plan={plan} selectedIds={selectedIds} onToggle={() => {}} onToggleLanguage={vi.fn()} />
    </I18nextProvider>,
  );
}

describe("ReviewStep language quick-select", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  it("reports a mixed language group as indeterminate", () => {
    renderReview(PLAN, new Set([0]));

    const bar = screen.getByRole("group", { name: "Quick select by language" });
    expect(within(bar).getByRole("checkbox", { name: "Toggle Traditional Chinese (2 files)" })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
  });

  it("hides the language bar for a plan without operations", () => {
    const emptyPlan: MatchPlanDto = {
      ...PLAN,
      videos: [],
    };
    renderReview(emptyPlan, new Set());

    expect(screen.queryByRole("group", { name: "Quick select by language" })).not.toBeInTheDocument();
  });
});
