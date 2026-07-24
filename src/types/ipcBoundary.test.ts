/**
 * The bypass check.
 *
 * Generated bindings are worth nothing if a feature can still reach the backend
 * by writing the command name as a string. This is the same class of check as
 * the colour-literal and crate-boundary lints: a rule stated in a comment is a
 * rule that decays.
 *
 * The detection is a pure function so it can be proven against fixtures — a
 * lint nobody has watched fail is a lint nobody should trust — and then applied
 * to the real tree.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(__dirname, "../..");
const FRONTEND = path.join(REPO, "src");

/** The generated module is the one place allowed to name commands. */
const GENERATED = path.join(FRONTEND, "types", "bindings.ts");

/**
 * The one place allowed to re-export the `Channel` transport from core.
 *
 * A generated streaming command (`analyze_sources`) takes a `Channel<T>`
 * parameter, and constructing one needs the class from `@tauri-apps/api/core`.
 * That is not reaching the backend by name, so this single bare re-export file
 * is excepted — mirroring how `GENERATED` is the single command-naming site.
 */
const CHANNEL_REEXPORT = path.join(FRONTEND, "types", "channel.ts");

// Assembled at runtime so this file does not match its own detector.
const INVOKE = ["invoke", "__TAURI_INVOKE"].join("|");
const RAW_INVOCATION = new RegExp(`\\b(?:${INVOKE})\\s*(?:<[^>(]*>)?\\s*\\(\\s*["'\`]`);
const CORE_IMPORT = new RegExp(`from\\s+["']@tauri-apps/api/core["']`);

/** Lines that reach the backend without going through the generated bindings. */
export function rawInvocationsIn(source: string): number[] {
  return source
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => RAW_INVOCATION.test(line) || CORE_IMPORT.test(line))
    .map(({ number }) => number);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("the frontend reaches the backend only through the generated bindings", () => {
  // @covers typed-ipc/the-frontend-reaches-the-backend-only-through-the-generated-bindings#a-hand-rolled-invocation-is-rejected
  it("flags a hand-rolled invocation", () => {
    expect(rawInvocationsIn(`const config = await invoke("get_config");`)).toEqual([1]);
    expect(rawInvocationsIn(`return invoke<ConfigDto>("get_config");`)).toEqual([1]);
    expect(rawInvocationsIn(`import { invoke } from "@tauri-apps/api/core";`)).toEqual([1]);
  });

  // @covers typed-ipc/the-frontend-reaches-the-backend-only-through-the-generated-bindings#domain-wrappers-remain-permitted
  it("permits a domain wrapper that calls a generated function", () => {
    const wrapper = [
      `import { commands } from "../../types/bindings";`,
      `export function getConfig(): Promise<ConfigDto> {`,
      `  return commands.getConfig();`,
      `}`,
    ].join("\n");

    expect(rawInvocationsIn(wrapper)).toEqual([]);
  });

  // @covers typed-ipc/the-frontend-reaches-the-backend-only-through-the-generated-bindings#a-hand-rolled-invocation-is-rejected
  it("names no offender in the frontend source", () => {
    const offenders: string[] = [];

    for (const file of walk(FRONTEND)) {
      if (file === GENERATED) continue;
      // The single controlled re-export of the `Channel` transport class.
      if (file === CHANNEL_REEXPORT) continue;
      // This file quotes the very patterns it forbids, in fixtures above.
      if (file === __filename) continue;

      const source = fs.readFileSync(file, "utf8");
      for (const line of rawInvocationsIn(source)) {
        offenders.push(`${path.relative(REPO, file)}:${line}`);
      }
    }

    expect(
      offenders,
      "commands must be reached through src/types/bindings.ts, never by name",
    ).toEqual([]);
  });
});
