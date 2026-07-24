import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";

// The native pickers and the drag-drop subscription live in modules mockIPC
// does not cover, so they are mocked directly.
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: vi.fn() }));

import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

import {
  analyzeSources,
  cancelAnalysis,
  executeSelected,
  pickFiles,
  pickFolder,
  scanSources,
  subscribeToDroppedPaths,
} from "./matchWizardApi";

afterEach(() => {
  clearMocks();
  vi.clearAllMocks();
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

describe("the native pickers", () => {
  it("returns every chosen file", async () => {
    vi.mocked(open).mockResolvedValue(["/a.mkv", "/b.srt"]);
    await expect(pickFiles()).resolves.toEqual(["/a.mkv", "/b.srt"]);
  });

  it("wraps a single chosen file in an array", async () => {
    vi.mocked(open).mockResolvedValue("/only.srt");
    await expect(pickFiles()).resolves.toEqual(["/only.srt"]);
  });

  it("returns nothing when the file picker is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await expect(pickFiles()).resolves.toEqual([]);
  });

  it("returns the chosen folder", async () => {
    vi.mocked(open).mockResolvedValue("/folder");
    await expect(pickFolder()).resolves.toEqual(["/folder"]);
  });

  it("returns nothing when the folder picker is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await expect(pickFolder()).resolves.toEqual([]);
  });
});

describe("the drag-drop subscription", () => {
  it("forwards dropped paths and ignores other drag events", async () => {
    let handler: ((event: { payload: { type: string; paths?: string[] } }) => void) | undefined;
    const unlisten = vi.fn();
    vi.mocked(getCurrentWebview).mockReturnValue({
      onDragDropEvent: (callback: (event: unknown) => void) => {
        handler = callback as typeof handler;
        return Promise.resolve(unlisten);
      },
    } as unknown as ReturnType<typeof getCurrentWebview>);

    const onPaths = vi.fn();
    const off = await subscribeToDroppedPaths(onPaths);

    handler?.({ payload: { type: "over" } });
    expect(onPaths).not.toHaveBeenCalled();

    handler?.({ payload: { type: "drop", paths: ["/dropped.mkv"] } });
    expect(onPaths).toHaveBeenCalledWith(["/dropped.mkv"]);

    expect(off).toBe(unlisten);
  });
});
