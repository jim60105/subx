import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { installMatchMedia } from "./matchMedia";

// Lets React 18's `act(...)` flush updates in this environment.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  // A file that opts into `@vitest-environment node` has no DOM to reset.
  if (typeof window === "undefined") return;
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  installMatchMedia();
});

afterEach(() => {
  cleanup();
});
