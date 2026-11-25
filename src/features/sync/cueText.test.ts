import { describe, expect, it } from "vitest";

import { plainCueText } from "./cueText";

describe("plainCueText", () => {
  it("removes ASS overrides and HTML-like tags and turns ASS breaks into newlines", () => {
    expect(plainCueText("{\\an8}<i>a</i>\\Nb < c")).toBe("a\nb < c");
  });

  it("handles lower-case breaks, hard spaces and WebVTT timestamps", () => {
    expect(plainCueText("one\\ntwo\\hthree <00:01.000>four")).toBe("one\ntwo three four");
  });

  it("keeps braces without a backslash and a lone angle bracket", () => {
    expect(plainCueText("{note} 3 < 4 > 2")).toBe("{note} 3 < 4 > 2");
  });

  it("trims the result, leaving markup-only text empty", () => {
    expect(plainCueText("  {\\b1}<b></b>  ")).toBe("");
  });

  it("finishes quickly on adversarial input", () => {
    const input = "{\\<a".repeat(25_000);
    expect(input).toHaveLength(100_000);

    const started = performance.now();
    plainCueText(input);
    plainCueText("{\\".repeat(50_000));
    plainCueText("<a".repeat(50_000));

    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
