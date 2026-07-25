import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";

import {
  analyzeSources,
  cancelAnalysis,
  executeSelected,
  scanSources,
} from "./matchWizardApi";

afterEach(() => {
  clearMocks();
});

describe("the match wizard command wrappers", () => {
  it("scans sources through list_source_files", async () => {
    mockIPC((command) => {
      if (command === "list_source_files") return { videoCount: 2, subtitleCount: 3 };
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(scanSources(["/media"])).resolves.toEqual({
      videoCount: 2,
      subtitleCount: 3,
    });
  });

  it("starts an analysis and resolves with the plan", async () => {
    const plan = {
      planId: "plan-1",
      relocationMode: "rename",
      videos: [],
      unmatchedVideos: [],
      unmatchedSubtitles: [],
    };
    mockIPC((command) => {
      if (command === "analyze_sources") return plan;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(analyzeSources(["/media"], "rename", () => {})).resolves.toEqual(plan);
  });

  it("cancels the analysis", async () => {
    mockIPC((command) => {
      if (command === "cancel_analysis") return null;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(cancelAnalysis()).resolves.toBeUndefined();
  });

  it("executes the selected operations", async () => {
    const report = { outcomes: [], successCount: 0, failureCount: 0 };
    mockIPC((command) => {
      if (command === "execute_selected") return report;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(executeSelected("plan-1", [0, 2])).resolves.toEqual(report);
  });
});
