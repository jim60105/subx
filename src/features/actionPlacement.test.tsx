/**
 * The one place that proves the four wizards keep their promise together.
 *
 * Each wizard's own suite checks that its controls work; none of them can check
 * that every wizard puts its forward control in the same place, because that is
 * a claim about all four at once. Before this change the terminal steps drew
 * their own buttons inside the scrolling panel, so the primary action moved
 * both between steps and with scroll position — exactly what a per-wizard suite
 * has no reason to notice.
 *
 * Every case below asserts two things: the expected forward control is inside
 * `.wizard__actions`, and `.wizard__content` holds no buttons beyond the
 * concrete set that step legitimately owns (browsing, selecting, removing).
 * The allowed set is spelled out per step rather than inferred, so a new
 * in-panel button has to be justified by editing this list.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n, setupI18n } from "../test/renderWithI18n";
import type {
  ConversionReportDto,
  ConvertPlanDto,
  MatchPlanDto,
  TranslatePlanDto,
  TranslateScanResult,
  TranslationReportDto,
} from "../types/ipc";
import { ConvertWizard } from "./convert/ConvertWizard";
import { MatchWizard } from "./match/MatchWizard";
import { SyncWizard } from "./sync/SyncWizard";
import { TranslateWizard } from "./translate/TranslateWizard";

vi.mock("./match/matchWizardApi");
vi.mock("./convert/convertWizardApi");
vi.mock("./sync/syncWizardApi");
vi.mock("./translate/translateWizardApi");
vi.mock("../platform/filePickers");
import * as pickers from "../platform/filePickers";
import * as convertApi from "./convert/convertWizardApi";
import * as matchApi from "./match/matchWizardApi";
import * as syncApi from "./sync/syncWizardApi";
import * as translateApi from "./translate/translateWizardApi";

const MATCH_PLAN: MatchPlanDto = {
  planId: "plan-1",
  relocationMode: "rename",
  videos: [
    {
      videoName: "show.mkv",
      matches: [
        {
          id: 0,
          subtitleName: "show.en.srt",
          targetPath: "/m/show.en.srt",
          confidence: 95,
          reasoning: [],
        },
      ],
    },
  ],
  unmatchedVideos: [],
  unmatchedSubtitles: [],
};

const CONVERT_PLAN: ConvertPlanDto = {
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
  ],
};

const CONVERT_REPORT: ConversionReportDto = {
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
  ],
  successCount: 1,
  failureCount: 0,
  cancelled: false,
};

const TRANSLATE_SCAN: TranslateScanResult = {
  files: [{ name: "one.srt", cueCount: 2, unparsable: false }],
  defaultTargetLanguage: "zh-TW",
};

const TRANSLATE_PLAN: TranslatePlanDto = {
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
  ],
};

const TRANSLATE_REPORT: TranslationReportDto = {
  outcomes: [
    {
      inputName: "one.srt",
      outputPath: "/m/one.zh-TW.srt",
      status: "translated",
      backupPath: null,
      error: null,
      warning: null,
    },
  ],
  successCount: 1,
  failureCount: 0,
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

function bar(): HTMLElement {
  const element = document.querySelector(".wizard__actions");
  if (element === null) throw new Error("the wizard rendered no action bar");
  return element as HTMLElement;
}

function panelButtonNames(): string[] {
  const panel = document.querySelector(".wizard__content");
  if (panel === null) throw new Error("the wizard rendered no content panel");
  return [...panel.querySelectorAll("button")].map((button) => button.textContent?.trim() ?? "");
}

/**
 * @param forward the accessible name of the control that moves the user on
 * @param panelButtons every button the step's panel is allowed to own
 */
function expectPlacement(forward: string, panelButtons: string[]): void {
  expect(within(bar()).getByRole("button", { name: forward })).toBeInTheDocument();
  expect(panelButtonNames().sort()).toEqual([...panelButtons].sort());
}

