import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, setupI18n } from "../../test/renderWithI18n";
import type { MatchOperationDto, MatchPlanDto } from "../../types/ipc";
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

describe("ReviewStep language names", () => {
  function languagePlan(languages: string[]): MatchPlanDto {
    return {
      ...PLAN,
      videos: [
        {
          videoName: "show.mkv",
          matches: languages.map((language, id) => ({
            id,
            subtitleName: `show.${id}.srt`,
            targetPath: `/m/show.${language}.srt`,
            confidence: 90,
            language,
            reasoning: [],
          })),
        },
      ],
    };
  }

  function languageControl(name: string): HTMLElement {
    const bar = screen.getByRole("group", { name: i18n.t("match:review.languageBarLabel") });
    return within(bar).getByRole("checkbox", { name });
  }

  it.each(["en", "zh-TW"] as const)("names a code without a translated label in %s", async (language) => {
    await setupI18n(language);
    renderReview(languagePlan(["th"]), new Set());

    const thai = new Intl.DisplayNames([language], { type: "language", fallback: "none" }).of("th");
    expect(thai).toBeDefined();
    expect(thai).not.toBe("th");
    expect(
      languageControl(i18n.t("match:review.languageSelection", { language: thai, count: 1 })),
    ).toBeInTheDocument();
  });

  it("names codes the platform cannot name with the code itself", async () => {
    await setupI18n("en");
    renderReview(languagePlan(["qqq", "x_y"]), new Set());

    expect(languageControl("Toggle qqq (1 file)")).toBeInTheDocument();
    expect(languageControl("Toggle x_y (1 file)")).toBeInTheDocument();
  });

  it("keeps the hand-written label for sc", async () => {
    await setupI18n("en");
    renderReview(languagePlan(["sc"]), new Set());

    expect(languageControl("Toggle Simplified Chinese (1 file)")).toBeInTheDocument();
  });
});

function op(id: number, confidence: number, extra: Partial<MatchOperationDto> = {}): MatchOperationDto {
  return {
    id,
    subtitleName: `sub-${id}.srt`,
    targetPath: `/library/out-${id}.srt`,
    confidence,
    language: null,
    reasoning: [],
    ...extra,
  };
}

const LEDGER_PLAN: MatchPlanDto = {
  planId: "plan-ledger",
  relocationMode: "rename",
  videos: [
    { videoName: "alpha.mkv", matches: [op(0, 96, { language: "en" }), op(1, 79, { reasoning: ["Episode number inferred from dialogue."] })] },
    { videoName: "beta.mkv", matches: [op(2, 80, { reasoning: ["Same episode number."] })] },
    { videoName: "gamma.mkv", matches: [op(3, 98)] },
  ],
  unmatchedVideos: ["lonely.mkv"],
  unmatchedSubtitles: ["orphan.srt"],
};

function pairRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-kind="pair"]')];
}

function rowOf(subtitleName: string): HTMLElement {
  const row = screen.getByRole("checkbox", { name: `Include ${subtitleName}` }).closest("li");
  if (row === null) throw new Error(`no row for ${subtitleName}`);
  return row;
}

function filterButton(name: RegExp): HTMLElement {
  return within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name });
}

