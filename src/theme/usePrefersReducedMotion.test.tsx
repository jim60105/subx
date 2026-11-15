import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { setPrefersDark, setPrefersReducedMotion } from "../test/matchMedia";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

describe("usePrefersReducedMotion", () => {
  it("is false when the OS does not ask for reduced motion", () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("is true when the OS asks for reduced motion on first render", () => {
    setPrefersReducedMotion(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("follows a live change of the preference", () => {
    const { result } = renderHook(() => usePrefersReducedMotion());

    act(() => setPrefersReducedMotion(true));
    expect(result.current).toBe(true);

    act(() => setPrefersReducedMotion(false));
    expect(result.current).toBe(false);
  });

  it("ignores a colour-scheme change", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return usePrefersReducedMotion();
    });
    const before = renders;

    act(() => setPrefersDark(true));
    expect(renders).toBe(before);
  });

  it("is false without matchMedia", () => {
    const original = window.matchMedia;
    // Some embedders have no matchMedia at all.
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    try {
      const { result, unmount } = renderHook(() => usePrefersReducedMotion());
      expect(result.current).toBe(false);
      unmount();
    } finally {
      window.matchMedia = original;
    }
  });

  it("renders as false on the server", () => {
    setPrefersReducedMotion(true);
    function Probe() {
      return <span>{String(usePrefersReducedMotion())}</span>;
    }
    expect(renderToString(<Probe />)).toContain("false");
  });
});
