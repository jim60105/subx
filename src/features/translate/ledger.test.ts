import { describe, expect, it } from "vitest";

import type { TranslateScanItemDto, TranslateScanResult } from "../../types/ipc";
import { buildLedger } from "./ledger";

function item(name: string, source: string, cueCount: number, unparsable = false): TranslateScanItemDto {
  return { name, source, cueCount, unparsable };
}

function scanOf(...files: TranslateScanItemDto[]): TranslateScanResult {
  return { files, defaultTargetLanguage: null };
}

describe("buildLedger", () => {
  it("puts directly added files of one folder in one group with a subtotal", () => {
    const sources = ["/m/a.srt", "/m/b.srt"];
    const ledger = buildLedger(sources, scanOf(item("a.srt", "/m/a.srt", 378), item("b.srt", "/m/b.srt", 372)), false);

    expect(ledger.groups).toHaveLength(1);
    const [group] = ledger.groups;
    expect(group).toMatchObject({ kind: "folder", location: "/m/", direct: true, removePaths: sources, cueSubtotal: 750 });
    expect(group.rows.map((row) => [row.name, row.cueCount, row.removePath])).toEqual([
      ["a.srt", 378, "/m/a.srt"],
      ["b.srt", 372, "/m/b.srt"],
    ]);
  });

  it("gives folder and archive sources their own groups, whose rows remove nothing", () => {
    const ledger = buildLedger(
      ["/show/", "/dl/subs.zip"],
      scanOf(item("e1.srt", "/show/", 10), item("x.ass", "/dl/subs.zip", 20), item("y.ass", "/dl/subs.zip", 30)),
      false,
    );

    expect(ledger.groups.map((group) => [group.kind, group.location, group.removePaths, group.cueSubtotal])).toEqual([
      ["folder", "/show/", ["/show/"], 10],
      ["archive", "/dl/subs.zip", ["/dl/subs.zip"], 50],
    ]);
    expect(ledger.groups.flatMap((group) => group.rows.map((row) => row.removePath))).toEqual([null, null, null]);
  });

  it("lists a deduplicated scan item once, in the group of the source it is attributed to", () => {
    const ledger = buildLedger(["/m/a.srt", "/m/"], scanOf(item("a.srt", "/m/a.srt", 5), item("b.srt", "/m/", 6)), false);

    const names = ledger.groups.flatMap((group) => group.rows.map((row) => row.name));
    expect(names).toEqual(["a.srt", "b.srt"]);
    expect(ledger.groups[0]).toMatchObject({ direct: true, location: "/m/" });
    expect(ledger.groups[0].rows[0].removePath).toBe("/m/a.srt");
    expect(ledger.fileCount).toBe(2);
  });

  it("gives a file attributed to no listed source a group with nothing to remove", () => {
    const ledger = buildLedger(["/m/"], scanOf(item("stray.srt", "/elsewhere", 4)), false);

    const fallback = ledger.groups.find((group) => group.location === "/elsewhere");
    expect(fallback).toMatchObject({ kind: "folder", removePaths: [] });
    expect(fallback?.rows[0].removePath).toBeNull();
  });

  it("counts an unparsable file as a file that adds no cues", () => {
    const ledger = buildLedger(
      ["/m/"],
      scanOf(item("good.srt", "/m/", 7), item("broken.srt", "/m/", 0, true)),
      false,
    );

    expect(ledger).toMatchObject({ counted: true, fileCount: 2, cueTotal: 7 });
    expect(ledger.groups[0].rows[1]).toMatchObject({ unparsable: true, cueCount: null });
  });

  it("derives rows from the sources alone while scanning", () => {
    const ledger = buildLedger(["/m/a.srt", "/show/", "/dl/subs.zip"], null, true);

    expect(ledger.counted).toBe(false);
    expect(ledger.groups.map((group) => group.rows.map((row) => [row.name, row.cueCount]))).toEqual([
      [["a.srt", null]],
      [],
      [],
    ]);
  });

  it("ignores a previous scan while a new one runs", () => {
    const ledger = buildLedger(["/m/a.srt"], scanOf(item("a.srt", "/m/a.srt", 5)), true);

    expect(ledger.groups[0].rows).toEqual([
      { key: "/m/a.srt", name: "a.srt", cueCount: null, unparsable: false, removePath: "/m/a.srt" },
    ]);
  });

  it("keeps every group after a failed scan so the sources can still be removed", () => {
    const ledger = buildLedger(["/m/a.srt", "/show/"], null, false);

    expect(ledger.counted).toBe(false);
    expect(ledger.groups.map((group) => group.removePaths)).toEqual([["/m/a.srt"], ["/show/"]]);
  });

  it("keeps a zero-count group for a source that yielded no subtitles", () => {
    const ledger = buildLedger(["/m/a.srt", "/empty/"], scanOf(item("a.srt", "/m/a.srt", 3)), false);

    expect(ledger.groups[1]).toMatchObject({ location: "/empty/", rows: [], cueSubtotal: 0, removePaths: ["/empty/"] });
  });
});
