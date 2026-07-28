import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";

import {
  cancelTranslation,
  executeTranslation,
  previewTranslation,
  scanTranslateInputs,
} from "./translateWizardApi";

afterEach(() => {
  clearMocks();
});

describe("the translate wizard command wrappers", () => {
  it("scans the sources with paths alone and resolves with the scan result", async () => {
    const scan = {
      files: [{ name: "one.srt", cueCount: 2, unparsable: false }],
      defaultTargetLanguage: "zh-TW",
    };
    mockIPC((command, args) => {
      if (command !== "list_translate_inputs") throw new Error(`unexpected command: ${command}`);
      // No options object crosses the boundary: the plan's target language is
      // not known yet at Step 1, and the scan must not need it.
      expect(args).toEqual({ paths: ["/media"] });
      return scan;
    });

    await expect(scanTranslateInputs(["/media"])).resolves.toEqual(scan);
  });

  it("previews a translation and resolves with the plan", async () => {
    const plan = {
      planId: "translate-1",
      targetLanguage: "zh-TW",
      outputMode: "suffix",
      items: [],
    };
    mockIPC((command) => {
      if (command === "preview_translation") return plan;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(
      previewTranslation(["/media"], {
        targetLanguage: null,
        sourceLanguage: null,
        context: null,
        glossaryText: null,
        outputMode: "suffix",
        overwrite: false,
      }),
    ).resolves.toEqual(plan);
  });

  it("executes a plan and resolves with the report", async () => {
    const report = { outcomes: [], successCount: 0, failureCount: 0, cancelled: false };
    mockIPC((command) => {
      if (command === "execute_translation") return report;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(executeTranslation("translate-1", [0, 1], () => {})).resolves.toEqual(report);
  });

  it("cancels the translation", async () => {
    mockIPC((command) => {
      if (command === "cancel_translation") return null;
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(cancelTranslation()).resolves.toBeUndefined();
  });
});
