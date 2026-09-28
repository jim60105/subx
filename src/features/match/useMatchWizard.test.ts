import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
