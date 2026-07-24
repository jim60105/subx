/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // `scripts/` carries the traceability checker and its tests; without this it
    // would be measured by coverage but never actually run.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Measure every first-party file, even one no test imports, so a new
      // untested module lowers the number instead of vanishing from it.
      all: true,
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
      exclude: [
        // Process entry point: running it *is* starting the app.
        "src/main.tsx",
        // Type-only module — compiles to nothing, so v8 reports 0 of 0.
        "src/navigation/screens.ts",
        // Ambient declarations.
        "src/vite-env.d.ts",
        "scripts/**/*.d.mts",
        // Generated from the Rust definitions and protected by its own drift
        // gate; a bug in it fails `tsc --noEmit`, not a coverage percentage.
        "src/types/bindings.ts",
        // Tests and test helpers are not first-party source.
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/test/**",
        "scripts/**/*.test.ts",
      ],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
}));
