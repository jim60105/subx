import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "./matchWizardApi";
import { useMatchWizard } from "./useMatchWizard";

vi.mock("./matchWizardApi");

describe("useMatchWizard language selection", () => {
  it("selects every id in a group and clears the group on the next activation", () => {
    const { result } = renderHook(() => useMatchWizard());

    act(() => result.current.toggleLanguageSelection([4, 8]));
    expect(result.current.selectedIds).toEqual(new Set([4, 8]));
    expect(result.current.selectedCount).toBe(2);

    act(() => result.current.toggleLanguageSelection([4, 8]));
    expect(result.current.selectedIds).toEqual(new Set());
    expect(result.current.selectedCount).toBe(0);
  });
});

describe("useMatchWizard source removal", () => {
  beforeEach(() => {
    vi.mocked(api.scanSources).mockReset().mockResolvedValue({ videoCount: 1, subtitleCount: 1 });
  });

  it("removes several sources in one call and rescans once", async () => {
    const { result } = renderHook(() => useMatchWizard());
    await act(async () => result.current.addSources(["/a/1.mkv", "/b/1.ass", "/a/2.mkv"]));
    expect(api.scanSources).toHaveBeenCalledTimes(1);

    await act(async () => result.current.removeSources(["/a/1.mkv", "/a/2.mkv"]));

    expect(result.current.sources).toEqual(["/b/1.ass"]);
    expect(api.scanSources).toHaveBeenCalledTimes(2);
    expect(api.scanSources).toHaveBeenLastCalledWith(["/b/1.ass"]);
  });

  it("does not rescan when none of the given sources is listed", async () => {
    const { result } = renderHook(() => useMatchWizard());
    await act(async () => result.current.addSources(["/a/1.mkv"]));

    await act(async () => result.current.removeSources(["/elsewhere.ass"]));

    expect(result.current.sources).toEqual(["/a/1.mkv"]);
    expect(api.scanSources).toHaveBeenCalledTimes(1);
  });
});
