/**
 * The one piece of the IPC surface a type generator cannot produce.
 *
 * Commands reject rather than resolving with a tagged result, and TypeScript
 * types no `catch` binding — so this guard is where an unknown rejection
 * becomes the generated `ErrorDto` again. It is the only runtime narrowing in
 * the frontend, which is why it is tested on its own rather than only through
 * the screens that use it.
 */

import { describe, expect, it } from "vitest";
import { isErrorDto } from "./ipc";
import type { ErrorDto } from "./ipc";

describe("the runtime error guard", () => {
  // @covers typed-ipc/the-runtime-error-guard-survives-generation#an-unknown-rejection-is-narrowed
  it("narrows a structured rejection to the generated type", () => {
    const rejection: unknown = {
      code: "config.invalid_url",
      message: "not a url",
      hintCode: "config.invalid_url.hint",
    };

    expect(isErrorDto(rejection)).toBe(true);
    if (isErrorDto(rejection)) {
      // Reached only if the narrowing compiles against the generated type.
      const narrowed: ErrorDto = rejection;
      expect(narrowed.code).toBe("config.invalid_url");
    }
  });

  // @covers typed-ipc/the-runtime-error-guard-survives-generation#an-unknown-rejection-is-narrowed
  it("rejects anything that is not one, so the caller can fall back", () => {
    // A transport failure, a thrown string, and near-misses that would make the
    // guard useless if it accepted them.
    expect(isErrorDto(new Error("network down"))).toBe(false);
    expect(isErrorDto("core.internal")).toBe(false);
    expect(isErrorDto(null)).toBe(false);
    expect(isErrorDto(undefined)).toBe(false);
    expect(isErrorDto({ code: "core.internal" })).toBe(false);
    expect(isErrorDto({ message: "no code" })).toBe(false);
    expect(isErrorDto({ code: 42, message: "code is not a string" })).toBe(false);
  });

  // @covers typed-ipc/the-runtime-error-guard-survives-generation#an-unknown-rejection-is-narrowed
  it("holds the narrowing to the generated shape, hintCode included", () => {
    // `hintCode` is declared `string | null` — present, possibly null. Accepting
    // a value without the key would narrow to a shape the value does not have.
    expect(isErrorDto({ code: "core.internal", message: "detail" })).toBe(false);
    expect(isErrorDto({ code: "core.internal", message: "detail", hintCode: null })).toBe(true);
    expect(
      isErrorDto({ code: "core.internal", message: "detail", hintCode: "core.internal.hint" }),
    ).toBe(true);
    expect(isErrorDto({ code: "core.internal", message: "detail", hintCode: 7 })).toBe(false);
  });
});
