import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";

import {
  cancelConversion,
  executeConversion,
  previewConversion,
  scanConvertInputs,
} from "./convertWizardApi";

afterEach(() => {
  clearMocks();
});

describe("the convert wizard command wrappers", () => {
  it("scans sources through list_convert_inputs", async () => {
    mockIPC((command) => {
      if (command === "list_convert_inputs") return { subtitleCount: 4 };
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(scanConvertInputs(["/media"])).resolves.toEqual({ subtitleCount: 4 });
  });

  it("previews a conversion and resolves with the plan", async () => {
    const plan = {
      planId: "convert-1",
      targetFormat: "vtt",
      keepOriginal: true,
      items: [],
    };
    mockIPC((command) => {
      if (command === "preview_conversion") return plan;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(
      previewConversion(["/media"], { targetFormat: null, keepOriginal: true }),
    ).resolves.toEqual(plan);
  });

  it("executes a plan and resolves with the report", async () => {
    const report = { outcomes: [], successCount: 0, failureCount: 0, cancelled: false };
    mockIPC((command) => {
      if (command === "execute_conversion") return report;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(executeConversion("convert-1", [0, 1], () => {})).resolves.toEqual(report);
  });

  it("cancels the conversion", async () => {
    mockIPC((command) => {
      if (command === "cancel_conversion") return null;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(cancelConversion()).resolves.toBeUndefined();
  });
});
