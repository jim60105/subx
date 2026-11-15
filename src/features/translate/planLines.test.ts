import { describe, expect, it } from "vitest";

import type { TranslateItemDto } from "../../types/ipc";
import { translateItemLines } from "./planLines";

const ITEM: TranslateItemDto = {
  id: 0,
  inputName: "ep01.srt",
  inputPath: "/m/ep01.srt",
  outputPath: "/m/ep01.zh-TW.srt",
  cueCount: 12,
  outputExists: false,
  skipReason: null,
};

describe("translateItemLines", () => {
  it("keeps the input and creates the suffixed output in suffix mode", () => {
    expect(translateItemLines(ITEM, "suffix")).toEqual([
      { kind: "kept", text: "ep01.srt" },
      { kind: "created", text: "/m/ep01.zh-TW.srt" },
    ]);
  });

  it("removes the input and creates the same path again in replace mode", () => {
    const replaced = { ...ITEM, outputPath: "/m/ep01.srt" };
    expect(translateItemLines(replaced, "replace")).toEqual([
      { kind: "removed", text: "ep01.srt" },
      { kind: "created", text: "/m/ep01.srt" },
    ]);
  });

  it("shows an excluded item as its kept input only, in either mode", () => {
    const excluded = { ...ITEM, skipReason: "translate.output_exists" };
    expect(translateItemLines(excluded, "suffix")).toEqual([{ kind: "kept", text: "ep01.srt" }]);
    expect(translateItemLines(excluded, "replace")).toEqual([{ kind: "kept", text: "ep01.srt" }]);
  });
});
