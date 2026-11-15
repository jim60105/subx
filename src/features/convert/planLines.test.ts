import { describe, expect, it } from "vitest";

import type { ConvertItemDto } from "../../types/ipc";
import { convertItemLines } from "./planLines";

const ITEM: ConvertItemDto = {
  id: 0,
  inputName: "ep01.srt",
  inputPath: "/m/ep01.srt",
  outputPath: "/m/ep01.vtt",
  outputExists: false,
  skipReason: null,
};

describe("convertItemLines", () => {
  it("keeps the input and creates the output while keep-original is on", () => {
    expect(convertItemLines(ITEM, true)).toEqual([
      { kind: "kept", text: "ep01.srt" },
      { kind: "created", text: "/m/ep01.vtt" },
    ]);
  });

  it("removes the input and creates the output while keep-original is off", () => {
    expect(convertItemLines(ITEM, false)).toEqual([
      { kind: "removed", text: "ep01.srt" },
      { kind: "created", text: "/m/ep01.vtt" },
    ]);
  });

  it("shows an excluded item as its kept input only, whatever keep-original says", () => {
    const excluded = { ...ITEM, skipReason: "convert.already_target_format" };
    expect(convertItemLines(excluded, true)).toEqual([{ kind: "kept", text: "ep01.srt" }]);
    expect(convertItemLines(excluded, false)).toEqual([{ kind: "kept", text: "ep01.srt" }]);
  });
});