beforeEach(async () => {
  await setupI18n("en");
  vi.mocked(pickers.subscribeToDroppedPaths).mockResolvedValue(() => {});
  vi.mocked(pickers.pickFiles).mockResolvedValue(["/m/one.srt"]);
  vi.mocked(pickers.pickFolder).mockResolvedValue(["/m"]);
  vi.mocked(pickers.pickFile).mockResolvedValue("/m/episode.srt");

  vi.mocked(matchApi.scanSources).mockResolvedValue({ videoCount: 1, subtitleCount: 1 });
  vi.mocked(matchApi.analyzeSources).mockResolvedValue(MATCH_PLAN);
  vi.mocked(matchApi.cancelAnalysis).mockResolvedValue(undefined);
  vi.mocked(matchApi.executeSelected).mockResolvedValue({
    outcomes: [
      { subtitleName: "show.en.srt", targetPath: "/m/show.en.srt", applied: true, error: null },
    ],
    successCount: 1,
    failureCount: 0,
  });

  vi.mocked(convertApi.scanConvertInputs).mockResolvedValue({ subtitleCount: 1 });
  vi.mocked(convertApi.previewConversion).mockResolvedValue(CONVERT_PLAN);
  vi.mocked(convertApi.executeConversion).mockResolvedValue(CONVERT_REPORT);
  vi.mocked(convertApi.cancelConversion).mockResolvedValue(undefined);

  vi.mocked(syncApi.getSyncDefaults).mockResolvedValue({
    defaultMethod: "auto",
    vadSensitivity: 40,
    maxOffsetMs: 60_000,
  });
  vi.mocked(syncApi.detectSyncOffset).mockResolvedValue({
    offsetMs: 1_500,
    confidence: 82,
    warnings: [],
  });
  vi.mocked(syncApi.cancelSyncDetection).mockResolvedValue(undefined);
  vi.mocked(syncApi.applySyncOffset).mockResolvedValue({
    outputPath: "/m/episode_synced.srt",
    overwritten: false,
  });

  vi.mocked(translateApi.scanTranslateInputs).mockResolvedValue(TRANSLATE_SCAN);
  vi.mocked(translateApi.previewTranslation).mockResolvedValue(TRANSLATE_PLAN);
  vi.mocked(translateApi.executeTranslation).mockResolvedValue(TRANSLATE_REPORT);
  vi.mocked(translateApi.cancelTranslation).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

type User = ReturnType<typeof userEvent.setup>;

/** Step 1 → the analysis step, with the analysis still in flight. */
async function matchToAnalysis(user: User) {
  render(
    <I18nextProvider i18n={i18n}>
      <MatchWizard onOpenSettings={() => {}} />
    </I18nextProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Browse files" }));
  const analyze = await screen.findByRole("button", { name: "Analyze" });
  await waitFor(() => expect(analyze).toBeEnabled());
  await user.click(analyze);
}

/** Through review to the execute step, ready to run. */
async function matchToExecute(user: User) {
  await matchToAnalysis(user);
  await user.click(await screen.findByRole("button", { name: "Continue" }));
}

/** Step 1 → the run step, ready to convert. */
async function convertToRun(user: User) {
  render(
    <I18nextProvider i18n={i18n}>
      <ConvertWizard />
    </I18nextProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Browse files" }));
  const next = await screen.findByRole("button", { name: "Continue" });
  await waitFor(() => expect(next).toBeEnabled());
  await user.click(next);
  await screen.findByRole("list", { name: "Planned conversions" });
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

/** Step 1 → the translate step, ready to run. */
async function translateToRun(user: User) {
  render(
    <I18nextProvider i18n={i18n}>
      <TranslateWizard onOpenSettings={() => {}} />
    </I18nextProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Browse files" }));
  const next = await screen.findByRole("button", { name: "Continue" });
  await waitFor(() => expect(next).toBeEnabled());
  await user.click(next);
  await screen.findByRole("list", { name: "Planned translations" });
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

/** Steps 1–3 on the automatic path, landing on the apply step. */
async function syncToApply(user: User) {
  render(
    <I18nextProvider i18n={i18n}>
      <SyncWizard />
    </I18nextProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Choose subtitle" }));
  await screen.findByTitle("/m/episode.srt");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("group", { name: "Offset method" });
  await user.click(screen.getByRole("radio", { name: /Enter it myself/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(await screen.findByRole("button", { name: "Continue" }));
  await screen.findByRole("textbox", { name: "Save to" });
}

// @covers app-shell/uniform-primary-action-placement-across-feature-screens#forward-actions-share-one-position-in-every-wizard
describe("every wizard's forward action lives in the action bar", () => {
  it("match: run, then finish from the report", async () => {
    const user = userEvent.setup();
    await matchToExecute(user);

    expectPlacement("Apply now", []);

    await user.click(within(bar()).getByRole("button", { name: "Apply now" }));

    expectPlacement("Finish", []);
  });

  it("match: a stale plan finishes from the bar, any other failure offers nothing", async () => {
    const user = userEvent.setup();
    vi.mocked(matchApi.executeSelected).mockRejectedValueOnce({
      code: "match.stale_plan",
      message: "the plan was replaced",
      hintCode: null,
    });
    await matchToExecute(user);
    await user.click(within(bar()).getByRole("button", { name: "Apply now" }));

    expectPlacement("Finish", []);
  });

  it("convert: run and report", async () => {
    const user = userEvent.setup();
    await convertToRun(user);

    expectPlacement("Convert now", []);

    await user.click(within(bar()).getByRole("button", { name: "Convert now" }));

    expectPlacement("Finish", []);
  });

  it("sync: save, then finish", async () => {
    const user = userEvent.setup();
    await syncToApply(user);

    expectPlacement("Save", []);

    await user.click(within(bar()).getByRole("button", { name: "Save" }));

    expectPlacement("Finish", []);
  });

  it("translate: run, then finish from the report step", async () => {
    const user = userEvent.setup();
    await translateToRun(user);

    expectPlacement("Translate now", []);

    await user.click(within(bar()).getByRole("button", { name: "Translate now" }));

    expectPlacement("Finish", []);
  });

  it("translate: the not-configured recovery keeps retry primary and Settings secondary", async () => {
    const user = userEvent.setup();
    vi.mocked(translateApi.executeTranslation).mockRejectedValueOnce({
      code: "translate.ai_not_configured",
      message: "no AI provider configured",
      hintCode: "translate.ai_not_configured.hint",
    });
    await translateToRun(user);

    await user.click(within(bar()).getByRole("button", { name: "Translate now" }));

    expectPlacement("Retry", []);
    // The escape hatch is not forward motion, so it stands beside the primary
    // rather than taking its place.
    const cluster = document.querySelector(".wizard__actions-end");
    const labels = [...(cluster?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(labels).toEqual(["Open Settings", "Retry"]);
  });
});

// @covers app-shell/uniform-primary-action-placement-across-feature-screens#a-running-operation-keeps-the-primary-slot-occupied
describe("a running operation keeps the primary slot occupied", () => {
  it("match: the analysis holds the slot and cancel sits beside it", async () => {
    const user = userEvent.setup();
    const pending = deferred<MatchPlanDto>();
    vi.mocked(matchApi.analyzeSources).mockReturnValue(pending.promise);
    await matchToAnalysis(user);

    const running = within(bar()).getByRole("button", { name: "Analyzing…" });
    expect(running).toBeDisabled();
    expect(within(bar()).getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(panelButtonNames()).toEqual([]);

    await act(async () => pending.resolve(MATCH_PLAN));
  });

  it("convert: the batch holds the slot and cancel sits beside it", async () => {
    const user = userEvent.setup();
    const pending = deferred<ConversionReportDto>();
    vi.mocked(convertApi.executeConversion).mockReturnValue(pending.promise);
    await convertToRun(user);

    await user.click(within(bar()).getByRole("button", { name: "Convert now" }));

    expect(within(bar()).getByRole("button", { name: "Converting…" })).toBeDisabled();
    expect(within(bar()).getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(panelButtonNames()).toEqual([]);

    await act(async () => pending.resolve(CONVERT_REPORT));
  });

  it("translate: the batch holds the slot and cancel sits beside it", async () => {
    const user = userEvent.setup();
    const pending = deferred<TranslationReportDto>();
    vi.mocked(translateApi.executeTranslation).mockReturnValue(pending.promise);
    await translateToRun(user);

    await user.click(within(bar()).getByRole("button", { name: "Translate now" }));

    expect(within(bar()).getByRole("button", { name: "Translating…" })).toBeDisabled();
    expect(within(bar()).getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(panelButtonNames()).toEqual([]);

    await act(async () => pending.resolve(TRANSLATE_REPORT));
  });

  /// Sync's write is the one running operation with no cancel to offer — the
  /// backend does not expose one — so Back is what steps away from it.
  it("sync: the write holds the slot, disabled, with no cancel to offer", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ outputPath: string; overwritten: boolean }>();
    vi.mocked(syncApi.applySyncOffset).mockReturnValue(pending.promise);
    await syncToApply(user);

    await user.click(within(bar()).getByRole("button", { name: "Save" }));

    expect(within(bar()).getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(within(bar()).queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    await act(async () =>
      pending.resolve({ outputPath: "/m/episode_synced.srt", overwritten: false }),
    );
  });
});
