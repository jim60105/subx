import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import type {
  ExecutionOutcomeDto,
  ExecutionReportDto,
  MatchOperationDto,
  MatchPlanDto,
  RelocationModeDto,
} from "../../types/ipc";
import { ExecuteStep } from "./ExecuteStep";

function operation(id: number, name: string, target: string): MatchOperationDto {
  return { id, subtitleName: name, targetPath: target, confidence: 90, language: null, reasoning: [] };
}

const PLAN: MatchPlanDto = {
  planId: "plan",
  relocationMode: "rename",
  videos: [
    {
      videoName: "ep01.mkv",
      matches: [
        operation(0, "ep01.tc.srt", "/media/show/Show.S01E01.tc.srt"),
        operation(1, "ep01.en.srt", "/media/show/Show.S01E01.en.srt"),
      ],
    },
    { videoName: "ep02.mkv", matches: [operation(2, "ep02.tc.srt", "/media/show/Show.S01E02.tc.srt")] },
  ],
  unmatchedVideos: [],
  unmatchedSubtitles: [],
};

const ALL = new Set([0, 1, 2]);

function applied(op: MatchOperationDto): ExecutionOutcomeDto {
  return { subtitleName: op.subtitleName, targetPath: op.targetPath, applied: true, error: null };
}

function failed(op: MatchOperationDto, code = "core.file_already_exists"): ExecutionOutcomeDto {
  return {
    subtitleName: op.subtitleName,
    targetPath: op.targetPath,
    applied: false,
    error: { code, message: "raw", hintCode: null },
  };
}

const [EP01_TC, EP01_EN, EP02_TC] = PLAN.videos.flatMap((video) => video.matches);

interface RenderOptions {
  selectedIds?: Set<number>;
  mode?: RelocationModeDto;
  isExecuting?: boolean;
  report?: ExecutionReportDto | null;
}

function renderStep({ selectedIds = ALL, mode = "rename", isExecuting = false, report = null }: RenderOptions = {}) {
  return renderWithI18n(
    <ExecuteStep
      plan={PLAN}
      selectedIds={selectedIds}
      mode={mode}
      isExecuting={isExecuting}
      report={report}
      executeError={undefined}
    />,
  );
}

function rows(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "Operations" })).getAllByRole("listitem");
}

function rowOf(name: string): HTMLElement {
  const row = rows().find((item) => item.textContent?.includes(name));
  if (row === undefined) throw new Error(`no row for ${name}`);
  return row;
}

beforeEach(async () => {
  await setupI18n("en");
});

describe("the execute step before running", () => {
  // @covers match-workflow/execute-step-lists-every-selected-operation-before-running#selected-operations-are-listed-before-running
  it("lists the selected operations under their count and the relocation mode", () => {
    const { container } = renderStep({ selectedIds: new Set([0, 2]) });

    expect(container.querySelector(".execute-step__figure")).toHaveTextContent("2");
    expect(screen.getByRole("status")).toHaveTextContent("2 operations · rename in place");
    const listed = rows();
    expect(listed).toHaveLength(2);
    expect(listed[0]).toHaveTextContent("ep01.tc.srt");
    expect(listed[0]).toHaveTextContent("Show.S01E01.tc.srt");
    expect(listed[1]).toHaveTextContent("ep02.tc.srt");
    expect(listed[1]).toHaveTextContent("Show.S01E02.tc.srt");
    for (const row of listed) expect(row).not.toHaveTextContent("/media/show/");
  });

  // @covers match-workflow/execute-step-lists-every-selected-operation-before-running#deselected-operations-are-absent
  it("omits a deselected operation", () => {
    renderStep({ selectedIds: new Set([0, 2]) });
    expect(screen.queryByText("ep01.en.srt")).toBeNull();
  });

  it("uses the singular label for one operation", () => {
    renderStep({ selectedIds: new Set([1]), mode: "copy" });
    expect(screen.getByRole("status")).toHaveTextContent("1 operation · copy to the video");
  });

  it("exposes no activity indicator while idle", () => {
    const { container } = renderStep();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(container.querySelector(".execute-step")).toHaveAttribute("data-phase", "idle");
  });
});

describe("the execute step while running", () => {
  // @covers match-workflow/execute-step-resolves-each-row-from-the-single-report#running-shows-no-per-row-outcome
  it("shows an indeterminate indicator and no per-row outcome", () => {
    const { container } = renderStep({ isExecuting: true });

    const indicator = screen.getByRole("progressbar", { name: "Applying…" });
    expect(indicator).not.toHaveAttribute("aria-valuenow");
    expect(container.querySelector(".execute-step")).toHaveAttribute("data-phase", "running");
    for (const row of rows()) {
      expect(row).toHaveAttribute("data-status", "pending");
      expect(row.textContent).not.toMatch(/[✓✕]/);
    }
  });
});