describe("ReviewStep ledger", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  // @covers match-workflow/review-of-the-match-plan-grouped-by-video#rows-keep-plan-order-regardless-of-confidence
  it("rows keep plan order regardless of confidence", () => {
    const plan: MatchPlanDto = {
      ...LEDGER_PLAN,
      videos: [
        { videoName: "one.mkv", matches: [op(0, 96)] },
        { videoName: "two.mkv", matches: [op(1, 52)] },
        { videoName: "three.mkv", matches: [op(2, 98)] },
      ],
    };
    const { container } = renderReview(plan, new Set([0, 1, 2]));

    const names = pairRows(container).map((row) => row.querySelector(".review-ledger__name")?.textContent);
    expect(names).toEqual(["sub-0.srt", "sub-1.srt", "sub-2.srt"]);
  });

  // @covers match-workflow/review-of-the-match-plan-grouped-by-video#a-repeated-video-name-is-omitted
  it("a repeated video name is omitted", () => {
    const { container } = renderReview(LEDGER_PLAN, new Set());

    const [first, second] = pairRows(container).map((row) => row.querySelector<HTMLElement>(".review-ledger__video"));
    expect(first?.textContent).toBe("alpha.mkv");
    expect(first?.querySelector(".visually-hidden")).toBeNull();
    // Still named for assistive technology, just not shown a second time.
    expect(second?.textContent).toBe("alpha.mkv");
    expect(second?.querySelector(".visually-hidden")?.textContent).toBe("alpha.mkv");
    expect(second?.childElementCount).toBe(1);
  });

  it("shows the subtitle's language tag and the resulting file name", () => {
    renderReview(LEDGER_PLAN, new Set());

    const row = rowOf("sub-0.srt");
    expect(row.querySelector(".review-ledger__lang")?.textContent).toBe("EN");
    expect(row.querySelector(".review-ledger__to")).toHaveTextContent("Will become out-0.srt");
    expect(rowOf("sub-1.srt").querySelector(".review-ledger__lang")).toBeNull();
  });

  // @covers match-workflow/review-of-the-match-plan-grouped-by-video#confidence-is-shown-only-below-the-threshold
  it("confidence is shown only below the threshold", () => {
    renderReview(LEDGER_PLAN, new Set());

    const low = rowOf("sub-1.srt");
    expect(low).toHaveAttribute("data-low", "true");
    expect(low.querySelector(".review-ledger__meter")).not.toBeNull();
    expect(low.querySelectorAll('.review-ledger__meter i[data-on="true"]')).toHaveLength(4);
    expect(within(low).getByText("79% match")).toBeInTheDocument();
    expect(within(low).getByText("Episode number inferred from dialogue.").closest("details")).toBeNull();

    const confident = rowOf("sub-2.srt");
    expect(confident).not.toHaveAttribute("data-low");
    expect(confident.querySelector(".review-ledger__meter")).toBeNull();
    expect(within(confident).queryByText("80% match")).not.toBeInTheDocument();
    expect(within(confident).getByText("Same episode number.").closest("details")).not.toBeNull();
  });

  // @covers match-workflow/review-of-the-match-plan-grouped-by-video#reasoning-of-a-confident-row-is-available-on-demand
  it("reasoning of a confident row is available on demand", async () => {
    const user = userEvent.setup();
    renderReview(LEDGER_PLAN, new Set());

    const details = rowOf("sub-2.srt").querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");

    await user.click(within(details as HTMLElement).getByText("Why this match?"));

    expect(details).toHaveAttribute("open");
    expect(within(details as HTMLElement).getByText("Same episode number.").textContent).toBe("Same episode number.");
  });

  // @covers match-workflow/review-of-the-match-plan-grouped-by-video#unmatched-entries-show-an-empty-slot-on-the-missing-side
  it("unmatched entries show an empty slot on the missing side", () => {
    const { container } = renderReview(LEDGER_PLAN, new Set());

    const items = [...container.querySelectorAll<HTMLElement>(".review-ledger > li")];
    const video = container.querySelector<HTMLElement>('[data-kind="unmatched-video"]');
    const subtitle = container.querySelector<HTMLElement>('[data-kind="unmatched-subtitle"]');
    if (video === null || subtitle === null) throw new Error("unmatched rows are missing");
    const lastPair = Math.max(...pairRows(container).map((row) => items.indexOf(row)));
    expect(items.indexOf(video)).toBeGreaterThan(lastPair);
    expect(items.indexOf(subtitle)).toBeGreaterThan(lastPair);

    for (const row of [video, subtitle]) expect(within(row).queryByRole("checkbox")).toBeNull();
    expect(within(video).getByText("lonely.mkv")).toBeInTheDocument();
    expect(within(video).getByRole("img", { name: "No matching subtitle" })).toBeInTheDocument();
    expect(within(subtitle).getByText("orphan.srt")).toBeInTheDocument();
    expect(within(subtitle).getByRole("img", { name: "No matching video" })).toBeInTheDocument();
  });

  // @covers match-workflow/review-filters-narrow-the-ledger-without-changing-selection#filter-counts-describe-the-whole-plan
  it("filter counts describe the whole plan", () => {
    renderReview(LEDGER_PLAN, new Set());

    expect(filterButton(/^All/)).toHaveTextContent("All 4");
    expect(filterButton(/^Needs review/)).toHaveTextContent("Needs review 1");
    expect(filterButton(/^Unmatched/)).toHaveTextContent("Unmatched 2");
    expect(filterButton(/^All/)).toHaveAttribute("aria-pressed", "true");
  });

  // @covers match-workflow/review-filters-narrow-the-ledger-without-changing-selection#needs-review-filter-shows-only-low-confidence-pairings
  it("needs-review filter shows only low-confidence pairings", async () => {
    const user = userEvent.setup();
    const { container } = renderReview(LEDGER_PLAN, new Set([0, 1, 2, 3]));

    await user.click(filterButton(/^Needs review/));

    expect(filterButton(/^Needs review/)).toHaveAttribute("aria-pressed", "true");
    const rows = [...container.querySelectorAll<HTMLElement>(".review-ledger > li")];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-low", "true");
    // A video's second pairing shown on its own names its video.
    const video = rows[0].querySelector(".review-ledger__video");
    expect(video?.textContent).toBe("alpha.mkv");
    expect(video?.querySelector(".visually-hidden")).toBeNull();
    // The counts still describe the whole plan.
    expect(filterButton(/^All/)).toHaveTextContent("All 4");
  });

  // @covers match-workflow/review-filters-narrow-the-ledger-without-changing-selection#unmatched-filter-shows-only-unmatched-entries
  it("unmatched filter shows only unmatched entries", async () => {
    const user = userEvent.setup();
    const { container } = renderReview(LEDGER_PLAN, new Set());

    await user.click(filterButton(/^Unmatched/));

    const rows = [...container.querySelectorAll<HTMLElement>(".review-ledger > li")];
    expect(rows.map((row) => row.dataset.kind)).toEqual(["unmatched-video", "unmatched-subtitle"]);
    expect(container.querySelector(".review-ledger__section")).toBeNull();
  });

  it("labels the unmatched part of the full ledger once", () => {
    const { container } = renderReview(LEDGER_PLAN, new Set());

    const section = container.querySelectorAll(".review-ledger__section");
    expect(section).toHaveLength(1);
    expect(section[0]).toHaveAttribute("aria-hidden", "true");
    expect(section[0].nextElementSibling).toHaveAttribute("data-kind", "unmatched-video");
  });

  it("explains an empty filter instead of rendering an empty ledger", async () => {
    const user = userEvent.setup();
    const plan: MatchPlanDto = { ...LEDGER_PLAN, videos: [{ videoName: "one.mkv", matches: [op(0, 96)] }], unmatchedVideos: [], unmatchedSubtitles: [] };
    renderReview(plan, new Set([0]));

    await user.click(filterButton(/^Needs review/));

    expect(screen.getByText("Nothing to show for this filter.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Matches" })).not.toBeInTheDocument();
    expect(screen.queryByText("The analysis found no matches.")).not.toBeInTheDocument();
  });

  it("reports a plan without pairings and still lists its unmatched entries", () => {
    renderReview({ ...LEDGER_PLAN, videos: [] }, new Set());

    expect(screen.getByText("The analysis found no matches.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Matches" })).getByText("lonely.mkv")).toBeInTheDocument();
  });

  it("marks a low row without reasoning and toggles a row by its id", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ReviewStep plan={{ ...LEDGER_PLAN, videos: [{ videoName: "one.mkv", matches: [op(7, 10)] }]}} selectedIds={new Set([7])} onToggle={onToggle} onToggleLanguage={vi.fn()} />
      </I18nextProvider>,
    );

    const row = rowOf("sub-7.srt");
    expect(row).toHaveAttribute("data-low", "true");
    expect(row.querySelector(".review-ledger__why")).toBeNull();
    expect(row.querySelectorAll('.review-ledger__meter i[data-on="true"]')).toHaveLength(1);

    await user.click(within(row).getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith(7);
  });
});

