import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { installMatchMedia } from "./matchMedia";

// Lets React 18's `act(...)` flush updates in this environment.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  installMatchMedia();
});

afterEach(() => {
  cleanup();
});
