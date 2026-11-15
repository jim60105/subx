import { useSyncExternalStore } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function hasMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const list = window.matchMedia(REDUCED_MOTION_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return hasMatchMedia() && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * True while the OS asks for reduced motion; follows live changes. False when
 * `matchMedia` is unavailable.
 *
 * CSS already neutralises animation under the preference; this hook is for
 * components that would otherwise schedule timers, so they can skip them.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
