import { describe, expect, it } from "vitest";

import { groupByParent } from "./groupByParent";

describe("groupByParent", () => {
  it("orders groups by first appearance and keeps each group's paths in order", () => {
    expect(groupByParent(["/a/1.mkv", "/b/1.ass", "/a/2.mkv", "/b/2.ass", "/a/3.mkv"])).toEqual([
      { folder: "/a/", paths: ["/a/1.mkv", "/a/2.mkv", "/a/3.mkv"] },
      { folder: "/b/", paths: ["/b/1.ass", "/b/2.ass"] },
    ]);
  });

  it("groups a folder source under its own parent", () => {
    expect(groupByParent(["/m/season1/", "/m/ep.mkv"])).toEqual([
      { folder: "/m/", paths: ["/m/season1/", "/m/ep.mkv"] },
    ]);
  });

  it("returns no groups for no paths", () => {
    expect(groupByParent([])).toEqual([]);
  });
});
