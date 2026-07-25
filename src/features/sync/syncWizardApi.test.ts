import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applySyncOffset,
  cancelSyncDetection,
  detectSyncOffset,
  getSyncDefaults,
} from "./syncWizardApi";

afterEach(() => {
  clearMocks();
});

describe("the sync wizard command wrappers", () => {
  it("reads the sync defaults through get_sync_defaults", async () => {
    const defaults = { defaultMethod: "auto", vadSensitivity: 40, maxOffsetMs: 60_000 };
    mockIPC((command) => {
      if (command === "get_sync_defaults") return defaults;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(getSyncDefaults()).resolves.toEqual(defaults);
  });

  it("sends the pair and the per-run sensitivity to detect_sync_offset", async () => {
    const detection = { offsetMs: 1_500, confidence: 82, warnings: [] };
    const seen = vi.fn();
    mockIPC((command, args) => {
      if (command !== "detect_sync_offset") throw new Error(`unexpected command: ${command}`);
      seen(args);
      return detection;
    });

    await expect(detectSyncOffset("/m/e.mkv", "/m/e.srt", 75)).resolves.toEqual(detection);
    expect(seen).toHaveBeenCalledWith({
      mediaPath: "/m/e.mkv",
      subtitlePath: "/m/e.srt",
      sensitivity: 75,
    });
  });

  it("cancels a running detection", async () => {
    mockIPC((command) => {
      if (command === "cancel_sync_detection") return null;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(cancelSyncDetection()).resolves.toBeUndefined();
  });

  /// A null output path is what asks the backend for the default `_synced`
  /// name, so it must reach the wire rather than being dropped as absent.
  it("applies an offset, forwarding a null output path as-is", async () => {
    const result = { outputPath: "/m/e_synced.srt", overwritten: false };
    const seen = vi.fn();
    mockIPC((command, args) => {
      if (command !== "apply_sync_offset") throw new Error(`unexpected command: ${command}`);
      seen(args);
      return result;
    });

    await expect(applySyncOffset("/m/e.srt", 1_250, null, false)).resolves.toEqual(result);
    expect(seen).toHaveBeenCalledWith({
      subtitlePath: "/m/e.srt",
      offsetMs: 1_250,
      outputPath: null,
      overwrite: false,
    });
  });
});
