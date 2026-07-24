/**
 * Cross-language checks over the boundary the specs draw between the two
 * halves of the app.
 *
 * `app-shell` requires that swapping the `subx-cli` dependency touches only
 * `src-tauri/`, and `localization` requires that the backend never emits
 * translated text — it emits stable codes the frontend resolves. Both are
 * properties of the whole repository rather than of any one module, so no
 * component test can see them.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import enErrors from "../locales/en/errors.json";
import zhTWErrors from "../locales/zh-TW/errors.json";

const REPO = path.resolve(__dirname, "..", "..");
const FRONTEND = path.join(REPO, "src");
const BACKEND = path.join(REPO, "src-tauri", "src");

/**
 * A Rust file with its `#[cfg(test)]` test module removed.
 *
 * Test fixtures invent codes (`core.test`) that the app can never emit, and
 * demanding translations for them would be nonsense. Only a `#[cfg(test)] mod`
 * is stripped — an unrelated earlier `#[cfg(test)]` on, say, a test-only helper
 * must not drop the production code that follows it (that would hide a real
 * emitted code from the parity check).
 */
function productionSourceOf(file: string): string {
  const source = fs.readFileSync(file, "utf8");
  const testModule = source.search(/#\[cfg\(test\)\]\s*\r?\n\s*mod\b/);
  return testModule === -1 ? source : source.slice(0, testModule);
}

function walk(dir: string, extensions: string[], out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extensions, out);
    else if (extensions.some((extension) => entry.name.endsWith(extension))) out.push(full);
  }
  return out;
}

describe("the crate stays behind the command layer", () => {
  // @covers app-shell/thin-tauri-command-layer-structure#crate-access-is-confined-to-the-command-layer
  it("names subx-cli nowhere outside src-tauri", () => {
    const offenders: string[] = [];

    for (const file of walk(FRONTEND, [".ts", ".tsx", ".css", ".json"])) {
      // Test files legitimately name the crate — this one is scanning for it.
      if (/\.test\.[jt]sx?$/.test(file)) continue;
      fs.readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (/subx[_-]cli/.test(line)) {
            offenders.push(`${path.relative(REPO, file)}:${index + 1} → ${line.trim()}`);
          }
        });
    }

    expect(
      offenders,
      "replacing the crate must require changes to src-tauri only",
    ).toEqual([]);
  });

  it("keeps the crate a direct dependency of the backend alone", () => {
    // The other half of the same property: the frontend's manifest must not
    // depend on anything crate-shaped either. Only the dependency maps are
    // checked — the package description is free to name the product.
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(REPO, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const declaredDeps = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];
    expect(declaredDeps.filter((name) => /subx[_-]cli/.test(name))).toEqual([]);
    expect(fs.readFileSync(path.join(REPO, "src-tauri", "Cargo.toml"), "utf8")).toMatch(
      /subx-cli/,
    );
  });
});

/**
 * Every stable code the Rust sources can emit.
 *
 * Two shapes exist and both are scanned: `core.<category>` codes, built in
 * `error.rs` from the crate's own `category()`, and `config.<field>` codes,
 * built in `commands/config.rs` from the key being written.
 */
function backendErrorCodes(): { codes: Set<string>; hints: Set<string> } {
  const codes = new Set<string>();
  const hints = new Set<string>();

  for (const file of walk(BACKEND, [".rs"])) {
    const source = productionSourceOf(file);

    // Literal codes and hint codes written out in full, e.g.
    // `const CONNECTION_TEST_HINT: &str = "config.connection_test.hint";`
    for (const match of source.matchAll(/"((?:core|config)\.[a-z_]+(?:\.hint)?)"/g)) {
      (match[1].endsWith(".hint") ? hints : codes).add(match[1]);
    }

    // Codes assembled from a suffix, e.g. `format!("config.{suffix}")` fed by a
    // match arm listing `"invalid_provider"`, `"invalid_model"`, ….
    if (/format!\("config\.\{suffix\}"\)/.test(source)) {
      for (const match of source.matchAll(/=>\s*"(invalid_[a-z_]+)"/g)) {
        codes.add(`config.${match[1]}`);
        hints.add(`config.${match[1]}.hint`);
      }
    }
  }

  return { codes, hints };
}

describe("every backend code has translations in both locales", () => {
  const { codes, hints } = backendErrorCodes();

  it("finds the codes the Rust sources actually emit", () => {
    // If the scan silently found nothing, the assertions below would pass while
    // checking nothing at all.
    expect(codes.size).toBeGreaterThanOrEqual(5);
    expect(codes).toContain("config.invalid_url");
    expect(codes).toContain("core.config");
    expect(hints).toContain("config.connection_test.hint");
  });

  // @covers localization/backend-error-codes-are-localized-by-the-frontend#known-error-code
  it.each(["en", "zh-TW"] as const)("%s translates every emitted code", (language) => {
    const resource = language === "en" ? enErrors : zhTWErrors;
    const missing = [...codes].filter((code) => !(code in resource.codes));
    expect(missing, `${language} is missing translations for backend codes`).toEqual([]);
  });

  it.each(["en", "zh-TW"] as const)("%s translates every emitted hint", (language) => {
    const resource = language === "en" ? enErrors : zhTWErrors;
    const missing = [...hints].filter((hint) => !(hint in resource.hints));
    expect(missing, `${language} is missing translations for backend hints`).toEqual([]);
  });

  it("emits no translated prose from the backend at all", () => {
    // The codes are the whole point: a Rust source that ships user-facing
    // Chinese has stopped being translatable by the frontend.
    const offenders: string[] = [];
    for (const file of walk(BACKEND, [".rs"])) {
      productionSourceOf(file)
        .split("\n")
        .forEach((line, index) => {
          if (/[一-鿿]/.test(line)) {
            offenders.push(`${path.relative(REPO, file)}:${index + 1}`);
          }
        });
    }
    expect(offenders, "the backend must emit codes, never translated text").toEqual([]);
  });
});
