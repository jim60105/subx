import { describe, expect, it } from "vitest";

import { baseName, fileKind, parentFolder } from "./fileKind";

describe("baseName", () => {
  it("returns the last segment for either separator", () => {
    expect(baseName("/media/show/ep01.mkv")).toBe("ep01.mkv");
    expect(baseName("C:\\media\\show\\ep01.mkv")).toBe("ep01.mkv");
  });

  it("ignores a trailing separator", () => {
    expect(baseName("/media/season1/")).toBe("season1");
    expect(baseName("C:\\media\\season1\\")).toBe("season1");
  });

  it("falls back to the path when it has no segment", () => {
    expect(baseName("/")).toBe("/");
    expect(baseName("ep01.mkv")).toBe("ep01.mkv");
  });
});

describe("parentFolder", () => {
  it("keeps everything up to and including the last separator", () => {
    expect(parentFolder("/media/show/ep01.mkv")).toBe("/media/show/");
    expect(parentFolder("C:\\media\\ep01.mkv")).toBe("C:\\media\\");
    expect(parentFolder("/a.mkv")).toBe("/");
  });

  it("ignores a trailing separator on a folder", () => {
    expect(parentFolder("/media/season1/")).toBe("/media/");
  });

  it("is empty without a separator", () => {
    expect(parentFolder("ep01.mkv")).toBe("");
    expect(parentFolder("/")).toBe("");
  });
});

describe("fileKind", () => {
  it.each([
    ["/m/ep01.mkv", "video"],
    ["/m/ep01.webm", "video"],
    ["/m/ep01.ass", "subtitle"],
    ["/m/ep01.idx", "subtitle"],
    ["/m/pack.zip", "archive"],
    ["/m/pack.7z", "archive"],
    ["/m/season1", "folder"],
    ["/m/notes.txt", "other"],
  ] as const)("%s is %s", (path, kind) => {
    expect(fileKind(path)).toBe(kind);
  });

  it("ignores the extension's case", () => {
    expect(fileKind("/m/EP01.MKV")).toBe("video");
    expect(fileKind("/m/EP01.SRT")).toBe("subtitle");
    expect(fileKind("/m/PACK.RAR")).toBe("archive");
  });

  it("treats .tar.gz as an archive", () => {
    expect(fileKind("/m/pack.tar.gz")).toBe("archive");
    expect(fileKind("/m/PACK.TAR.GZ")).toBe("archive");
  });

  it("reads Windows paths and trailing separators", () => {
    expect(fileKind("C:\\media\\ep01.mkv")).toBe("video");
    expect(fileKind("C:\\media\\season1\\")).toBe("folder");
    expect(fileKind("/media/season1/")).toBe("folder");
  });

  it("treats a dot-file as having no extension", () => {
    expect(fileKind("/m/.hidden")).toBe("folder");
  });
});