describe("the execute step after the report", () => {
  // @covers match-workflow/execute-step-resolves-each-row-from-the-single-report#a-successful-row-resolves-as-removed-and-created
  it.each(["rename", "move"] as const)("resolves a success as removed and created under %s", (mode) => {
    renderStep({
      selectedIds: new Set([0]),
      mode,
      report: { outcomes: [applied(EP01_TC)], successCount: 1, failureCount: 0 },
    });

    const row = rowOf("ep01.tc.srt");
    expect(row).toHaveAttribute("data-status", "ok");
    expect(row.querySelector('[data-kind="removed"]')).toHaveTextContent("ep01.tc.srt");
    expect(row.querySelector('[data-kind="created"]')).toHaveTextContent("Show.S01E01.tc.srt");
    expect(within(row).getByText("Done")).toHaveClass("visually-hidden");
    expect(row).toHaveTextContent("✓");
  });

  // @covers match-workflow/execute-step-resolves-each-row-from-the-single-report#a-successful-copy-keeps-the-original
  it("keeps the original of a successful copy", () => {
    renderStep({
      selectedIds: new Set([0]),
      mode: "copy",
      report: { outcomes: [applied(EP01_TC)], successCount: 1, failureCount: 0 },
    });

    const row = rowOf("ep01.tc.srt");
    expect(row.querySelector('[data-kind="kept"]')).toHaveTextContent("ep01.tc.srt");
    expect(row.querySelector('[data-kind="removed"]')).toBeNull();
    expect(row.querySelector('[data-kind="created"]')).toHaveTextContent("Show.S01E01.tc.srt");
  });

  // @covers match-workflow/execute-step-resolves-each-row-from-the-single-report#a-failed-row-shows-its-error-beneath-it
  it("shows a failure's localized error inside its row and keeps the other outcomes", () => {
    renderStep({
      report: { outcomes: [applied(EP01_TC), failed(EP01_EN), applied(EP02_TC)], successCount: 2, failureCount: 1 },
    });

    const bad = rowOf("ep01.en.srt");
    expect(bad).toHaveAttribute("data-status", "failed");
    expect(within(bad).getByText("A file with the target name already exists.")).toBeInTheDocument();
    expect(within(bad).getByText("Failed")).toHaveClass("visually-hidden");
    expect(bad).toHaveTextContent("✕");
    expect(bad.querySelector("[data-kind]")).toBeNull();
    expect(rowOf("ep01.tc.srt")).toHaveAttribute("data-status", "ok");
    expect(rowOf("ep02.tc.srt")).toHaveAttribute("data-status", "ok");
  });

  // @covers match-workflow/execute-step-resolves-each-row-from-the-single-report#totals-count-successes-and-failures
  it("shows the success and failure totals in place of the pre-run count", () => {
    const { container } = renderStep({
      report: { outcomes: [applied(EP01_TC), failed(EP01_EN), applied(EP02_TC)], successCount: 2, failureCount: 1 },
    });

    const success = container.querySelector('[data-result="success"]');
    const failure = container.querySelector('[data-result="failure"]');
    expect(success?.querySelector(".execute-step__figure")).toHaveTextContent(/^2$/);
    expect(success).toHaveTextContent("2 succeeded");
    expect(failure?.querySelector(".execute-step__figure")).toHaveTextContent(/^1$/);
    expect(failure).toHaveTextContent("1 failed");
    expect(screen.queryByText(/operations ·/)).toBeNull();
    expect(container.querySelector(".execute-step")).toHaveAttribute("data-phase", "done");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows an unapplied outcome without an error neutrally, never as a failure", () => {
    renderStep({
      selectedIds: new Set([2]),
      report: {
        outcomes: [{ subtitleName: "ep02.tc.srt", targetPath: EP02_TC.targetPath, applied: false, error: null }],
        successCount: 0,
        failureCount: 0,
      },
    });

    const row = rowOf("ep02.tc.srt");
    expect(row).toHaveAttribute("data-status", "skipped");
    expect(row.textContent).not.toMatch(/[✓✕]/);
    expect(within(row).queryByText("Failed")).toBeNull();
    expect(within(row).queryByText("Done")).toBeNull();
  });

  it("staggers the reveal by each row's position", () => {
    renderStep({
      report: { outcomes: [applied(EP01_TC), applied(EP01_EN), applied(EP02_TC)], successCount: 3, failureCount: 0 },
    });
    expect(rows().map((row) => row.style.getPropertyValue("--row"))).toEqual(["0", "1", "2"]);
  });

  it("shows an execution error above the list", () => {
    renderWithI18n(
      <ExecuteStep
        plan={PLAN}
        selectedIds={ALL}
        mode="rename"
        isExecuting={false}
        report={null}
        executeError={{ code: "core.file_not_found", message: "raw", hintCode: null }}
      />,
    );
    expect(screen.getByText("The file could not be found.")).toBeInTheDocument();
  });
});