describe("ReviewStep whole-row toggle", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderWithToggle(selectedIds = new Set<number>()) {
    const onToggle = vi.fn();
    const view = render(
      <I18nextProvider i18n={i18n}>
        <ReviewStep plan={LEDGER_PLAN} selectedIds={selectedIds} onToggle={onToggle} onToggleLanguage={vi.fn()} />
      </I18nextProvider>,
    );
    return { onToggle, ...view };
  }

  function part(subtitleName: string, selector: string): HTMLElement {
    const element = rowOf(subtitleName).querySelector<HTMLElement>(selector);
    if (element === null) throw new Error(`${selector} is missing in ${subtitleName}`);
    return element;
  }

  it.each([".review-ledger__video", ".review-ledger__name", ".review-ledger__to"])(
    "clicking %s toggles that row once",
    async (selector) => {
      const user = userEvent.setup();
      const { onToggle } = renderWithToggle();

      await user.click(part("sub-0.srt", selector));

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(0);
    },
  );

  it("clicking the checkbox toggles exactly once", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderWithToggle();

    await user.click(screen.getByRole("checkbox", { name: "Include sub-0.srt" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it("pressing Space on the focused checkbox toggles exactly once", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderWithToggle();

    screen.getByRole("checkbox", { name: "Include sub-0.srt" }).focus();
    await user.keyboard(" ");

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it("the disclosure opens and closes without changing selection", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderWithToggle();
    const details = part("sub-2.srt", "details");
    const summary = part("sub-2.srt", "summary");

    await user.click(summary);
    expect(details).toHaveAttribute("open");
    await user.click(summary);
    expect(details).not.toHaveAttribute("open");
    // jsdom does not activate a summary from the keyboard; this is the click
    // a browser synthesizes for Enter or Space on it.
    fireEvent.click(summary);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("clicking reasoning text in a low row toggles it", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderWithToggle();

    await user.click(within(rowOf("sub-1.srt")).getByText("Episode number inferred from dialogue."));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it("clicking revealed reasoning text toggles the row and keeps the disclosure open", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderWithToggle();
    const details = part("sub-2.srt", "details");
    await user.click(part("sub-2.srt", "summary"));

    await user.click(within(details).getByText("Same episode number."));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(2);
    expect(details).toHaveAttribute("open");
  });

  it("a drag that selects text does not toggle", () => {
    const { onToggle } = renderWithToggle();
    const name = part("sub-0.srt", ".review-ledger__name");
    vi.spyOn(window, "getSelection").mockReturnValue({ isCollapsed: false } as Selection);

    fireEvent.mouseDown(name, { clientX: 10 });
    fireEvent.click(name, { clientX: 60 });
    expect(onToggle).not.toHaveBeenCalled();

    fireEvent.mouseDown(name, { clientX: 10 });
    fireEvent.click(name, { clientX: 10 });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("a moved click without a text selection still toggles", () => {
    const { onToggle } = renderWithToggle();
    const name = part("sub-0.srt", ".review-ledger__name");

    fireEvent.mouseDown(name, { clientX: 10 });
    fireEvent.click(name, { clientX: 60 });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("a double click toggles twice", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderWithToggle();

    await user.dblClick(part("sub-0.srt", ".review-ledger__name"));

    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenNthCalledWith(2, 0);
  });

  it("clicking an unmatched row changes nothing", async () => {
    const user = userEvent.setup();
    const { onToggle, container } = renderWithToggle();

    for (const kind of ["unmatched-video", "unmatched-subtitle"]) {
      const row = container.querySelector<HTMLElement>(`[data-kind="${kind}"]`);
      if (row === null) throw new Error(`${kind} row is missing`);
      await user.click(row);
    }

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("the row adds no keyboard stop and keeps the checkbox name", () => {
    renderWithToggle();

    const row = rowOf("sub-0.srt");
    expect(row).not.toHaveAttribute("tabindex");
    expect(row).not.toHaveAttribute("role");
    expect(screen.getByRole("checkbox", { name: "Include sub-0.srt" })).toBeInTheDocument();
  });

  it("a row click flips only that row's checkbox", async () => {
    const user = userEvent.setup();
    function Stateful() {
      const [selected, setSelected] = useState(new Set([0, 1, 2, 3]));
      const toggle = (id: number) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      return <ReviewStep plan={LEDGER_PLAN} selectedIds={selected} onToggle={toggle} onToggleLanguage={vi.fn()} />;
    }
    render(
      <I18nextProvider i18n={i18n}>
        <Stateful />
      </I18nextProvider>,
    );

    await user.click(part("sub-2.srt", ".review-ledger__to"));

    const states = [0, 1, 2, 3].map(
      (id) => (screen.getByRole("checkbox", { name: `Include sub-${id}.srt` }) as HTMLInputElement).checked,
    );
    expect(states).toEqual([true, true, false, true]);
  });
});
